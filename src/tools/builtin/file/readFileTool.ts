import { optionalInteger, requireString } from "../../input.js";
import { runReadFile } from "./runReadFile.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createReadFileTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "read_file",
      description: "Read file contents.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          limit: { type: "integer" },
        },
        required: ["path"],
      },
    },
    (input) => {
      const filepath = requireString(input, "path");
      if (filepath === null) return "Error: Missing required 'path' for read_file tool.";
      return runReadFile(filepath, deps.workspaceRoot, optionalInteger(input, "limit"));
    },
  );
}
