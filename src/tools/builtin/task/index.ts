import type { RegisteredTool } from "../../toolTypes.js";
import type { BuiltinToolDeps } from "../types.js";
import { createTaskCreateTool } from "./createTaskTool.js";
import { createTaskGetTool } from "./getTaskTool.js";
import { createTaskListTool } from "./listTaskTool.js";
import { createTaskUpdateTool } from "./updateTaskTool.js";

export function createTaskTools(deps: BuiltinToolDeps): RegisteredTool[] {
  return [
    createTaskCreateTool(deps),
    createTaskGetTool(deps),
    createTaskUpdateTool(deps),
    createTaskListTool(deps),
  ];
}
