import type { AppContext } from "./context.js";
import { runSubAgent } from "../agent/index.js";
import type { SubAgentOptions } from "../agent/index.js";
import { optionalInteger, requireNonEmptyString, type ToolInput } from "../tools/input.js";
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
      name: {
        type: "string",
        description: "Optional display identity for the subagent.",
      },
      role: {
        type: "string",
        description: "Optional role description for the subagent.",
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

export function registerOrchestrationTools(app: AppContext): void {
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
      const name = requireNonEmptyString(input, "name", "subagent tool");
      if (!("error" in name)) subOpts.name = name.value;
      const role = requireNonEmptyString(input, "role", "subagent tool");
      if (!("error" in role)) subOpts.role = role.value;
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
}
