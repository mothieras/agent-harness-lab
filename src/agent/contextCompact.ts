import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { client, MODEL } from "../config.js";

const KEEP_RECENT_TOOL_RESULTS = 8;
const PRESERVE_RESULT_TOOLS = new Set<string>(["read_file"]);
const MICRO_COMPACT_THRESHOLD = 30_000;
const AUTO_COMPACT_THRESHOLD = 50_000;
const SUMMARY_INPUT_CHAR_LIMIT = 80_000;
const RECENT_RAW_CHAR_LIMIT = 24_000;
const TOOL_RESULT_CHAR_LIMIT = 8_000;
const TRANSCRIPT_DIR = ".transcripts";

function buildToolNameMap(
  messages: Anthropic.Messages.MessageParam[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === "tool_use") {
        map.set(block.id, block.name);
      }
    }
  }
  return map;
}

export function microCompact(
  messages: Anthropic.Messages.MessageParam[],
): void {
  if (estimateTokens(messages) <= MICRO_COMPACT_THRESHOLD) return;

  const nameMap = buildToolNameMap(messages);

  const located: Anthropic.Messages.ToolResultBlockParam[] = [];
  for (const msg of messages) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === "tool_result") located.push(block);
    }
  }
  if (located.length <= KEEP_RECENT_TOOL_RESULTS) return;

  const toClear = located.slice(0, located.length - KEEP_RECENT_TOOL_RESULTS);
  for (const block of toClear) {
    if (typeof block.content !== "string") continue;
    if (block.content.length <= 100) continue;

    const toolName = nameMap.get(block.tool_use_id) ?? "unknown";
    if (PRESERVE_RESULT_TOOLS.has(toolName)) continue;

    block.content = [
      "[Previous tool result compacted]",
      `tool: ${toolName}`,
      `original_chars: ${block.content.length}`,
    ].join("\n");
  }
}

function estimateTokens(
  messages: Anthropic.Messages.MessageParam[],
): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

async function saveTranscript(
  messages: Anthropic.Messages.MessageParam[],
): Promise<string> {
  const dir = join(process.cwd(), TRANSCRIPT_DIR);
  await mkdir(dir, { recursive: true });

  const transcriptPath = join(dir, `transcript_${Date.now()}.jsonl`);
  const lines = messages.map((msg) => JSON.stringify(msg));
  await writeFile(transcriptPath, `${lines.join("\n")}\n`, "utf8");

  return transcriptPath;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n...[truncated ${omitted} chars]`;
}

function fenced(label: string, value: unknown, maxChars = TOOL_RESULT_CHAR_LIMIT): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return `\n\`\`\`${label}\n${truncateText(text, maxChars)}\n\`\`\`\n`;
}

function messageToMarkdown(
  msg: Anthropic.Messages.MessageParam,
  index: number,
): string {
  const header = `## Message ${index + 1}: ${msg.role}`;
  if (typeof msg.content === "string") {
    return `${header}\n\n${msg.content}`;
  }

  const sections = msg.content.map((block, blockIndex) => {
    if (block.type === "text") {
      return `### Text ${blockIndex + 1}\n\n${block.text}`;
    }

    if (block.type === "tool_use") {
      return [
        `### Tool Use ${blockIndex + 1}`,
        `- id: ${block.id}`,
        `- name: ${block.name}`,
        `- input:${fenced("json", block.input)}`,
      ].join("\n");
    }

    if (block.type === "tool_result") {
      return [
        `### Tool Result ${blockIndex + 1}`,
        `- tool_use_id: ${block.tool_use_id}`,
        `- content:${fenced("text", block.content)}`,
      ].join("\n");
    }

    return `### Block ${blockIndex + 1}: ${block.type}${fenced("json", block)}`;
  });

  return `${header}\n\n${sections.join("\n")}`;
}

function hasToolResult(msg: Anthropic.Messages.MessageParam): boolean {
  return (
    msg.role === "user" &&
    Array.isArray(msg.content) &&
    msg.content.some((block) => block.type === "tool_result")
  );
}

