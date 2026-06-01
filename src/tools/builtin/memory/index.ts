import type { RegisteredTool } from "../../toolTypes.js";
import type { BuiltinToolDeps } from "../types.js";
import { createUpdateMemoryTool } from "./updateMemoryTool.js";

export function createMemoryTools(deps: BuiltinToolDeps): RegisteredTool[] {
  return [createUpdateMemoryTool(deps)];
}
