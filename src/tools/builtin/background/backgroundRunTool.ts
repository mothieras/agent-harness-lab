import { requireNonEmptyString } from "../../input.js";
import type { BackgroundManager } from "../../backgroundManager.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool } from "../types.js";

export function createBackgroundRunTool(deps: {
  backgroundManager: BackgroundManager;
}): RegisteredTool {
  return builtinTool(
    {
      name: "background_run",
      description:
        "Run a shell command in the background. Returns task_id immediately; use check_background to poll for results.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run." },
        },
        required: ["command"],
      },
    },
    (input) => {
      const command = requireNonEmptyString(input, "command", "background_run");
      if ("error" in command) return command.error;
      return deps.backgroundManager.run(command.value);
    },
  );
}
