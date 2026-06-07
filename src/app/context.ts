import path from "node:path";
import { client, MODEL } from "../config.js";
import { HookBus } from "../hooks/hookBus.js";
import { MemoryManager } from "../tools/memory/memoryManager.js";
import type { CheckPermissionFn } from "../permission/types.js";
import { SkillLoader } from "../tools/skill/skillLoader.js";
import { BackgroundManager } from "../tools/background/backgroundManager.js";
import { loadBuiltinTools } from "../tools/builtins.js";
import { TaskManager } from "../tools/task/taskManager.js";
import { ToolRegistry } from "../tools/registry.js";
import { ToolRuntime } from "../tools/runtime.js";
import { validateToolProfiles } from "../tools/profiles.js";
import type { ToolProviderLoadResult } from "../tools/types.js";
import { SubAgentRunner } from "../tools/subagent/subAgentRunner.js";

export interface AppContext {
  workspaceRoot: string;
  hooks: HookBus;
  skillLoader: SkillLoader;
  memoryManager: MemoryManager;
  toolRegistry: ToolRegistry;
  toolRuntime: ToolRuntime;
  subAgentRunner: SubAgentRunner;
}

export type CreateAppContextOptions = {
  checkPermission?: CheckPermissionFn;
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
  const taskManager = new TaskManager(path.join(workspaceRoot, ".tasks"));
  const backgroundManager = new BackgroundManager(workspaceRoot);
  const toolRegistry = new ToolRegistry();
  const toolRuntime = new ToolRuntime({
    taskManager,
    backgroundManager,
    registry: toolRegistry,
  });
  const subAgentRunner = new SubAgentRunner(toolRuntime, hooks, workspaceRoot);
  const builtinTools = loadBuiltinTools({
    workspaceRoot,
    skillLoader,
    memoryManager,
    taskManager,
    backgroundManager,
    subAgentRunner,
    ...(options.checkPermission
      ? { checkPermission: options.checkPermission }
      : {}),
  });
  toolRegistry.registerMany(builtinTools.tools);
  toolRegistry.recordDiagnostics(builtinTools.diagnostics);
  for (const providerResult of options.toolProviderResults ?? []) {
    toolRegistry.registerMany(providerResult.tools);
    toolRegistry.recordDiagnostics(providerResult.diagnostics);
  }
  validateToolProfiles(toolRegistry);
  return {
    workspaceRoot,
    hooks,
    skillLoader,
    memoryManager,
    toolRegistry,
    toolRuntime,
    subAgentRunner,
  };
}
