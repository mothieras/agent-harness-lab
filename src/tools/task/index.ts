import type { TaskManager } from "./taskManager.js";
import type { RegisteredTool } from "../types.js";
import { createTaskCreateTool } from "./create.js";
import { createTaskGetTool } from "./get.js";
import { createTaskListTool } from "./list.js";
import { createTaskUpdateTool } from "./update.js";

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