function recentMessagesForSummary(
  messages: Anthropic.Messages.MessageParam[],
  maxChars: number,
): Anthropic.Messages.MessageParam[] {
  const selected: Anthropic.Messages.MessageParam[] = [];
  let total = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;

    const msgText = messageToMarkdown(msg, i);
    if (selected.length > 0 && total + msgText.length > maxChars) break;

    selected.unshift(msg);
    total += msgText.length;
    if (total >= maxChars) break;
  }

  while (selected.length > 1 && hasToolResult(selected[0]!)) {
    selected.shift();
  }

  return selected;
}

function splitMessagesForAutoCompact(
  messages: Anthropic.Messages.MessageParam[],
  recentRawCharLimit: number,
): {
  oldMessages: Anthropic.Messages.MessageParam[];
  recentMessages: Anthropic.Messages.MessageParam[];
} {
  let start = messages.length;
  let total = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;

    const msgText = JSON.stringify(msg);
    if (start < messages.length && total + msgText.length > recentRawCharLimit) {
      break;
    }

    start = i;
    total += msgText.length;
    if (total >= recentRawCharLimit) break;
  }

  while (start > 0 && hasToolResult(messages[start]!)) {
    start -= 1;
  }

  return {
    oldMessages: messages.slice(0, start),
    recentMessages: messages.slice(start),
  };
}

function formatMessagesForSummary(
  messages: Anthropic.Messages.MessageParam[],
): string {
  const recentMessages = recentMessagesForSummary(
    messages,
    SUMMARY_INPUT_CHAR_LIMIT,
  );

  return [
    "# Conversation Transcript Segment",
    "",
    "The following is a recent, complete-message slice of a longer agent session.",
    "Summarize it for continuity. Preserve concrete task state, file paths, decisions, commands, failures, and next steps.",
    "",
    ...recentMessages.map((msg, index) => messageToMarkdown(msg, index)),
  ].join("\n");
}

async function summarizeConversation(summaryInput: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL as Anthropic.Model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Summarize this conversation for continuity.",
              "Include:",
              "1. What was accomplished.",
              "2. Current state.",
              "3. Key decisions and constraints.",
              "4. Open tasks and exact next steps.",
              "Be concise, but preserve critical implementation details.",
              "",
              summaryInput,
            ].join("\n"),
          },
        ],
      },
    ],
    max_tokens: 2000,
  });

  return (
    response.content.find((block) => block.type === "text")?.text ??
    "No summary generated."
  );
}

async function compactMessages(
  messages: Anthropic.Messages.MessageParam[],
  reason: string,
): Promise<boolean> {
  const transcriptPath = await saveTranscript(messages);
  const { oldMessages, recentMessages } = splitMessagesForAutoCompact(
    messages,
    RECENT_RAW_CHAR_LIMIT,
  );
  const messagesToSummarize = oldMessages.length > 0 ? oldMessages : messages;
  const messagesToPreserve = oldMessages.length > 0 ? recentMessages : [];
  const summaryInput = formatMessagesForSummary(messagesToSummarize);
  const summary = await summarizeConversation(summaryInput);

  messages.splice(0, messages.length, {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "[Conversation compressed]",
          "",
          "Older conversation history was compacted to preserve context window space.",
          `Reason: ${reason}`,
          `Full transcript: ${transcriptPath}`,
          `Recent raw messages preserved after this summary: ${messagesToPreserve.length}`,
          "",
          "Continue from this compressed state:",
          "",
          summary,
        ].join("\n"),
      },
    ],
  }, ...messagesToPreserve);

  return true;
}

export async function autoCompactIfNeeded(
  messages: Anthropic.Messages.MessageParam[],
): Promise<boolean> {
  if (estimateTokens(messages) <= AUTO_COMPACT_THRESHOLD) return false;

  return compactMessages(messages, "automatic token threshold");
}

export async function forceCompact(
  messages: Anthropic.Messages.MessageParam[],
): Promise<boolean> {
  if (messages.length === 0) return false;

  return compactMessages(messages, "manual slash command");
}
