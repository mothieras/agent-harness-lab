import type { BackgroundManager } from "../../backgroundManager.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { createBackgroundRunTool } from "./backgroundRunTool.js";
import { createCheckBackgroundTool } from "./checkBackgroundTool.js";

export function createBackgroundTools(deps: {
  backgroundManager: BackgroundManager;
}): RegisteredTool[] {
  return [
    createBackgroundRunTool(deps),
    createCheckBackgroundTool(deps),
  ];
}
