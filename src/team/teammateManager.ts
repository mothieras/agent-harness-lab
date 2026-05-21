import type { TeamMember, TeamMessage } from "./types.js";
import { VALID_MSG_TYPES } from "./types.js";

export const TEAMMATE_ALLOWED_TOOLS = [
  "bash",
  "read_file",
  "write_file",
  "edit_file",
  "send_message",
  "read_inbox",
];

export class TeammateManager {
  private readonly members = new Map<string, TeamMember>();
  private readonly inboxes = new Map<string, TeamMessage[]>();
  private readonly notifications: string[] = [];

  spawn(name: string, role: string, prompt: string): string {
    const existing = this.members.get(name);
    if (existing) {
      if (existing.status === "working") {
        return `Error: '${name}' is currently working. Wait or spawn someone else.`;
      }
      existing.status = "working";
      existing.role = role;
    } else {
      this.members.set(name, { name, role, status: "working" });
    }

    return `Spawned '${name}' (role: ${role}). Use send_message to communicate.`;
  }

  registerLoop(name: string, loop: Promise<unknown>): void {
    loop.finally(() => {
      const member = this.members.get(name);
      if (member && member.status !== "shutdown") {
        member.status = "idle";
        this.notifications.push(
          `Teammate '${name}' (${member.role}) finished and is now idle.`,
        );
      }
    });
  }

  send(from: string, to: string, content: string, msgType = "message"): string {
    if (!VALID_MSG_TYPES.includes(msgType as (typeof VALID_MSG_TYPES)[number])) {
      return `Error: Invalid message type '${msgType}'. Valid types: ${VALID_MSG_TYPES.join(", ")}`;
    }
    const msg: TeamMessage = {
      type: msgType as TeamMessage["type"],
      from,
      content,
      timestamp: Date.now() / 1000,
    };
    if (!this.inboxes.has(to)) {
      this.inboxes.set(to, []);
    }
    this.inboxes.get(to)!.push(msg);
    return `Sent ${msgType} to ${to}`;
  }

  broadcast(from: string, content: string): string {
    let count = 0;
    for (const name of this.members.keys()) {
      if (name !== from) {
        this.send(from, name, content, "broadcast");
        count++;
      }
    }
    return `Broadcast to ${count} teammate(s)`;
  }

  drainInbox(name: string): TeamMessage[] {
    const msgs = this.inboxes.get(name) ?? [];
    this.inboxes.set(name, []);
    return msgs;
  }

  drainNotifications(): string | null {
    if (this.notifications.length === 0) return null;
    const lines = this.notifications.splice(0);
    return lines.join("\n");
  }

  listAll(): string {
    if (this.members.size === 0) return "No teammates.";
    const lines: string[] = [];
    for (const m of this.members.values()) {
      lines.push(`  ${m.name} (${m.role}): ${m.status}`);
    }
    return lines.join("\n");
  }
}
