import path from "node:path";
import { SkillLoader } from "./skills/skillLoader.js";
import { ToolRuntime } from "./tools/toolRuntime.js";

/**
 * Application context — holds stateful services that live for the
 * lifetime of the process and are shared across CLI / agentLoop /
 * subagent layers.
 */
export interface AppContext {
  skillLoader: SkillLoader;
  toolRuntime: ToolRuntime;
}

export function createAppContext(workspaceRoot: string): AppContext {
  const skillLoader = new SkillLoader(path.join(workspaceRoot, "skills"));
  const toolRuntime = new ToolRuntime(skillLoader);
  return { skillLoader, toolRuntime };
}
