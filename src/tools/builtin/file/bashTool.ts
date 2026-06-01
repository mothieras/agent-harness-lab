import { runBash } from "./runBash.js";
import { requireNonEmptyString } from "../../input.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";

export function createBashTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "bash",
      description: "Run a shell command.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
    (input) => {
      const command = requireNonEmptyString(input, "command", "bash tool");
      if ("error" in command) return command.error;
      return runBash(command.value, deps.workspaceRoot);
    },
  );
}
