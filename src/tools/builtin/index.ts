import type { RegisteredTool } from "../toolTypes.js";
import { createBackgroundTools } from "./background/index.js";
import { createFileTools } from "./file/index.js";
import { createMemoryTools } from "./memory/index.js";
import { createSkillTools } from "./skill/index.js";
import { createTaskTools } from "./task/index.js";
import type { BuiltinToolDeps } from "./types.js";

export type { BuiltinToolDeps } from "./types.js";

export function createBuiltinTools(deps: BuiltinToolDeps): RegisteredTool[] {
  return [
    ...createFileTools(deps),
    ...createTaskTools(deps),
    ...createSkillTools(deps),
    ...createBackgroundTools(deps),
    ...createMemoryTools(deps),
  ];
}
