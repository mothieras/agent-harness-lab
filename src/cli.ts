import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { agentLoop } from "./agent-loop.js";

export async function runCli(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const history: Anthropic.Messages.MessageParam[] = [];
  try {
    while (true) {
      const query = await rl.question("\x1b[36ms01 >> \x1b[0m");
      const q = query.trim().toLowerCase();
      if (q === "" || q === "q" || q === "exit") break;
      history.push({ role: "user", content: query });
      const finalResponse = await agentLoop(history);
      const responseContent = finalResponse.content;
      let hasTextOutput = false;
      if (Array.isArray(responseContent)) {
        for (const block of responseContent) {
          if ("text" in block && typeof block.text === "string") {
            if (block.text.trim() !== "") {
              console.log(block.text);
              hasTextOutput = true;
            }
          }
        }
        if (!hasTextOutput) {
          const blockTypes = Array.from(
            new Set(responseContent.map((block) => block.type)),
          ).join(",");
          console.log(
            `[no text response] stop_reason=${finalResponse.stopReason ?? "unknown"}, blocks=${blockTypes || "none"}`,
          );
        }
      }
      console.log();
    }
  } finally {
    rl.close();
  }
}
