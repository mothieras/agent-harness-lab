import { formatError } from "../../formatError.js";
import { requireInteger, type ToolInput } from "../../input.js";
import type { TaskManager } from "../../taskManager.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createTaskGetTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "task_get",
      description: "Get full details of a task by ID.",
      input_schema: {
        type: "object",
        properties: {
          task_id: { type: "integer", description: "The ID of the task to retrieve." },
        },
        required: ["task_id"],
      },
    },
    (input) => runTaskGet(input, deps.taskManager),
  );
}

function runTaskGet(input: ToolInput, taskManager: TaskManager): string {
  const taskId = requireInteger(input, "task_id");
  if (taskId === null) return "Error: Missing required 'task_id' for task_get.";
  try {
    return taskManager.get(taskId);
  } catch (error) {
    return formatError(error);
  }
}
