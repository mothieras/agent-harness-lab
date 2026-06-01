import type { MemoryManager } from "../../memory/memoryManager.js";
import type { SkillLoader } from "../../skills/skillLoader.js";
import type { TeammateManager } from "../../team/teammateManager.js";
import type { BackgroundManager } from "../backgroundManager.js";
import type { ToolHandler } from "../input.js";
import type { TaskManager } from "../taskManager.js";
import type { RegisteredTool, ToolDefinition } from "../toolTypes.js";

export type BuiltinToolDeps = {
  workspaceRoot: string;
  skillLoader: SkillLoader;
  memoryManager: MemoryManager;
  taskManager: TaskManager;
  backgroundManager: BackgroundManager;
  getTeammateManager: () => TeammateManager | null;
};

export function builtinTool(
  definition: ToolDefinition,
  handler: ToolHandler,
): RegisteredTool {
  return {
    name: definition.name,
    definition,
    handler,
    source: { type: "builtin" },
  };
}
