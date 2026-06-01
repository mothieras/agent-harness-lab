import type Anthropic from "@anthropic-ai/sdk";
import {
  agentLoop,
  DEFAULT_SUB_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_TIMEOUT_MS,
} from "./loop.js";
import type { AgentLoopOptions } from "./loop.js";
import { describeFinalResponse } from "./response.js";
import type { HookBus } from "../hooks/index.js";
import type { CheckPermissionFn } from "../permission/types.js";
import type { ToolRuntime } from "../tools/toolRuntime.js";
import { SUB_AGENT_ALLOWED_TOOLS } from "../tools/toolProfiles.js";

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
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  const loopOptions: AgentLoopOptions = {
    maxTurns: options?.maxTurns ?? DEFAULT_SUB_AGENT_MAX_TURNS,
    timeoutMs: options?.timeoutMs ?? DEFAULT_SUB_AGENT_TIMEOUT_MS,
    allowedTools: SUB_AGENT_ALLOWED_TOOLS,
    tools: toolRuntime.getToolDefinitions(),
    system: buildSubAgentSystemPrompt(options),
  };
  if (options?.workspaceRoot) {
    loopOptions.workspaceRoot = options.workspaceRoot;
  }
  if (options?.checkPermission) {
    loopOptions.checkPermission = options.checkPermission;
  }
  if (options?.hooks) {
    loopOptions.hooks = options.hooks;
  }

  const { content, stopReason } = await agentLoop(
    messages,
    toolRuntime,
    loopOptions,
  );

  return describeFinalResponse(content, stopReason);
}
