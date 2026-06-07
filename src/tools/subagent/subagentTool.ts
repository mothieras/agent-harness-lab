import { optionalInteger, requireNonEmptyString } from "../input.js";
import type {
  SubAgentRunOptions,
  SubAgentRunner,
} from "./subAgentRunner.js";
import type { CheckPermissionFn } from "../../permission/types.js";
import { builtinTool, type RegisteredTool } from "../types.js";

export function createSubagentTool(deps: {
  subAgentRunner: SubAgentRunner;
  checkPermission?: CheckPermissionFn;
}): RegisteredTool {
  return builtinTool(
    {
      name: "subagent",
      description:
        "Spawn an async subagent and return a sub_id immediately. The result is delivered later — keep working and poll with check_subagent, or end your turn and the host will re-wake you when results land. Defaults to 90 turns and 30 minutes.",
      input_schema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The task for the subagent to complete." },
          name: { type: "string", description: "Optional display identity for the subagent." },
          role: { type: "string", description: "Optional role description for the subagent." },
          max_turns: {
            type: "integer",
            minimum: 1,
            description: "Optional maximum agent-loop turns for this subagent. Defaults to 90.",
          },
          timeout_ms: {
            type: "integer",
            minimum: 1,
            description: "Optional maximum runtime in milliseconds. Defaults to 1800000.",
          },
          task_id: {
            type: "string",
            description:
              "Optional task id this subagent works on; echoed back when the result returns so you can correlate it.",
          },
        },
        required: ["prompt"],
      },
    },
    (input) => {
      const prompt = requireNonEmptyString(input, "prompt", "subagent tool");
      if ("error" in prompt) return prompt.error;

      const options: SubAgentRunOptions = {};
      const name = requireNonEmptyString(input, "name", "subagent tool");
      if (!("error" in name)) options.name = name.value;
      const role = requireNonEmptyString(input, "role", "subagent tool");
      if (!("error" in role)) options.role = role.value;
      const taskId = requireNonEmptyString(input, "task_id", "subagent tool");
      if (!("error" in taskId)) options.taskId = taskId.value;
      const maxTurns = optionalInteger(input, "max_turns");
      if (maxTurns !== undefined) options.maxTurns = maxTurns;
      const timeoutMs = optionalInteger(input, "timeout_ms");
      if (timeoutMs !== undefined) options.timeoutMs = timeoutMs;
      if (deps.checkPermission) options.checkPermission = deps.checkPermission;

      return deps.subAgentRunner.run(prompt.value, options);
    },
  );
}
