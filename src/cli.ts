import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { agentLoop } from "./agentLoop.js";
import { createAppContext } from "./appContext.js";
import type { AppContext } from "./appContext.js";
import { buildSystem } from "./config.js";
import { forceCompact } from "./contextCompact.js";
import { describeFinalResponse } from "./format.js";
import { logToolResult } from "./log.js";
import { runSubAgent } from "./subagent.js";

function printTaskStatus(app: AppContext): void {
  const status = app.toolRuntime.taskStatusForUser();
  if (!status) return;
  console.log(`\x1b[2m--- Tasks ---\n${status}\x1b[0m`);
}

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
  const app = createAppContext(process.cwd());
  const system = buildSystem(app.skillLoader);

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
      const { content, stopReason } = await agentLoop(
        history,
        app.toolRuntime,
        {
          system,
          onToolResult: logToolResult,
          runSubAgent: (prompt, opts) =>
            runSubAgent(prompt, app.toolRuntime, opts),
        },
      );
      console.log(describeFinalResponse(content, stopReason));
      printTaskStatus(app);
      console.log();

      // Auto-wake: if background tasks are still running, wait for them
      // instead of dropping back to the readline prompt.
      while (app.toolRuntime.hasRunningBackgroundTasks()) {
        console.log("Waiting for background tasks... (Ctrl+C to skip)");

        let interrupted = false;
        const onSigint = () => {
          interrupted = true;
        };
        process.on("SIGINT", onSigint);

        while (
          app.toolRuntime.hasRunningBackgroundTasks() &&
          !interrupted
        ) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        process.removeListener("SIGINT", onSigint);
        console.log();

        if (interrupted) break; // user wants to go back to prompt

        // Tasks completed — agentLoop drains at the start of the next round
        console.log("[background tasks completed, resuming]");
        const result = await agentLoop(history, app.toolRuntime, {
          system,
          onToolResult: logToolResult,
          runSubAgent: (prompt, opts) =>
            runSubAgent(prompt, app.toolRuntime, opts),
        });
        console.log(describeFinalResponse(result.content, result.stopReason));
        printTaskStatus(app);
        console.log();
      }
    }
  } finally {
    rl.close();
  }
}
