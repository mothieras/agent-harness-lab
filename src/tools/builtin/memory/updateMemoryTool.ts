import type { MemoryManager } from "../../../memory/memoryManager.js";
import type { MemoryType } from "../../../memory/types.js";
import { requireNonEmptyString, requireString, type ToolInput } from "../../input.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool } from "../types.js";

export function createUpdateMemoryTool(deps: {
  memoryManager: MemoryManager;
}): RegisteredTool {
  return builtinTool(
    {
      name: "update_memory",
      description:
        "Create or update a memory in persistent storage. Memories survive context compaction and session restarts. Use when the user expresses a preference, gives feedback, shares project context, or mentions a useful reference.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short kebab-case identifier (e.g. 'user-preference-tabs')." },
          type: { type: "string", enum: ["user", "feedback", "project", "reference"], description: "Memory type: user (user preference), feedback (guidance), project (project fact), reference (external pointer)." },
          description: { type: "string", description: "One-line summary for index lookup." },
          body: { type: "string", description: "Full detail in markdown. Include Why and How to apply sections." },
        },
        required: ["name", "type", "description", "body"],
      },
    },
    (input) => updateMemory(input, deps.memoryManager),
  );
}

function updateMemory(input: ToolInput, memoryManager: MemoryManager): string {
  const name = requireNonEmptyString(input, "name", "update_memory");
  if ("error" in name) return name.error;
  const type = requireString(input, "type") ?? "user";
  if (!["user", "feedback", "project", "reference"].includes(type)) {
    return `Error: Invalid type '${type}'. Must be user, feedback, project, or reference.`;
  }
  const description = requireNonEmptyString(input, "description", "update_memory");
  if ("error" in description) return description.error;
  const body = requireNonEmptyString(input, "body", "update_memory");
  if ("error" in body) return body.error;
  const filename = memoryManager.write(
    name.value,
    type as MemoryType,
    description.value,
    body.value,
  );
  return `Memory saved: ${filename}`;
}
