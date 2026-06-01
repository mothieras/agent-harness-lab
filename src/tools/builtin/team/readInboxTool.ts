import type { TeammateManager } from "../../../team/teammateManager.js";
import { agentIdentity } from "../../agentIdentity.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";
import { withTeam } from "./shared.js";

export function createReadInboxTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "read_inbox",
      description: "Read and drain your inbox. Returns messages sent to you since last read.",
      input_schema: {
        type: "object",
        properties: {},
      },
    },
    () => withTeam(deps, (team) => readInbox(team)),
  );
}

function readInbox(team: TeammateManager): string {
  const name = agentIdentity.getStore() ?? "lead";
  const messages = team.drainInbox(name);
  if (messages.length === 0) return "Inbox empty.";
  return JSON.stringify(messages, null, 2);
}
