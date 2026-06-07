import { requireString } from "../../input.js";
import type { SubAgentRunner } from "../../../agent/subAgentRunner.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool } from "../types.js";

export function createCheckSubagentTool(deps: {
  subAgentRunner: SubAgentRunner;
}): RegisteredTool {
  return builtinTool(
    {
      name: "check_subagent",
      description: "Check subagent status. Omit sub_id to list all subagents.",
      input_schema: {
        type: "object",
        properties: {
          sub_id: { type: "string", description: "Optional subagent id to check." },
        },
      },
    },
    (input) =>
      deps.subAgentRunner.check(requireString(input, "sub_id") ?? undefined),
  );
}
