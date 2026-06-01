import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";
import { withTeam } from "./shared.js";

export function createListTeammatesTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "list_teammates",
      description: "List all teammates with their name, role, and status.",
      input_schema: {
        type: "object",
        properties: {},
      },
    },
    () => withTeam(deps, (team) => team.listAll()),
  );
}
