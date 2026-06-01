import { formatError } from "../../formatError.js";
import {
  optionalArrayOfIntegers,
  requireInteger,
  requireString,
  type ToolInput,
} from "../../input.js";
import type { TaskManager } from "../../taskManager.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createTaskUpdateTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "task_update",
      description:
        "Update a task's status or dependencies. Completing a task auto-removes it from others' blockedBy.",
      input_schema: {
        type: "object",
        properties: {
          task_id: { type: "integer", description: "The ID of the task to update." },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          addBlockedBy: {
            type: "array",
            items: { type: "integer" },
            description: "Task IDs that this task depends on.",
          },
          removeBlockedBy: {
            type: "array",
            items: { type: "integer" },
            description: "Dependency IDs to remove.",
          },
        },
        required: ["task_id"],
      },
    },
    (input) => runTaskUpdate(input, deps.taskManager),
  );
}

function runTaskUpdate(input: ToolInput, taskManager: TaskManager): string {
  const taskId = requireInteger(input, "task_id");
  if (taskId === null) return "Error: Missing required 'task_id' for task_update.";
  try {
    return taskManager.update(
      taskId,
      requireString(input, "status") ?? undefined,
      optionalArrayOfIntegers(input, "addBlockedBy"),
      optionalArrayOfIntegers(input, "removeBlockedBy"),
    );
  } catch (error) {
    return formatError(error);
  }
}
