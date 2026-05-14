import Anthropic from "@anthropic-ai/sdk";
import { client, MODEL, SYSTEM } from "./config.js";
import { createToolRuntime, getTools } from "./tools/index.js";

export type AgentLoopStopReason =
  | Anthropic.Messages.Message["stop_reason"]
  | "max_turns"
  | "timeout";
export type AgentLoopOptions = {
  maxTurns?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  enableTodoReminder?: boolean;
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
  options?: AgentLoopOptions,
): Promise<{
  stopReason: AgentLoopStopReason;
  content: Anthropic.Messages.Message["content"];
}> {
  const maxTurns =
    positiveIntegerOrUndefined(options?.maxTurns, "maxTurns") ??
    DEFAULT_MAIN_AGENT_MAX_TURNS;
  const timeoutMs = positiveIntegerOrUndefined(options?.timeoutMs, "timeoutMs");
  const deadlineAt = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
  const enableTodoReminder = options?.enableTodoReminder ?? true;
  const allowedTools = options?.allowedTools;
  const tools = allowedTools
    ? getTools().filter((t) => allowedTools.includes(t.name))
    : getTools();
  const toolRuntime = createToolRuntime();
  const timedOut = () => ({
    stopReason: "timeout" as const,
    content: stopContent(`Stopped: reached timeout (${timeoutMs}ms).`),
  });
  let roundsSinceTodo = 0;
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

      turns += 1;
      const response = await withDeadline(
        client.messages.create(
          {
            model: MODEL as Anthropic.Model,
            system: SYSTEM,
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
      let usedTodo = false;
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        assertNotTimedOut(deadlineAt);
        console.log(`\x1b[33mtool: ${block.name}\x1b[0m`);
        const output = await withDeadline(
          toolRuntime.invokeTool(block.name, block.input),
          deadlineAt,
        );
        console.log(output.slice(0, 200));
        results.push({ type: "tool_result", tool_use_id: block.id, content: output });
        if (block.name === "todo") usedTodo = true;
      }
      roundsSinceTodo = usedTodo ? 0 : roundsSinceTodo + 1;
      if (enableTodoReminder && roundsSinceTodo >= 3) {
        results.push({ type: "text", text: "<reminder>Update your todos.</reminder>" });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    if (isAgentLoopTimeout(error, deadlineAt)) return timedOut();
    throw error;
  }
}
