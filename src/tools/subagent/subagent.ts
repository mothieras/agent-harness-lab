import { Agent } from "../../agent.js";
import {
  agentLoop,
  DEFAULT_SUB_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_TIMEOUT_MS,
} from "../../loop/loop.js";
import { describeFinalResponse } from "../../loop/response.js";
import type { HookBus } from "../../hooks/hookBus.js";
import type { CheckPermissionFn } from "../../permission/types.js";
import type { ToolRuntime } from "../runtime.js";
import { SUB_AGENT_ALLOWED_TOOLS } from "../profiles.js";

export type SubAgentOptions = {
  name?: string;
  role?: string;
  maxTurns?: number;
  timeoutMs?: number;
  checkPermission?: CheckPermissionFn;
  hooks?: HookBus;
  workspaceRoot?: string;
};

export function buildSubAgentSystemPrompt(options?: SubAgentOptions): string {
  const workspace = options?.workspaceRoot ?? process.cwd();
  const identity = options?.name ? ` named '${options.name}'` : "";
  const role = options?.role ? ` Your role is: ${options.role}.` : "";
  return `You are a subagent${identity} at ${workspace}.${role} Complete the assigned task and report back concisely.`;
}

export async function runSubAgent(
  prompt: string,
  toolRuntime: ToolRuntime,
  options?: SubAgentOptions,
): Promise<string> {
  const subAgent = new Agent({
    name: options?.name,
    role: options?.role,
    maxTurns: options?.maxTurns ?? DEFAULT_SUB_AGENT_MAX_TURNS,
    timeoutMs: options?.timeoutMs ?? DEFAULT_SUB_AGENT_TIMEOUT_MS,
    allowedTools: SUB_AGENT_ALLOWED_TOOLS,
    system: buildSubAgentSystemPrompt(options),
    workspaceRoot: options?.workspaceRoot,
    toolRuntime,
    hooks: options?.hooks,
    checkPermission: options?.checkPermission,
    messages: [{ role: "user", content: prompt }],
  });

  const { content, stopReason } = await agentLoop(subAgent);

  return describeFinalResponse(content, stopReason);
}
