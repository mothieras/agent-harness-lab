import type { ToolHandler } from "../input.js";
import type { RegisteredTool, ToolDefinition } from "../toolTypes.js";

export function builtinTool(
  definition: ToolDefinition,
  handler: ToolHandler,
): RegisteredTool {
  return {
    name: definition.name,
    definition,
    handler,
    source: { type: "builtin" },
  };
}
