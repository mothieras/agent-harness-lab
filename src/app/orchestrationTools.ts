import type { AppContext } from "./context.js";
import { agentLoop, runSubAgent } from "../agent/index.js";
import type { AgentLoopOptions, SubAgentOptions } from "../agent/index.js";
import { agentIdentity } from "../tools/agentIdentity.js";
import { optionalInteger, requireNonEmptyString, type ToolInput } from "../tools/input.js";
import { TEAMMATE_ALLOWED_TOOLS } from "../tools/toolProfiles.js";
import type { ToolDefinition } from "../tools/toolTypes.js";

const SUBAGENT_DEFINITION: ToolDefinition = {
  name: "subagent",
  description:
    "Run a task in an isolated subagent context and return a concise summary. Defaults to 90 turns and 30 minutes.",
  input_schema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task for the subagent to complete.",
      },
      max_turns: {
        type: "integer",
        minimum: 1,
        description:
          "Optional maximum number of agent-loop turns for this subagent. Defaults to 90.",
      },
      timeout_ms: {
        type: "integer",
        minimum: 1,
        description:
          "Optional maximum runtime for this subagent in milliseconds. Defaults to 1800000.",
      },
    },
    required: ["prompt"],
  },
};

const TEAMMATE_DEFINITION: ToolDefinition = {
  name: "teammate",
  description:
    "Create a persistent teammate with its own agent loop, inbox, and async communication.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Unique name for the teammate." },
      role: { type: "string", description: "Role description (e.g. coder, tester)." },
      prompt: { type: "string", description: "Initial task prompt for the teammate." },
    },
    required: ["name", "role", "prompt"],
  },
};

export function registerOrchestrationTools(app: AppContext): void {
  function launchTeammate(name: string, role: string, prompt: string): string {
    const result = app.teammateManager.spawn(name, role, prompt);
    if (result.startsWith("Error:")) return result;

    const messages = [{ role: "user" as const, content: prompt }];
    const loopOptions: AgentLoopOptions = {
      maxTurns: 50,
      allowedTools: TEAMMATE_ALLOWED_TOOLS,
      tools: app.toolRegistry.getDefinitions(),
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

  app.toolRuntime.registerTool({
    name: "subagent",
    definition: SUBAGENT_DEFINITION,
    source: { type: "builtin" },
    handler: async (input: ToolInput) => {
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
    },
  });

  app.toolRuntime.registerTool({
    name: "teammate",
    definition: TEAMMATE_DEFINITION,
    source: { type: "builtin" },
    handler: (input: ToolInput) => {
      const name = requireNonEmptyString(input, "name", "teammate");
      if ("error" in name) return name.error;
      const role = requireNonEmptyString(input, "role", "teammate");
      if ("error" in role) return role.error;
      const prompt = requireNonEmptyString(input, "prompt", "teammate");
      if ("error" in prompt) return prompt.error;
      return launchTeammate(name.value, role.value, prompt.value);
    },
  });
}
