import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createTaskListTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "task_list",
      description: "List all tasks with status summary and dependency info.",
      input_schema: {
        type: "object",
        properties: {},
      },
    },
    () => deps.taskManager.listAll(),
  );
}
