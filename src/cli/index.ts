import type Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { agentLoop, describeFinalResponse } from "../agent/index.js";
import { forceCompact } from "../agent/contextCompact.js";
import { createAppContext } from "../app/context.js";
import type { AppContext } from "../app/context.js";
import { registerOrchestrationTools } from "../app/orchestrationTools.js";
import { registerRuntimeHooks } from "../app/runtimeHooks.js";
import { buildSystem } from "../config.js";
import { registerHook } from "../hooks/index.js";
import { agentIdentity } from "../tools/toolRuntime.js";
import { logToolResult } from "./toolLog.js";

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
  const system = buildSystem(app.skillLoader, app.memoryManager);
  registerOrchestrationTools(app);
  registerRuntimeHooks(app);
  registerHook("PostToolUse", (block, output) => {
    const b = block as { name: string; input: Record<string, unknown> };
    logToolResult(b.name, b.input, output as string);
    return null;
  });

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
      const { content, stopReason } = await agentIdentity.run("lead", () =>
        agentLoop(history, app.toolRuntime, {
          system,
        }),
      );
      console.log(describeFinalResponse(content, stopReason));
      printTaskStatus(app);
      console.log();

      void app.memoryManager.extract(history);

      // Auto-wake: if background tasks are still running, wait for them
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

        if (interrupted) break;

        console.log("[background tasks completed, resuming]");
        const result = await agentIdentity.run("lead", () =>
          agentLoop(history, app.toolRuntime, {
            system,
          }),
        );
        console.log(describeFinalResponse(result.content, result.stopReason));
        printTaskStatus(app);
        console.log();

        void app.memoryManager.extract(history);
      }
    }
  } finally {
    if (app.memoryManager.list().length >= 10) {
      await app.memoryManager.consolidate();
    }
    app.toolRuntime.clearTasksIfAllDone();
    rl.close();
  }
}
