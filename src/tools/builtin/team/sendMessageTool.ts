import type { TeammateManager } from "../../../team/teammateManager.js";
import { agentIdentity } from "../../agentIdentity.js";
import { requireNonEmptyString, requireString, type ToolInput } from "../../input.js";
import type { RegisteredTool } from "../../toolTypes.js";
import { builtinTool, type BuiltinToolDeps } from "../types.js";
import { withTeam } from "./shared.js";

export function createSendMessageTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(
    {
      name: "send_message",
      description:
        "Send a message to a teammate's inbox. They will see it on their next turn.",
      input_schema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient teammate name (or 'lead')." },
          content: { type: "string", description: "Message content." },
          msg_type: {
            type: "string",
            enum: ["message", "broadcast", "shutdown_request", "shutdown_response", "plan_approval_response"],
            description: "Message type. Defaults to 'message'.",
          },
        },
        required: ["to", "content"],
      },
    },
    (input) => withTeam(deps, (team) => sendMessage(team, input)),
  );
}

function sendMessage(team: TeammateManager, input: ToolInput): string {
  const to = requireNonEmptyString(input, "to", "send_message");
  if ("error" in to) return to.error;
  const content = requireString(input, "content");
  if (content === null) return "Error: Missing required 'content' for send_message.";
  const from = agentIdentity.getStore() ?? "lead";
  return team.send(from, to.value, content, requireString(input, "msg_type") ?? "message");
}
