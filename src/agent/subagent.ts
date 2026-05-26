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

export type SubAgentOptions = {
  maxTurns?: number;
  timeoutMs?: number;
  checkPermission?: CheckPermissionFn;
  hooks?: HookBus;
  workspaceRoot?: string;
};

const SUB_AGENT_ALLOWED_TOOLS = [
  "bash",
  "read_file",
  "write_file",
  "edit_file",
  "load_skill",
];


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
    system: `You are a subagent at ${
      options?.workspaceRoot ?? process.cwd()
    }. Complete the assigned task and report back concisely.`,
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
