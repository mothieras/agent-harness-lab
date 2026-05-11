import Anthropic from "@anthropic-ai/sdk";
import { runBash } from "./bash.js";
import { client, MODEL, SYSTEM, TOOLS } from "./config.js";

export async function agentLoop(
  messages: Anthropic.Messages.MessageParam[],
): Promise<{
  stopReason: Anthropic.Messages.Message["stop_reason"];
  content: Anthropic.Messages.Message["content"];
}> {
  while (true) {
    const response = await client.messages.create({
      model: MODEL as Anthropic.Model,
      system: SYSTEM,
      tools: TOOLS,
      messages: messages,
      max_tokens: 8000,
    });
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") {
      return { stopReason: response.stop_reason, content: response.content };
    }
    const results: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
    }> = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        if (block.name !== "bash") {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: Unsupported tool '${block.name}'. Only 'bash' is allowed.`,
          });
          continue;
        }
        const input =
          typeof block.input === "object" && block.input !== null
            ? (block.input as { command?: unknown })
            : {};
        const command = String(input.command ?? "").trim();
        if (!command) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Error: Missing required 'command' for bash tool.",
          });
          continue;
        }
        console.log(`\x1b[33m$ ${command}\x1b[0m`);
        const output = await runBash(command);
        console.log(output.slice(0, 200));
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }
}
