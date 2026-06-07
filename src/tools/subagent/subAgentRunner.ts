import crypto from "node:crypto";
import { runSubAgent } from "./subagent.js";
import type { SubAgentOptions } from "./subagent.js";
import {
  DEFAULT_SUB_AGENT_MAX_TURNS,
  DEFAULT_SUB_AGENT_TIMEOUT_MS,
} from "../../loop/options.js";
import { agentIdentity } from "../identity.js";
import type { HookBus } from "../../hooks/hookBus.js";
import type { CheckPermissionFn } from "../../permission/types.js";
import type { ToolRuntime } from "../runtime.js";

type SubStatus = "running" | "completed" | "error";

interface SubTask {
  status: SubStatus;
  result: string | null;
  prompt: string;
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
};

const DEFAULT_MAX_CONCURRENT = 3;

export class SubAgentRunner {
  private subs = new Map<string, SubTask>();
  private notifications: SubNotification[] = [];

  constructor(
    private readonly toolRuntime: ToolRuntime,
    private readonly hooks: HookBus,
    private readonly workspaceRoot: string,
    private readonly maxConcurrent: number = DEFAULT_MAX_CONCURRENT,
  ) {}

  run(prompt: string, options: SubAgentRunOptions = {}): string {
    if (this.runningCount() >= this.maxConcurrent) {
      return `Error: too many running subagents (max ${this.maxConcurrent}). Wait for one to finish.`;
    }

    const subId = crypto.randomUUID().slice(0, 8);
    const entry: SubTask = { status: "running", result: null, prompt };
    if (options.taskId) entry.taskId = options.taskId;
    this.subs.set(subId, entry);

    const subOptions: SubAgentOptions = {
      hooks: this.hooks,
      workspaceRoot: this.workspaceRoot,
      maxTurns: options.maxTurns ?? DEFAULT_SUB_AGENT_MAX_TURNS,
      timeoutMs: options.timeoutMs ?? DEFAULT_SUB_AGENT_TIMEOUT_MS,
    };
    if (options.name) subOptions.name = options.name;
    if (options.role) subOptions.role = options.role;
    if (options.checkPermission) subOptions.checkPermission = options.checkPermission;

    void agentIdentity
      .run(subId, () => runSubAgent(prompt, this.toolRuntime, subOptions))
      .then((result) => this.settle(subId, "completed", result))
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
      return `[${t.status}] ${t.prompt.slice(0, 60)}\n${t.result ?? "(running)"}`;
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
