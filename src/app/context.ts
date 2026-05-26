import path from "node:path";
import { client, MODEL } from "../config.js";
import { HookBus } from "../hooks/index.js";
import { MemoryManager } from "../memory/memoryManager.js";
import type { CheckPermissionFn } from "../permission/types.js";
import { SkillLoader } from "../skills/skillLoader.js";
import { TeammateManager } from "../team/teammateManager.js";
import { ToolRuntime } from "../tools/toolRuntime.js";

export interface AppContext {
  workspaceRoot: string;
  hooks: HookBus;
  checkPermission?: CheckPermissionFn;
  skillLoader: SkillLoader;
  memoryManager: MemoryManager;
  toolRuntime: ToolRuntime;
  teammateManager: TeammateManager;
}

export function createAppContext(workspaceRoot: string): AppContext {
  const skillLoader = new SkillLoader(path.join(workspaceRoot, "skills"));
  const hooks = new HookBus();
  const memoryManager = new MemoryManager(
    path.join(workspaceRoot, ".memory"),
    client,
    MODEL!,
  );
  const toolRuntime = new ToolRuntime(skillLoader, memoryManager, workspaceRoot);
  const teammateManager = new TeammateManager();
  toolRuntime.setTeammateManager(teammateManager);
  return {
    workspaceRoot,
    hooks,
    skillLoader,
    memoryManager,
    toolRuntime,
    teammateManager,
  };
}
