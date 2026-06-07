import type { MemoryManager } from "../../memory/memoryManager.js";
import type { SkillLoader } from "../../skills/skillLoader.js";
import type { BackgroundManager } from "../backgroundManager.js";
import type { TaskManager } from "../taskManager.js";
import type { RegisteredTool } from "../toolTypes.js";
import { createBackgroundTools } from "./background/index.js";
import { createFileTools } from "./file/index.js";
import { createMemoryTools } from "./memory/index.js";
import { createSkillTools } from "./skill/index.js";
import { createTaskTools } from "./task/index.js";

export type BuiltinServices = {
  workspaceRoot: string;
  skillLoader: SkillLoader;
  memoryManager: MemoryManager;
  taskManager: TaskManager;
  backgroundManager: BackgroundManager;
};

export function createBuiltinTools(services: BuiltinServices): RegisteredTool[] {
  return [
    ...createFileTools({ workspaceRoot: services.workspaceRoot }),
    ...createTaskTools({ taskManager: services.taskManager }),
    ...createSkillTools({ skillLoader: services.skillLoader }),
    ...createBackgroundTools({ backgroundManager: services.backgroundManager }),
    ...createMemoryTools({ memoryManager: services.memoryManager }),
  ];
}
