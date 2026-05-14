import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { agentLoop } from "./agentLoop.js";
import { describeFinalResponse } from "./format.js";

export async function runCli(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const history: Anthropic.Messages.MessageParam[] = [];
  try {
    while (true) {
      const query = await rl.question("\x1b[36magent >> \x1b[0m");
      const trimmed = query.trim();
      if (trimmed === "") continue;
      const lower = trimmed.toLowerCase();
      if (lower === "q" || lower === "exit") break;
      history.push({ role: "user", content: query });
      const { content, stopReason } = await agentLoop(history);
      console.log(describeFinalResponse(content, stopReason));
      console.log();
    }
  } finally {
    rl.close();
  }
}
