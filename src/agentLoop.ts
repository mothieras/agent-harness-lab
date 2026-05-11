import Anthropic from "@anthropic-ai/sdk";
import { client, MODEL, SYSTEM } from "./config.js";
import { getTools, invokeTool } from "./tools/dispatch.js";

export async function agentLoop(
  messages: Anthropic.Messages.MessageParam[],
): Promise<{
  stopReason: Anthropic.Messages.Message["stop_reason"];
  content: Anthropic.Messages.Message["content"];
}> {
  const tools = getTools();

  while (true) {
    const response = await client.messages.create({
      model: MODEL as Anthropic.Model,
      system: SYSTEM,
      tools,
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
        console.log(`\x1b[33mtool: ${block.name}\x1b[0m`);
        const output = await invokeTool(block.name, block.input);
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
