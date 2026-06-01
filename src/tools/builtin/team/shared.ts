import type { TeammateManager } from "../../../team/teammateManager.js";
import type { BuiltinToolDeps } from "../types.js";

export function withTeam(
  deps: BuiltinToolDeps,
  callback: (team: TeammateManager) => string,
): string {
  const team = deps.getTeammateManager();
  if (!team) return "Error: Team not available.";
  return callback(team);
}
