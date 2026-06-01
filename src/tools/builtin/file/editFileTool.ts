import { runEditFile } from "./runEditFile.js";
import { requireString } from "../../input.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createEditFileTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "edit_file",
      description: "Replace exact text in file.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_text: { type: "string" },
          new_text: { type: "string" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
    (input) => {
      const filepath = requireString(input, "path");
      if (filepath === null) return "Error: Missing required 'path' for edit_file tool.";
      const oldText = requireString(input, "old_text");
      if (oldText === null) return "Error: Missing required 'old_text' for edit_file tool.";
      const newText = requireString(input, "new_text");
      if (newText === null) return "Error: Missing required 'new_text' for edit_file tool.";
      return runEditFile(filepath, oldText, newText, deps.workspaceRoot);
    },
  );
}
