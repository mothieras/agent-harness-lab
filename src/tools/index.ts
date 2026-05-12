import { TOOLS } from "./toolDefinitions.js";
import { ToolRuntime } from "./toolRuntime.js";

export function getTools(): typeof TOOLS {
  return TOOLS;
}

export function createToolRuntime(): ToolRuntime {
  return new ToolRuntime();
}
