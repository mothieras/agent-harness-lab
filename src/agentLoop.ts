import Anthropic from "@anthropic-ai/sdk";
import { client, MODEL } from "./config.js";
import { autoCompactIfNeeded, microCompact } from "./contextCompact.js";
import { getTools } from "./tools/index.js";
import type { ToolRuntime } from "./tools/toolRuntime.js";

export type AgentLoopStopReason =
  | Anthropic.Messages.Message["stop_reason"]
  | "max_turns"
  | "timeout";

export type AgentLoopOptions = {
  maxTurns?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  enableTodoReminder?: boolean;
  system?: string;
  onToolResult?: (
    name: string,
    input: Record<string, unknown>,
    output: string,
  ) => void;
  runSubAgent?: (
    prompt: string,
    options?: { maxTurns?: number; timeoutMs?: number },
  ) => Promise<string>;
};

export const DEFAULT_MAIN_AGENT_MAX_TURNS = 200;
export const DEFAULT_SUB_AGENT_MAX_TURNS = 90;
export const DEFAULT_SUB_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

class AgentLoopTimeoutError extends Error {
  constructor() {
    super("Agent loop timed out");
  }
}

function positiveIntegerOrUndefined(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Agent loop ${name} must be a positive integer.`);
  }
  return value;
}

function stopContent(text: string): Anthropic.Messages.Message["content"] {
  return [{ type: "text", text, citations: null }];
}

function remainingMs(deadlineAt: number | undefined): number | undefined {
  if (deadlineAt === undefined) return undefined;
  return deadlineAt - Date.now();
}

function assertNotTimedOut(deadlineAt: number | undefined): void {
  const remaining = remainingMs(deadlineAt);
  if (remaining !== undefined && remaining <= 0) {
    throw new AgentLoopTimeoutError();
  }
}

function isAgentLoopTimeout(
  error: unknown,
  deadlineAt: number | undefined,
): boolean {
  if (error instanceof AgentLoopTimeoutError) return true;
  const remaining = remainingMs(deadlineAt);
  return remaining !== undefined && remaining <= 0;
}

function requestTimeoutOptions(
  deadlineAt: number | undefined,
): { timeout: number } | undefined {
  const remaining = remainingMs(deadlineAt);
  if (remaining === undefined) return undefined;
  if (remaining <= 0) throw new AgentLoopTimeoutError();
  return { timeout: remaining };
}

async function withDeadline<T>(
  promise: Promise<T>,
  deadlineAt: number | undefined,
): Promise<T> {
  const remaining = remainingMs(deadlineAt);
  if (remaining === undefined) return promise;
  if (remaining <= 0) throw new AgentLoopTimeoutError();

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentLoopTimeoutError()), remaining);
    timer.unref();
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function agentLoop(
  messages: Anthropic.Messages.MessageParam[],
  toolRuntime: ToolRuntime,
  options?: AgentLoopOptions,
): Promise<{
  stopReason: AgentLoopStopReason;
  content: Anthropic.Messages.Message["content"];
}> {
  const maxTurns =
    positiveIntegerOrUndefined(options?.maxTurns, "maxTurns") ??
    DEFAULT_MAIN_AGENT_MAX_TURNS;
  const timeoutMs = positiveIntegerOrUndefined(options?.timeoutMs, "timeoutMs");
  const deadlineAt =
    timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
  const enableTodoReminder = options?.enableTodoReminder ?? true;
  const allowedTools = options?.allowedTools;
  const tools = allowedTools
    ? getTools().filter((t) => allowedTools.includes(t.name))
    : getTools();
  const system =
    options?.system ??
    `You are a coding agent at ${process.cwd()}. Use tools to solve tasks.`;
  const timedOut = () => ({
    stopReason: "timeout" as const,
    content: stopContent(`Stopped: reached timeout (${timeoutMs}ms).`),
  });
  let roundsSinceTodo = 0;
  let showTaskStatus = true; // show on first turn, then only after task changes
  let taskToolUsed = false;
  let turns = 0;

  try {
    while (true) {
      if (turns >= maxTurns) {
        return {
          stopReason: "max_turns",
          content: stopContent(`Stopped: reached max turns (${maxTurns}).`),
        };
      }
      assertNotTimedOut(deadlineAt);

      microCompact(messages);
      await withDeadline(autoCompactIfNeeded(messages), deadlineAt);
      turns += 1;

      // Inject task status when first entering or after a task was modified
      if (showTaskStatus) {
        const taskSummary = toolRuntime.taskSummary();
        if (taskSummary) {
          messages.push({
            role: "user",
            content: `<task-status>\n${taskSummary}\n</task-status>`,
          });
        }
        showTaskStatus = false;
      }

      const bgNotif = toolRuntime.drainBackgroundNotifications();
      if (bgNotif) {
        messages.push({
          role: "user",
          content: `<background-results>\n${bgNotif}\n</background-results>`,
        });
      }

      const response = await withDeadline(
        client.messages.create(
          {
            model: MODEL as Anthropic.Model,
            system,
            tools,
            messages,
            max_tokens: 8000,
            stream: false,
          },
          requestTimeoutOptions(deadlineAt),
        ),
        deadlineAt,
      );

      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "tool_use") {
        return { stopReason: response.stop_reason, content: response.content };
      }

      const results: Array<
        | { type: "tool_result"; tool_use_id: string; content: string }
        | { type: "text"; text: string }
      > = [];
      let usedTaskTool = false;
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        assertNotTimedOut(deadlineAt);

        // Handle orchestration-level tools here instead of in toolRuntime
        let output: string;
        if (block.name === "task" && options?.runSubAgent) {
          const input = block.input as Record<string, unknown>;
          const prompt = String(input.prompt ?? "");
          if (!prompt.trim()) {
            output = "Error: Missing required 'prompt' for task tool.";
          } else {
            const subOpts: { maxTurns?: number; timeoutMs?: number } = {};
            const mt = input.max_turns;
            if (typeof mt === "number" && Number.isInteger(mt)) subOpts.maxTurns = mt;
            const to = input.timeout_ms;
            if (typeof to === "number" && Number.isInteger(to)) subOpts.timeoutMs = to;
            try {
              output = await withDeadline(
                options.runSubAgent(prompt, subOpts),
                deadlineAt,
              );
            } catch (error) {
              output = `Error: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        } else {
          output = await withDeadline(
            toolRuntime.invokeTool(block.name, block.input),
            deadlineAt,
          );
        }

        options?.onToolResult?.(
          block.name,
          block.input as Record<string, unknown>,
          output,
        );
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
        if (block.name === "task_create" || block.name === "task_update") {
          usedTaskTool = true;
          taskToolUsed = true;
          showTaskStatus = true; // next turn shows updated task list
        }
      }

      if (taskToolUsed) {
        roundsSinceTodo = usedTaskTool ? 0 : roundsSinceTodo + 1;

        if (enableTodoReminder && roundsSinceTodo >= 3) {
          if (toolRuntime.hasActiveTasks()) {
            results.push({
              type: "text", 
              text: "<reminder>Update your tasks with task_update or task_list.</reminder>",
            });
            roundsSinceTodo = 0;
          } else {
            roundsSinceTodo = 0;
            taskToolUsed = false; // all done, stop checking disk
          }
        }
      }
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    if (isAgentLoopTimeout(error, deadlineAt)) return timedOut();
    throw error;
  }
}
