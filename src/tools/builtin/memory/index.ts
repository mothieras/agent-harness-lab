import type { MemoryManager } from "../../../memory/memoryManager.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { createUpdateMemoryTool } from "./updateMemoryTool.js";

export function createMemoryTools(deps: {
  memoryManager: MemoryManager;
}): RegisteredTool[] {
  return [createUpdateMemoryTool(deps)];
}
