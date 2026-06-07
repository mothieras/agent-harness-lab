import { formatError } from "../errors.js";
import { requireNonEmptyString, requireString, type ToolInput } from "../input.js";
import type { TaskManager } from "./taskManager.js";
import { builtinTool, type RegisteredTool } from "../types.js";

export function createTaskCreateTool(deps: {
  taskManager: TaskManager;
}): RegisteredTool {
  return builtinTool(
    {
      name: "task_create",
      description: "Create a new persistent task. Tasks survive context compression as JSON files.",
      input_schema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "A brief, actionable title in imperative form." },
          description: { type: "string", description: "What needs to be done." },
        },
        required: ["subject"],
      },
    },
    (input) => runTaskCreate(input, deps.taskManager),
  );
}

function runTaskCreate(input: ToolInput, taskManager: TaskManager): string {
  const subject = requireNonEmptyString(input, "subject", "task_create");
  if ("error" in subject) return subject.error;
  try {
    return taskManager.create(subject.value, requireString(input, "description") ?? "");
  } catch (error) {
    return formatError(error);
  }
}
