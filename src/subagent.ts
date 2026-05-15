import type Anthropic from "@anthropic-ai/sdk";
import {
  agentLoop,
  DEFAULT_SUB_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_TIMEOUT_MS,
} from "./agentLoop.js";
import { describeFinalResponse } from "./format.js";

export type SubAgentOptions = {
  maxTurns?: number;
  timeoutMs?: number;
};

const SUB_AGENT_ALLOWED_TOOLS = [
  "bash",
  "read_file",
  "write_file",
  "edit_file",
  "todo",
  "load_skill",
];

export async function runSubAgent(
  prompt: string,
  options?: SubAgentOptions,
): Promise<string> {
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  const { content, stopReason } = await agentLoop(messages, {
    maxTurns: options?.maxTurns ?? DEFAULT_SUB_AGENT_MAX_TURNS,
    timeoutMs: options?.timeoutMs ?? DEFAULT_SUB_AGENT_TIMEOUT_MS,
    allowedTools: SUB_AGENT_ALLOWED_TOOLS,
    enableTodoReminder: false,
  });

  return describeFinalResponse(content, stopReason);
}
