import type Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { agentLoop } from "./agentLoop.js";
import type { AgentLoopOptions } from "./agentLoop.js";
import { createAppContext } from "./appContext.js";
import type { AppContext } from "./appContext.js";
import { buildSystem } from "./config.js";
import { forceCompact } from "./contextCompact.js";
import { describeFinalResponse } from "./format.js";
import { logToolResult } from "./log.js";
import { runSubAgent } from "./subagent.js";
import { TEAMMATE_ALLOWED_TOOLS } from "./team/teammateManager.js";
import { agentIdentity } from "./tools/toolRuntime.js";

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

function buildTeamOptions(app: AppContext): {
  runTeammate: NonNullable<AgentLoopOptions["runTeammate"]>;
  drainTeammateNotifications: NonNullable<
    AgentLoopOptions["drainTeammateNotifications"]
  >;
  beforeTurn: NonNullable<AgentLoopOptions["beforeTurn"]>;
} {
  function launchTeammate(name: string, role: string, prompt: string): string {
    const result = app.teammateManager.spawn(name, role, prompt);
    if (result.startsWith("Error:")) return result;

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: prompt },
    ];
    const loop = agentIdentity.run(name, () =>
      agentLoop(messages, app.toolRuntime, {
        maxTurns: 50,
        allowedTools: TEAMMATE_ALLOWED_TOOLS,
        system: `You are '${name}', role: ${role}, at ${process.cwd()}. Use send_message to communicate results or ask questions. Use read_inbox to check for new messages. Complete your assigned task and report back.`,
        beforeTurn: async () => {
          const newMsgs = app.teammateManager.drainInbox(name);
          for (const msg of newMsgs) {
            messages.push({
              role: "user",
              content: `<inbox>${JSON.stringify(msg)}</inbox>`,
            });
          }
        },
      }),
    );
    app.teammateManager.registerLoop(name, loop);

    return result;
  }

  return {
    runTeammate: launchTeammate,
    drainTeammateNotifications: () =>
      app.teammateManager.drainNotifications(),
    beforeTurn: async (messages) => {
      const msgs = app.teammateManager.drainInbox("lead");
      for (const msg of msgs) {
        messages.push({
          role: "user",
          content: `<inbox>${JSON.stringify(msg)}</inbox>`,
        });
      }
    },
  };
}

export async function runCli(): Promise<void> {
  const app = createAppContext(process.cwd());
  const system = buildSystem(app.skillLoader);
  const teamOptions = buildTeamOptions(app);

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
          onToolResult: logToolResult,
          runSubAgent: (prompt, opts) =>
            runSubAgent(prompt, app.toolRuntime, opts),
          ...teamOptions,
        }),
      );
      console.log(describeFinalResponse(content, stopReason));
      printTaskStatus(app);
      console.log();

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
            onToolResult: logToolResult,
            runSubAgent: (prompt, opts) =>
              runSubAgent(prompt, app.toolRuntime, opts),
            ...teamOptions,
          }),
        );
        console.log(describeFinalResponse(result.content, result.stopReason));
        printTaskStatus(app);
        console.log();
      }
    }
  } finally {
    rl.close();
  }
}
