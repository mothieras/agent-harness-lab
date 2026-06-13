import crypto from "node:crypto";
import type { Agent } from "../../agent.js";
import { agentLoop } from "../../loop/loop.js";
import { describeFinalResponse } from "../../loop/response.js";
import { forkSubAgent } from "./subagent.js";
import type { SubAgentOptions } from "./subagent.js";
import type { CheckPermissionFn } from "../../permission/types.js";

type SubStatus = "running" | "completed" | "error";

interface SubTask {
  status: SubStatus;
  result: string | null;
  prompt: string;
  /** The live child agent instance — its messages are the subagent's conversation. */
  agent: Agent;
  taskId?: string;
}

export interface SubNotification {
  subId: string;
  status: SubStatus;
  prompt: string;
  result: string;
  taskId?: string;
}

export type SubAgentRunOptions = {
  name?: string;
  role?: string;
  maxTurns?: number;
  timeoutMs?: number;
  taskId?: string;
  checkPermission?: CheckPermissionFn;
  allowedTools?: readonly string[];
};

const DEFAULT_MAX_CONCURRENT = 3;

export class SubAgentRunner {
  private subs = new Map<string, SubTask>();
  private notifications: SubNotification[] = [];

  constructor(private readonly maxConcurrent: number = DEFAULT_MAX_CONCURRENT) {}

  run(parent: Agent, prompt: string, options: SubAgentRunOptions = {}): string {
    if (this.runningCount() >= this.maxConcurrent) {
      return `Error: too many running subagents (max ${this.maxConcurrent}). Wait for one to finish.`;
    }

    const subId = crypto.randomUUID().slice(0, 8);

    const forkOptions: SubAgentOptions = {};
    if (options.name) forkOptions.name = options.name;
    if (options.role) forkOptions.role = options.role;
    if (options.maxTurns !== undefined) forkOptions.maxTurns = options.maxTurns;
    if (options.timeoutMs !== undefined) forkOptions.timeoutMs = options.timeoutMs;
    if (options.checkPermission) forkOptions.checkPermission = options.checkPermission;
    if (options.allowedTools) forkOptions.allowedTools = options.allowedTools;

    const child = forkSubAgent(parent, subId, prompt, forkOptions);

    const entry: SubTask = { status: "running", result: null, prompt, agent: child };
    if (options.taskId) entry.taskId = options.taskId;
    this.subs.set(subId, entry);

    // No identity wrapper needed: agentLoop binds `currentAgent` to `child`,
    // and child.id === subId, so per-agent hook state keys correctly.
    void agentLoop(child)
      .then(({ content, stopReason }) =>
        this.settle(subId, "completed", describeFinalResponse(content, stopReason)),
      )
      .catch((error) =>
        this.settle(
          subId,
          "error",
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );

    return `Subagent ${subId} started: ${prompt.slice(0, 80)}`;
  }

  check(subId?: string): string {
    if (subId) {
      const t = this.subs.get(subId);
      if (!t) return `Error: Unknown subagent ${subId}`;
      const detail =
        t.result ?? `(running — ${t.agent.messages.length} messages so far)`;
      return `[${t.status}] ${t.prompt.slice(0, 60)}\n${detail}`;
    }
    if (this.subs.size === 0) return "No subagents.";
    const lines: string[] = [];
    for (const [sid, t] of this.subs) {
      lines.push(`${sid}: [${t.status}] ${t.prompt.slice(0, 60)}`);
    }
    return lines.join("\n");
  }

  hasRunning(): boolean {
    return this.runningCount() > 0;
  }

  drainNotifications(): SubNotification[] {
    const notifs = this.notifications.slice();
    this.notifications = [];
    for (const n of notifs) {
      if (n.status !== "running") this.subs.delete(n.subId);
    }
    return notifs;
  }

  private runningCount(): number {
    let n = 0;
    for (const t of this.subs.values()) if (t.status === "running") n += 1;
    return n;
  }

  private settle(subId: string, status: SubStatus, result: string): void {
    const t = this.subs.get(subId);
    if (!t) return;
    t.status = status;
    t.result = result;
    const notif: SubNotification = {
      subId,
      status,
      prompt: t.prompt.slice(0, 80),
      result: result || "(no output)",
    };
    if (t.taskId) notif.taskId = t.taskId;
    this.notifications.push(notif);
  }
}
