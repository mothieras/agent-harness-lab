import type { TaskManager } from "../../taskManager.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { createTaskCreateTool } from "./createTaskTool.js";
import { createTaskGetTool } from "./getTaskTool.js";
import { createTaskListTool } from "./listTaskTool.js";
import { createTaskUpdateTool } from "./updateTaskTool.js";

export function createTaskTools(deps: {
  taskManager: TaskManager;
}): RegisteredTool[] {
  return [
    createTaskCreateTool(deps),
    createTaskGetTool(deps),
    createTaskUpdateTool(deps),
    createTaskListTool(deps),
  ];
}
