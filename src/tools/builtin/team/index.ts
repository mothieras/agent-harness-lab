import type { RegisteredTool } from "../../toolTypes.js";
import type { BuiltinToolDeps } from "../types.js";
import { createBroadcastTool } from "./broadcastTool.js";
import { createListTeammatesTool } from "./listTeammatesTool.js";
import { createReadInboxTool } from "./readInboxTool.js";
import { createSendMessageTool } from "./sendMessageTool.js";

export function createTeamTools(deps: BuiltinToolDeps): RegisteredTool[] {
  return [
    createListTeammatesTool(deps),
    createSendMessageTool(deps),
    createReadInboxTool(deps),
    createBroadcastTool(deps),
  ];
}
