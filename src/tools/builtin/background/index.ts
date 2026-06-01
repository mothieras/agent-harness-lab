import type { RegisteredTool } from "../../toolTypes.js";
import type { BuiltinToolDeps } from "../types.js";
import { createBackgroundRunTool } from "./backgroundRunTool.js";
import { createCheckBackgroundTool } from "./checkBackgroundTool.js";

export function createBackgroundTools(deps: BuiltinToolDeps): RegisteredTool[] {
  return [
    createBackgroundRunTool(deps),
    createCheckBackgroundTool(deps),
  ];
}
