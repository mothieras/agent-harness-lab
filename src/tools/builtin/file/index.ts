import type { RegisteredTool } from "../../toolTypes.js";
import { createBashTool } from "./bashTool.js";
import { createEditFileTool } from "./editFileTool.js";
import { createReadFileTool } from "./readFileTool.js";
import { createWriteFileTool } from "./writeFileTool.js";

export function createFileTools(deps: {
  workspaceRoot: string;
}): RegisteredTool[] {
  return [
    createBashTool(deps),
    createReadFileTool(deps),
    createWriteFileTool(deps),
    createEditFileTool(deps),
  ];
}
