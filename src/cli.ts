import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { agentLoop } from "./agentLoop.js";
import { forceCompact } from "./contextCompact.js";
import { describeFinalResponse } from "./format.js";

async function handleSlashCommand(
  command: string,
  history: Anthropic.Messages.MessageParam[],
): Promise<"handled" | "exit"> {
  const [name] = command.slice(1).trim().split(/\s+/, 1);
  switch (name) {
    case "exit":
      return "exit";
    case "help":
      console.log("Commands:");
      console.log("  /compact  Compact the current conversation history.");
      console.log("  /exit     Exit the CLI.");
      console.log();
      return "handled";
    case "compact": {
      const compacted = await forceCompact(history);
      console.log(compacted ? "Context compacted." : "Nothing to compact.");
      console.log();
      return "handled";
    }
    default:
      console.log(`Unknown command: /${name}`);
      console.log();
      return "handled";
  }
}

export async function runCli(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  const history: Anthropic.Messages.MessageParam[] = [];
  try {
    while (true) {
      const query = await rl.question("\x1b[36magent >> \x1b[0m");
      const trimmed = query.trim();
      if (trimmed === "") continue;
      if (trimmed.startsWith("/")) {
        const result = await handleSlashCommand(trimmed, history);
        if (result === "exit") break;
        continue;
      }
      history.push({ role: "user", content: query });
      const { content, stopReason } = await agentLoop(history);
      console.log(describeFinalResponse(content, stopReason));
      console.log();
    }
  } finally {
    rl.close();
  }
}
