import type { SkillLoader } from "../../../skills/skillLoader.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { createLoadSkillTool } from "./loadSkillTool.js";

export function createSkillTools(deps: {
  skillLoader: SkillLoader;
}): RegisteredTool[] {
  return [createLoadSkillTool(deps)];
}
