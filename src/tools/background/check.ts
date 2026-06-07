import { requireString } from "../input.js";
import type { BackgroundManager } from "./backgroundManager.js";
import { builtinTool, type RegisteredTool } from "../types.js";

export function createCheckBackgroundTool(deps: {
  backgroundManager: BackgroundManager;
}): RegisteredTool {
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
