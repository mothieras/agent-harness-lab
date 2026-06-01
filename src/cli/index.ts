import type Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { agentLoop, describeFinalResponse } from "../agent/index.js";
import { forceCompact } from "../agent/contextCompact.js";
import { createAppContext } from "../app/context.js";
import type { AppContext } from "../app/context.js";
import { registerOrchestrationTools } from "../app/orchestrationTools.js";
import { registerRuntimeHooks } from "../app/runtimeHooks.js";
import { buildSystemPrompt } from "../prompt/assembler.js";
import type { PromptContext } from "../prompt/assembler.js";
import { createPermissionChecker } from "../permission/permission.js";
import type { AskUserFn, CheckPermissionFn } from "../permission/types.js";
import { agentIdentity } from "../tools/agentIdentity.js";
import { logToolResult } from "./toolLog.js";

type LeadTurnOptions = {
	app: AppContext;
	history: Anthropic.Messages.MessageParam[];
	system: string;
	checkPermission: CheckPermissionFn;
};

export async function safeQuestion(
	question: (query: string) => Promise<string>,
	query: string,
): Promise<string | null> {
	try {
		return await question(query);
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ERR_USE_AFTER_CLOSE"
		) {
			return null;
		}
		throw error;
	}
}

function buildPromptContext(app: AppContext): PromptContext {
  return {
    workspace: app.workspaceRoot,
    memories: app.memoryManager.buildIndex(),
    skills: app.skillLoader.getDescriptions(),
  };
}

function printTaskStatus(app: AppContext): void {
	const status = app.toolRuntime.taskStatusForUser();
	if (!status) return;
	console.log(`\x1b[2m--- Tasks ---\n${status}\x1b[0m`);
}

async function handleSlashCommand(
  command: string,
  history: Anthropic.Messages.MessageParam[],
  workspaceRoot: string,
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
			const compacted = await forceCompact(history, workspaceRoot);
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
  const system = buildSystemPrompt(buildPromptContext(app));
  registerOrchestrationTools(app);

  const rl = readline.createInterface({ input, output });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });
  const ask = (query: string) => safeQuestion(rl.question.bind(rl), query);

  const askUser: AskUserFn = async (toolName, input_, reason) => {
    if (closed) return false;
    console.log(`\n\x1b[33m⚠  ${reason}\x1b[0m`);
    console.log(`   Tool: ${toolName}(${JSON.stringify(input_)})`);
    const choice = await ask("   Allow? [y/N] ");
    if (choice === null) return false;
    return (
      choice.trim().toLowerCase() === "y" ||
      choice.trim().toLowerCase() === "yes"
    );
  };

  const checkPermission = createPermissionChecker(app.workspaceRoot, askUser);
  app.checkPermission = checkPermission;
  registerRuntimeHooks(app);
  app.hooks.register("PostToolUse", (block, output) => {
    logToolResult(block.name, block.input as Record<string, unknown>, output);
  });

  const history: Anthropic.Messages.MessageParam[] = [];
  try {
    while (!closed) {
      const query = await ask("\x1b[36magent >> \x1b[0m");
      if (query === null) break;
      const trimmed = query.trim();
      if (trimmed === "") continue;
      if (trimmed.startsWith("/")) {
        const result = await handleSlashCommand(
          trimmed,
          history,
          app.workspaceRoot,
        );
        if (result === "exit") break;
        continue;
      }
      history.push({ role: "user", content: query });
      await runLeadTurn({ app, history, system, checkPermission });

      // Auto-wake: if background tasks are still running, wait for them
      while (app.toolRuntime.hasRunningBackgroundTasks()) {
        const result = await waitForBackgroundTasks(app);
        if (result === "interrupted") break;
        console.log("[background tasks completed, resuming]");
        await runLeadTurn({ app, history, system, checkPermission });
      }
    }
  } finally {
    if (app.memoryManager.list().length >= 10) {
      await app.memoryManager.consolidate();
    }
    app.toolRuntime.clearTasksIfAllDone();
    if (!closed) rl.close();
  }
}

async function runLeadTurn(options: LeadTurnOptions): Promise<void> {
	const { app, history, system, checkPermission } = options;
	const result = await agentIdentity.run("lead", () =>
		agentLoop(history, app.toolRuntime, {
			system,
			workspaceRoot: app.workspaceRoot,
			checkPermission,
			hooks: app.hooks,
			tools: app.toolRegistry.getDefinitions(),
		}),
	);
	console.log(describeFinalResponse(result.content, result.stopReason));
	printTaskStatus(app);
	console.log();
	void app.memoryManager.extract(history);
}

async function waitForBackgroundTasks(
	app: AppContext,
): Promise<"completed" | "interrupted"> {
	console.log("Waiting for background tasks... (Ctrl+C to skip)");
	let interrupted = false;
	const onSigint = () => {
		interrupted = true;
	};
	process.on("SIGINT", onSigint);

	while (app.toolRuntime.hasRunningBackgroundTasks() && !interrupted) {
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	process.removeListener("SIGINT", onSigint);
	console.log();
	return interrupted ? "interrupted" : "completed";
}
