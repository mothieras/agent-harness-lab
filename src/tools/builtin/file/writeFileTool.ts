import { requireString } from "../../input.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { runWriteFile } from "./runWriteFile.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createWriteFileTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "write_file",
      description: "Write content to file.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    (input) => {
      const filepath = requireString(input, "path");
      if (filepath === null) return "Error: Missing required 'path' for write_file tool.";
      const content = requireString(input, "content");
      if (content === null) return "Error: Missing required 'content' for write_file tool.";
      return runWriteFile(filepath, content, deps.workspaceRoot);
    },
  );
}
