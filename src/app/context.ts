import path from "node:path";
import { client, MODEL } from "../config.js";
import { HookBus } from "../hooks/index.js";
import { MemoryManager } from "../memory/memoryManager.js";
import type { CheckPermissionFn } from "../permission/types.js";
import { SkillLoader } from "../skills/skillLoader.js";
import { TeammateManager } from "../team/teammateManager.js";
import { BackgroundManager } from "../tools/backgroundManager.js";
import { loadBuiltinTools } from "../tools/builtin/provider.js";
import { TaskManager } from "../tools/taskManager.js";
import { ToolRegistry } from "../tools/toolRegistry.js";
import { ToolRuntime } from "../tools/toolRuntime.js";
import { validateToolProfiles } from "../tools/toolProfiles.js";
import type { ToolProviderLoadResult } from "../tools/toolTypes.js";
import { SubAgentRunner } from "../agent/subAgentRunner.js";

export interface AppContext {
  workspaceRoot: string;
  hooks: HookBus;
  checkPermission?: CheckPermissionFn;
  skillLoader: SkillLoader;
  memoryManager: MemoryManager;
  toolRegistry: ToolRegistry;
  toolRuntime: ToolRuntime;
  teammateManager: TeammateManager;
  subAgentRunner: SubAgentRunner;
}

export type CreateAppContextOptions = {
  toolProviderResults?: ToolProviderLoadResult[];
};

export function createAppContext(
  workspaceRoot: string,
  options: CreateAppContextOptions = {},
): AppContext {
  const skillLoader = new SkillLoader(path.join(workspaceRoot, "skills"));
  const hooks = new HookBus();
  const memoryManager = new MemoryManager(
    path.join(workspaceRoot, ".memory"),
    client,
    MODEL!,
  );
  const teammateManager = new TeammateManager();
  const taskManager = new TaskManager(path.join(workspaceRoot, ".tasks"));
  const backgroundManager = new BackgroundManager(workspaceRoot);
  const toolRegistry = new ToolRegistry();
  const builtinTools = loadBuiltinTools({
    workspaceRoot,
    skillLoader,
    memoryManager,
    taskManager,
    backgroundManager,
    getTeammateManager: () => teammateManager,
  });
  toolRegistry.registerMany(builtinTools.tools);
  toolRegistry.recordDiagnostics(builtinTools.diagnostics);
  for (const providerResult of options.toolProviderResults ?? []) {
    toolRegistry.registerMany(providerResult.tools);
    toolRegistry.recordDiagnostics(providerResult.diagnostics);
  }
  validateToolProfiles(toolRegistry);
  const toolRuntime = new ToolRuntime({
    taskManager,
    backgroundManager,
    registry: toolRegistry,
  });
  const subAgentRunner = new SubAgentRunner(toolRuntime, hooks, workspaceRoot);
  return {
    workspaceRoot,
    hooks,
    skillLoader,
    memoryManager,
    toolRegistry,
    toolRuntime,
    teammateManager,
    subAgentRunner,
  };
}
