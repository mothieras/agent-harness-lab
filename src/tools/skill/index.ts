import type { SkillLoader } from "./skillLoader.js";
import type { RegisteredTool } from "../types.js";
import { createLoadSkillTool } from "./load.js";

export function createSkillTools(deps: {
  skillLoader: SkillLoader;
}): RegisteredTool[] {
  return [createLoadSkillTool(deps)];
}
