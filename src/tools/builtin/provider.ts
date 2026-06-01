import {
  createBuiltinTools,
  type BuiltinToolDeps,
} from "./index.js";
import type { ToolProviderLoadResult } from "../toolTypes.js";

export function loadBuiltinTools(
  deps: BuiltinToolDeps,
): ToolProviderLoadResult {
  return {
    tools: createBuiltinTools(deps),
    diagnostics: [],
  };
}
