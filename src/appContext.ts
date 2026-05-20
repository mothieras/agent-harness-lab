import path from "node:path";
import { SkillLoader } from "./skills/skillLoader.js";
import { TeammateManager } from "./team/teammateManager.js";
import { ToolRuntime } from "./tools/toolRuntime.js";

/**
 * Application context — holds stateful services that live for the
 * lifetime of the process and are shared across CLI / agentLoop /
 * subagent layers.
 */
export interface AppContext {
  skillLoader: SkillLoader;
  toolRuntime: ToolRuntime;
  teammateManager: TeammateManager;
}

export function createAppContext(workspaceRoot: string): AppContext {
  const skillLoader = new SkillLoader(path.join(workspaceRoot, "skills"));
  const toolRuntime = new ToolRuntime(skillLoader);
  const teammateManager = new TeammateManager(path.join(workspaceRoot, ".team"));
  toolRuntime.setTeammateManager(teammateManager);
  return { skillLoader, toolRuntime, teammateManager };
}
