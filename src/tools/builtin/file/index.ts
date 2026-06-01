import type { RegisteredTool } from "../../toolTypes.js";
import type { BuiltinToolDeps } from "../types.js";
import { createBashTool } from "./bashTool.js";
import { createEditFileTool } from "./editFileTool.js";
import { createReadFileTool } from "./readFileTool.js";
import { createWriteFileTool } from "./writeFileTool.js";

export function createFileTools(deps: BuiltinToolDeps): RegisteredTool[] {
  return [
    createBashTool(deps),
    createReadFileTool(deps),
    createWriteFileTool(deps),
    createEditFileTool(deps),
  ];
}
