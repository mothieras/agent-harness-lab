import type { RegisteredTool } from "../../toolTypes.js";
import type { BuiltinToolDeps } from "../types.js";
import { createLoadSkillTool } from "./loadSkillTool.js";

export function createSkillTools(deps: BuiltinToolDeps): RegisteredTool[] {
  return [createLoadSkillTool(deps)];
}
