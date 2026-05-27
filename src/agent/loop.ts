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
import { client, getFallbackModel, MODEL } from "../config.js";
import { autoCompactIfNeeded, forceCompact, microCompact } from "./contextCompact.js";
import type { ToolRuntime } from "../tools/toolRuntime.js";
import {
  decideRecovery,
  initialRecoveryState,
  CONTINUATION_PROMPT,
  DEFAULT_MAX_TOKENS,
} from "./errorRecovery.js";
import type { LLMOutcome } from "./errorRecovery.js";

export type { AgentLoopOptions, AgentLoopResult, AgentLoopStopReason };
export {
  DEFAULT_MAIN_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_TIMEOUT_MS,
};

function stopContent(text: string): Anthropic.Messages.Message["content"] {
  return [{ type: "text", text, citations: null }];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatRuntimeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? `${e.code}: ` : "";
    const message =
      typeof e.message === "string" ? e.message : JSON.stringify(error);
    return `${code}${message}`;
  }
  return String(error);
}

function requireSuccessOutcome(
  outcome: LLMOutcome,
  actionType: string,
): Anthropic.Messages.Message | { error: string } {
  if (outcome.kind === "success") return outcome.response;
  return {
    error: `Internal recovery error: action '${actionType}' requires a successful model response.`,
  };
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
  let recoveryState = initialRecoveryState();
  let maxTokens = DEFAULT_MAX_TOKENS;
  let activeModel = MODEL;

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

      loopOptions.hooks?.trigger("UserPromptSubmit", messages);

      // ── LLM call — outcome capture for recovery decision ──
      let outcome: LLMOutcome;
      try {
        const response = await awaitWithDeadline(
          client.messages.create(
            {
              model: activeModel as Anthropic.Model,
              system: loopOptions.system,
              tools: loopOptions.tools,
              messages,
              max_tokens: maxTokens,
              stream: false,
            },
            anthropicRequestTimeoutOptions(loopOptions.deadlineAt),
          ),
          loopOptions.deadlineAt,
        );
        outcome = { kind: "success", response };
      } catch (error) {
        if (isDeadlineError(error, loopOptions.deadlineAt)) return timedOut();
        outcome = { kind: "error", error };
      }

      const fallbackModel = getFallbackModel();
      const action = decideRecovery(
        outcome,
        recoveryState,
        fallbackModel ? { fallbackModel } : {},
      );

      switch (action.type) {
        case "none": {
          const response = requireSuccessOutcome(outcome, action.type);
          if ("error" in response) {
            return {
              stopReason: "error",
              content: stopContent(response.error),
            };
          }
          recoveryState = initialRecoveryState();
          maxTokens = DEFAULT_MAX_TOKENS;
          break;
        }
        case "retry": {
          maxTokens = action.maxTokens;
          recoveryState = action.nextState;
          continue;
        }
        case "continue_with_prompt": {
          const resp = requireSuccessOutcome(outcome, action.type);
          if ("error" in resp) {
            return {
              stopReason: "error",
              content: stopContent(resp.error),
            };
          }
          messages.push({ role: "assistant", content: resp.content });
          messages.push({ role: "user", content: CONTINUATION_PROMPT });
          recoveryState = action.nextState;
          continue;
        }
        case "compact_and_retry": {
          try {
            await awaitWithDeadline(
              forceCompact(
                messages,
                loopOptions.workspaceRoot,
                "prompt too long recovery",
              ),
              loopOptions.deadlineAt,
            );
          } catch (error) {
            if (isDeadlineError(error, loopOptions.deadlineAt)) return timedOut();
            return {
              stopReason: "error",
              content: stopContent(
                `Compaction failed: ${formatRuntimeError(error)}`,
              ),
            };
          }
          recoveryState = action.nextState;
          continue;
        }
        case "backoff_and_retry": {
          if (action.nextModel) activeModel = action.nextModel;
          await awaitWithDeadline(sleep(action.delayMs), loopOptions.deadlineAt);
          recoveryState = action.nextState;
          continue;
        }
        case "abort": {
          return {
            stopReason: "error",
            content: stopContent(action.message),
          };
        }
      }

      // Normal path — proceed with successful response
      const response = requireSuccessOutcome(outcome, "normal_path");
      if ("error" in response) {
        return {
          stopReason: "error",
          content: stopContent(response.error),
        };
      }
      turns += 1;

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
        try {
          output = await awaitWithDeadline(
            toolRuntime.invokeTool(block.name, block.input),
            loopOptions.deadlineAt,
          );
        } catch (error) {
          if (isDeadlineError(error, loopOptions.deadlineAt)) return timedOut();
          output = `Error: ${formatRuntimeError(error)}`;
        }

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
