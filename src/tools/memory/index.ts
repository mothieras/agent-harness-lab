import type { MemoryManager } from "./memoryManager.js";
import type { RegisteredTool } from "../types.js";
import { createUpdateMemoryTool } from "./save.js";

export function createMemoryTools(deps: {
  memoryManager: MemoryManager;
}): RegisteredTool[] {
  return [createUpdateMemoryTool(deps)];
}
