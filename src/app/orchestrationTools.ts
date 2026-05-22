import type { AppContext } from "./context.js";
import { agentLoop, runSubAgent } from "../agent/index.js";
import type { SubAgentOptions } from "../agent/index.js";
import { TEAMMATE_ALLOWED_TOOLS } from "../team/teammateManager.js";
import { agentIdentity } from "../tools/toolRuntime.js";
import type { ToolInput } from "../tools/toolRuntime.js";

export function registerOrchestrationTools(app: AppContext): void {
  function launchTeammate(name: string, role: string, prompt: string): string {
    const result = app.teammateManager.spawn(name, role, prompt);
    if (result.startsWith("Error:")) return result;

    const messages = [{ role: "user" as const, content: prompt }];
    const loop = agentIdentity.run(name, () =>
      agentLoop(messages, app.toolRuntime, {
        maxTurns: 50,
        allowedTools: TEAMMATE_ALLOWED_TOOLS,
        system: `You are '${name}', role: ${role}, at ${process.cwd()}. Use send_message to communicate results or ask questions. Use read_inbox to check for new messages. Complete your assigned task and report back.`,
      }),
    );
    app.teammateManager.registerLoop(name, loop);

    return result;
  }

  app.toolRuntime.registerTool("task", async (input: ToolInput) => {
    const prompt = String(input.prompt ?? "");
    if (!prompt.trim()) {
      return "Error: Missing required 'prompt' for task tool.";
    }

    const subOpts: SubAgentOptions = {};
    const maxTurns = input.max_turns;
    if (typeof maxTurns === "number" && Number.isInteger(maxTurns)) {
      subOpts.maxTurns = maxTurns;
    }
    const timeoutMs = input.timeout_ms;
    if (typeof timeoutMs === "number" && Number.isInteger(timeoutMs)) {
      subOpts.timeoutMs = timeoutMs;
    }

    try {
      return await runSubAgent(prompt, app.toolRuntime, subOpts);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  app.toolRuntime.registerTool("spawn_teammate", (input: ToolInput) => {
    const name = String(input.name ?? "");
    const role = String(input.role ?? "");
    const prompt = String(input.prompt ?? "");
    if (!name.trim() || !role.trim() || !prompt.trim()) {
      return "Error: spawn_teammate requires 'name', 'role', and 'prompt'.";
    }
    return launchTeammate(name, role, prompt);
  });
}
