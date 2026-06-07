import { createBuiltinTools, type BuiltinServices } from "./index.js";
import type { ToolProviderLoadResult } from "../toolTypes.js";

export function loadBuiltinTools(
  services: BuiltinServices,
): ToolProviderLoadResult {
  return {
    tools: createBuiltinTools(services),
    diagnostics: [],
  };
}
