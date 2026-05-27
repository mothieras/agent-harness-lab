import type Anthropic from "@anthropic-ai/sdk";
import { getTools } from "../tools/index.js";
import type { CheckPermissionFn } from "../permission/types.js";
import type { HookBus } from "../hooks/index.js";

export type AgentLoopStopReason =
  | Anthropic.Messages.Message["stop_reason"]
  | "max_turns"
  | "timeout"
  | "error";

export type AgentLoopOptions = {
  maxTurns?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  /** System prompt. Prefer {@link buildSystemPrompt} from prompt/assembler; this fallback is bare-bones. */
  system?: string;
  workspaceRoot?: string;
  checkPermission?: CheckPermissionFn;
  hooks?: HookBus;
};

export type AgentLoopResult = {
  stopReason: AgentLoopStopReason;
  content: Anthropic.Messages.Message["content"];
};

export type NormalizedAgentLoopOptions = {
  maxTurns: number;
  timeoutMs: number | undefined;
  deadlineAt: number | undefined;
  workspaceRoot: string;
  system: string;
  tools: ReturnType<typeof getTools>;
  checkPermission: AgentLoopOptions["checkPermission"];
  hooks: HookBus | undefined;
};

export const DEFAULT_MAIN_AGENT_MAX_TURNS = 200;
export const DEFAULT_SUB_AGENT_MAX_TURNS = 90;
export const DEFAULT_SUB_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

function validatePositiveIntegerOption(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Agent loop ${name} must be a positive integer.`);
  }
  return value;
}

export function normalizeAgentLoopOptions(
  options?: AgentLoopOptions,
): NormalizedAgentLoopOptions {
  const maxTurns =
    validatePositiveIntegerOption(options?.maxTurns, "maxTurns") ??
    DEFAULT_MAIN_AGENT_MAX_TURNS;
  const timeoutMs = validatePositiveIntegerOption(
    options?.timeoutMs,
    "timeoutMs",
  );
  const deadlineAt =
    timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
  const allowedTools = options?.allowedTools;
  const tools = allowedTools
    ? getTools().filter((tool) => allowedTools.includes(tool.name))
    : getTools();

  return {
    maxTurns,
    timeoutMs,
    deadlineAt,
    workspaceRoot: options?.workspaceRoot ?? process.cwd(),
    system:
      options?.system ??
      `You are a coding agent at ${
        options?.workspaceRoot ?? process.cwd()
      }. Use tools to solve tasks.`,
    tools,
    checkPermission: options?.checkPermission,
    hooks: options?.hooks,
  };
}
