import { requireString } from "../../input.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createCheckBackgroundTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "check_background",
      description:
        "Check background task status. Omit task_id to list all active tasks.",
      input_schema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Optional task ID to check." },
        },
      },
    },
    (input) => deps.backgroundManager.check(requireString(input, "task_id") ?? undefined),
  );
}
