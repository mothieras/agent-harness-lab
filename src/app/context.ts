import path from "node:path";
import { client, MODEL } from "../config.js";
import { MemoryManager } from "../memory/memoryManager.js";
import { SkillLoader } from "../skills/skillLoader.js";
import { TeammateManager } from "../team/teammateManager.js";
import { ToolRuntime } from "../tools/toolRuntime.js";

export interface AppContext {
  skillLoader: SkillLoader;
  memoryManager: MemoryManager;
  toolRuntime: ToolRuntime;
  teammateManager: TeammateManager;
}

export function createAppContext(workspaceRoot: string): AppContext {
  const skillLoader = new SkillLoader(path.join(workspaceRoot, "skills"));
  const memoryManager = new MemoryManager(
    path.join(workspaceRoot, ".memory"),
    client,
    MODEL!,
  );
  const toolRuntime = new ToolRuntime(skillLoader, memoryManager);
  const teammateManager = new TeammateManager();
  toolRuntime.setTeammateManager(teammateManager);
  return { skillLoader, memoryManager, toolRuntime, teammateManager };
}
