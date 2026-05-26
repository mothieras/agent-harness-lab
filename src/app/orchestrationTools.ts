import type { AppContext } from "./context.js";
import { agentLoop, runSubAgent } from "../agent/index.js";
import type { AgentLoopOptions, SubAgentOptions } from "../agent/index.js";
import { TEAMMATE_ALLOWED_TOOLS } from "../team/teammateManager.js";
import { agentIdentity } from "../tools/agentIdentity.js";
import { optionalInteger, requireNonEmptyString, type ToolInput } from "../tools/input.js";

export function registerOrchestrationTools(app: AppContext): void {
  function launchTeammate(name: string, role: string, prompt: string): string {
    const result = app.teammateManager.spawn(name, role, prompt);
    if (result.startsWith("Error:")) return result;

    const messages = [{ role: "user" as const, content: prompt }];
    const loopOptions: AgentLoopOptions = {
      maxTurns: 50,
      allowedTools: TEAMMATE_ALLOWED_TOOLS,
      workspaceRoot: app.workspaceRoot,
      hooks: app.hooks,
      system: `You are '${name}', role: ${role}, at ${app.workspaceRoot}. Use send_message to communicate results or ask questions. Use read_inbox to check for new messages. Complete your assigned task and report back.`,
    };
    if (app.checkPermission) {
      loopOptions.checkPermission = app.checkPermission;
    }
    const loop = agentIdentity.run(name, () =>
      agentLoop(messages, app.toolRuntime, loopOptions),
    );
    app.teammateManager.registerLoop(name, loop);

    return result;
  }

  app.toolRuntime.registerTool("subagent", async (input: ToolInput) => {
    const prompt = requireNonEmptyString(input, "prompt", "subagent tool");
    if ("error" in prompt) return prompt.error;

    const subOpts: SubAgentOptions = {
      hooks: app.hooks,
      workspaceRoot: app.workspaceRoot,
    };
    if (app.checkPermission) {
      subOpts.checkPermission = app.checkPermission;
    }
    const maxTurns = optionalInteger(input, "max_turns");
    if (maxTurns !== undefined) subOpts.maxTurns = maxTurns;
    const timeoutMs = optionalInteger(input, "timeout_ms");
    if (timeoutMs !== undefined) subOpts.timeoutMs = timeoutMs;

    try {
      return await runSubAgent(prompt.value, app.toolRuntime, subOpts);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  app.toolRuntime.registerTool("teammate", (input: ToolInput) => {
    const name = requireNonEmptyString(input, "name", "teammate");
    if ("error" in name) return name.error;
    const role = requireNonEmptyString(input, "role", "teammate");
    if ("error" in role) return role.error;
    const prompt = requireNonEmptyString(input, "prompt", "teammate");
    if ("error" in prompt) return prompt.error;
    return launchTeammate(name.value, role.value, prompt.value);
  });
}
