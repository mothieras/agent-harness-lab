import Anthropic from "@anthropic-ai/sdk";
import {
  anthropicRequestTimeoutOptions,
  awaitWithDeadline,
  isDeadlineError,
  throwIfDeadlineExpired,
} from "./deadline.js";
import {
  normalizeAgentLoopOptions,
  DEFAULT_MAIN_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_TIMEOUT_MS,
} from "./options.js";
import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentLoopStopReason,
} from "./options.js";
import { client, MODEL } from "../config.js";
import { autoCompactIfNeeded, microCompact } from "./contextCompact.js";
import type { ToolRuntime } from "../tools/toolRuntime.js";

export type { AgentLoopOptions, AgentLoopResult, AgentLoopStopReason };
export {
  DEFAULT_MAIN_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_TIMEOUT_MS,
};

function stopContent(text: string): Anthropic.Messages.Message["content"] {
  return [{ type: "text", text, citations: null }];
}

export async function agentLoop(
  messages: Anthropic.Messages.MessageParam[],
  toolRuntime: ToolRuntime,
  options?: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const loopOptions = normalizeAgentLoopOptions(options);
  const timedOut = () => ({
    stopReason: "timeout" as const,
    content: stopContent(
      `Stopped: reached timeout (${loopOptions.timeoutMs}ms).`,
    ),
  });
  let turns = 0;

  try {
    loopOptions.hooks?.trigger("LoopStart", messages);

    while (true) {
      if (turns >= loopOptions.maxTurns) {
        return {
          stopReason: "max_turns",
          content: stopContent(
            `Stopped: reached max turns (${loopOptions.maxTurns}).`,
          ),
        };
      }
      throwIfDeadlineExpired(loopOptions.deadlineAt);

      microCompact(messages);
      await awaitWithDeadline(
        autoCompactIfNeeded(messages, loopOptions.workspaceRoot),
        loopOptions.deadlineAt,
      );
      turns += 1;

      loopOptions.hooks?.trigger("UserPromptSubmit", messages);

      const response = await awaitWithDeadline(
        client.messages.create(
          {
            model: MODEL as Anthropic.Model,
            system: loopOptions.system,
            tools: loopOptions.tools,
            messages,
            max_tokens: 8000,
            stream: false,
          },
          anthropicRequestTimeoutOptions(loopOptions.deadlineAt),
        ),
        loopOptions.deadlineAt,
      );
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "tool_use") {
        const forceContinue = loopOptions.hooks?.trigger("Stop", messages);
        if (forceContinue) {
          messages.push({ role: "user", content: forceContinue });
          continue;
        }
        return { stopReason: response.stop_reason, content: response.content };
      }

      const results: Array<
        | { type: "tool_result"; tool_use_id: string; content: string }
        | { type: "text"; text: string }
      > = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        throwIfDeadlineExpired(loopOptions.deadlineAt);

        // Tool execution gating: PreToolUse hooks run first (can block entirely,
        // skipping permission), then the optional permission pipeline (deny list →
        // rule matching → user approval). A PreToolUse hook that blocks bypasses
        // permission — useful for administrative blocks, not user prompts.
        const blocked = loopOptions.hooks?.trigger("PreToolUse", block);
        if (blocked) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: blocked,
          });
          continue;
        }

        if (loopOptions.checkPermission) {
          const permResult = await awaitWithDeadline(
            loopOptions.checkPermission(
              block.name,
              block.input as Record<string, unknown>,
            ),
            loopOptions.deadlineAt,
          );
          if (!permResult.allowed) {
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Permission denied: ${
                permResult.reason ?? "blocked by permission check"
              }`,
            });
            continue;
          }
        }

        let output: string;
        output = await awaitWithDeadline(
          toolRuntime.invokeTool(block.name, block.input),
          loopOptions.deadlineAt,
        );

        loopOptions.hooks?.trigger("PostToolUse", block, output);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      }

      const extraResult = loopOptions.hooks?.trigger("ToolResultsReady", results);
      if (extraResult) {
        results.push({ type: "text", text: extraResult });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    if (isDeadlineError(error, loopOptions.deadlineAt)) return timedOut();
    throw error;
  }
}
