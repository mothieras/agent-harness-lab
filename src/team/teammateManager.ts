import * as fs from "node:fs";
import * as path from "node:path";
import type { TeamConfig, TeamMember, TeamMessage } from "./types.js";
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
  private config: TeamConfig;
  private readonly configPath: string;
  private readonly inboxes = new Map<string, TeamMessage[]>();
  private readonly notifications: string[] = [];

  constructor(private readonly teamDir: string) {
    this.configPath = path.join(teamDir, "config.json");
    this.config = this.loadConfig();
  }

  private loadConfig(): TeamConfig {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
    } catch {
      return { team_name: "default", members: [] };
    }
  }

  private saveConfig(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  spawn(name: string, role: string, prompt: string): string {
    const existing = this.config.members.find((m) => m.name === name);
    if (existing) {
      if (existing.status === "working") {
        return `Error: '${name}' is currently working. Wait or spawn someone else.`;
      }
      existing.status = "working";
      existing.role = role;
    } else {
      this.config.members.push({ name, role, status: "working" });
    }
    this.saveConfig();

    // Fire-and-forget: the caller (agentLoop with beforeTurn hook) starts the
    // teammate loop by passing this manager so tools can interact with it.
    // The actual launch happens in the tool handler via agentLoop().

    return `Spawned '${name}' (role: ${role}). Use send_message to communicate.`;
  }

  registerLoop(name: string, loop: Promise<unknown>): void {
    loop.finally(() => {
      const member = this.config.members.find((m) => m.name === name);
      if (member && member.status !== "shutdown") {
        member.status = "idle";
        this.saveConfig();
        this.notifications.push(
          `Teammate '${name}' (${member.role}) finished and is now idle.`,
        );
      }
    });
  }

  send(from: string, to: string, content: string, msgType = "message"): string {
    if (!VALID_MSG_TYPES.includes(msgType as typeof VALID_MSG_TYPES[number])) {
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
    for (const member of this.config.members) {
      if (member.name !== from) {
        this.send(from, member.name, content, "broadcast");
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
    if (this.config.members.length === 0) return "No teammates.";
    return [
      `Team: ${this.config.team_name}`,
      ...this.config.members.map(
        (m) => `  ${m.name} (${m.role}): ${m.status}`,
      ),
    ].join("\n");
  }

  memberNames(): string[] {
    return this.config.members.map((m) => m.name);
  }

  findByStatus(status: string): TeamMember | undefined {
    return this.config.members.find((m) => m.status === status);
  }
}
