import type { TeammateManager } from "../../../team/teammateManager.js";
import { agentIdentity } from "../../agentIdentity.js";
import { requireNonEmptyString, type ToolInput } from "../../input.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";
import { withTeam } from "./shared.js";

export function createBroadcastTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "broadcast",
      description: "Send a message to all teammates at once.",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Message to broadcast." },
        },
        required: ["content"],
      },
    },
    (input) => withTeam(deps, (team) => broadcast(team, input)),
  );
}

function broadcast(team: TeammateManager, input: ToolInput): string {
  const content = requireNonEmptyString(input, "content", "broadcast");
  if ("error" in content) return content.error;
  const from = agentIdentity.getStore() ?? "lead";
  return team.broadcast(from, content.value);
}
