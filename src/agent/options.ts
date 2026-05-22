import type Anthropic from "@anthropic-ai/sdk";
import { getTools } from "../tools/index.js";

export type AgentLoopStopReason =
  | Anthropic.Messages.Message["stop_reason"]
  | "max_turns"
  | "timeout";

export type AgentLoopOptions = {
  maxTurns?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  system?: string;
};

export type AgentLoopResult = {
  stopReason: AgentLoopStopReason;
  content: Anthropic.Messages.Message["content"];
};

export type NormalizedAgentLoopOptions = {
  maxTurns: number;
  timeoutMs: number | undefined;
  deadlineAt: number | undefined;
  system: string;
  tools: ReturnType<typeof getTools>;
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
    system:
      options?.system ??
      `You are a coding agent at ${process.cwd()}. Use tools to solve tasks.`,
    tools,
  };
}
