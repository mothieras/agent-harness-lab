import { exec } from "node:child_process";
import crypto from "node:crypto";
import { isDangerousCommand } from "./bashTool.js";

type BgStatus = "running" | "completed" | "timeout" | "error";

interface BgTask {
  status: BgStatus;
  result: string | null;
  command: string;
}

interface BgNotification {
  taskId: string;
  status: BgStatus;
  command: string;
  result: string;
}

export class BackgroundManager {
  private tasks = new Map<string, BgTask>();
  private notifications: BgNotification[] = [];

  constructor(private readonly workspaceRoot: string) {}

  run(command: string): string {
    if (isDangerousCommand(command)) {
      return "Error: Dangerous command blocked";
    }
    const taskId = crypto.randomUUID().slice(0, 8);
    this.tasks.set(taskId, {
      status: "running",
      result: null,
      command,
    });

    exec(
      command,
      { cwd: this.workspaceRoot, timeout: 300_000 },
      (error, stdout, stderr) => {
        const task = this.tasks.get(taskId)!;
        const output = (stdout + stderr).trim() || "(no output)";

        if (error) {
          if (error.killed && error.signal === "SIGTERM") {
            task.status = "timeout";
            task.result = "Error: Timeout (300s)";
          } else {
            task.status = "error";
            task.result = `Error: ${error.message}`;
          }
        } else {
          task.status = "completed";
          task.result = output;
        }

        this.notifications.push({
          taskId,
          status: task.status,
          command: command.slice(0, 80),
          result: (task.result || "(no output)").slice(0, 500),
        });
      },
    );

    return `Background task ${taskId} started: ${command.slice(0, 80)}`;
  }

  check(taskId?: string): string {
    if (taskId) {
      const t = this.tasks.get(taskId);
      if (!t) return `Error: Unknown task ${taskId}`;
      return `[${t.status}] ${t.command.slice(0, 60)}\n${
        t.result ?? "(running)"
      }`;
    }

    if (this.tasks.size === 0) return "No background tasks.";

    const lines: string[] = [];
    for (const [tid, t] of this.tasks) {
      lines.push(`${tid}: [${t.status}] ${t.command.slice(0, 60)}`);
    }
    return lines.join("\n");
  }

  hasRunning(): boolean {
    for (const t of this.tasks.values()) {
      if (t.status === "running") return true;
    }
    return false;
  }

  drainNotifications(): BgNotification[] {
    const notifs = this.notifications.slice();
    this.notifications = [];
    for (const n of notifs) {
      if (n.status !== "running") {
        this.tasks.delete(n.taskId);
      }
    }
    return notifs;
  }
}
