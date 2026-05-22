import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import type { MemoryManager } from "../memory/memoryManager.js";
import type { MemoryType } from "../memory/types.js";
import type { SkillLoader } from "../skills/skillLoader.js";
import type { TeammateManager } from "../team/teammateManager.js";
import { BackgroundManager } from "./backgroundManager.js";
import { runBash } from "./bashTool.js";
import { runEditFile } from "./editFileTool.js";
import { formatError } from "./formatError.js";
import { runReadFile } from "./readFileTool.js";
import { TaskManager } from "./taskManager.js";
import { runWriteFile } from "./writeFileTool.js";

export const agentIdentity = new AsyncLocalStorage<string>();

export type ToolInput = Record<string, unknown>;
export type ToolHandler = (input: ToolInput) => Promise<string> | string;

function hasOwn(input: ToolInput, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requireString(input: ToolInput, key: string): string | null {
  if (!hasOwn(input, key)) return null;
  const raw = input[key];
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  return null;
}

function requireInteger(input: ToolInput, key: string): number | null {
  if (!hasOwn(input, key)) return null;
  const raw = input[key];
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  return null;
}

function optionalInteger(input: ToolInput, key: string): number | undefined {
  const v = requireInteger(input, key);
  return v === null ? undefined : v;
}

function optionalArrayOfIntegers(input: ToolInput, key: string): number[] | undefined {
  if (!hasOwn(input, key)) return undefined;
  const raw = input[key];
  if (!Array.isArray(raw)) return undefined;
  const result = raw.filter((v) => typeof v === "number" && Number.isInteger(v)) as number[];
  return result;
}

export class ToolRuntime {
  private readonly taskManager = new TaskManager(
    path.join(process.cwd(), ".tasks"),
  );
  private readonly bg = new BackgroundManager();
  private readonly skillLoader: SkillLoader;
  private readonly memoryManager: MemoryManager;
  private teammateManager: TeammateManager | null = null;

  constructor(skillLoader: SkillLoader, memoryManager: MemoryManager) {
    this.skillLoader = skillLoader;
    this.memoryManager = memoryManager;
  }

  setTeammateManager(tm: TeammateManager): void {
    this.teammateManager = tm;
  }

  registerTool(name: string, handler: ToolHandler): void {
    this.handlers[name] = handler;
  }

  private readonly handlers: Record<string, ToolHandler> = {
    bash: async (input) => {
      const command = requireString(input, "command");
      if (!command || command.trim() === "") {
        return "Error: Missing required 'command' for bash tool.";
      }
      return runBash(command);
    },
    read_file: async (input) => {
      const filepath = requireString(input, "path");
      if (filepath === null) {
        return "Error: Missing required 'path' for read_file tool.";
      }
      return runReadFile(filepath, optionalInteger(input, "limit"));
    },
    write_file: async (input) => {
      const filepath = requireString(input, "path");
      if (filepath === null) {
        return "Error: Missing required 'path' for write_file tool.";
      }
      const content = requireString(input, "content");
      if (content === null) {
        return "Error: Missing required 'content' for write_file tool.";
      }
      return runWriteFile(filepath, content);
    },
    edit_file: async (input) => {
      const filepath = requireString(input, "path");
      if (filepath === null) {
        return "Error: Missing required 'path' for edit_file tool.";
      }
      const oldText = requireString(input, "old_text");
      if (oldText === null) {
        return "Error: Missing required 'old_text' for edit_file tool.";
      }
      const newText = requireString(input, "new_text");
      if (newText === null) {
        return "Error: Missing required 'new_text' for edit_file tool.";
      }
      return runEditFile(filepath, oldText, newText);
    },
    load_skill: async (input) => {
      const name = requireString(input, "name");
      if (!name || name.trim() === "") {
        return "Error: Missing required 'name' for load_skill tool.";
      }
      return `<skill name="${name}">\n${this.skillLoader.getContent(name)}\n</skill>`;
    },
    task_create: async (input) => {
      const subject = requireString(input, "subject");
      if (!subject || subject.trim() === "") {
        return "Error: Missing required 'subject' for task_create.";
      }
      try {
        return this.taskManager.create(subject, requireString(input, "description") ?? "");
      } catch (error) {
        return formatError(error);
      }
    },
    task_get: async (input) => {
      const taskId = requireInteger(input, "task_id");
      if (taskId === null) {
        return "Error: Missing required 'task_id' for task_get.";
      }
      try {
        return this.taskManager.get(taskId);
      } catch (error) {
        return formatError(error);
      }
    },
    task_update: async (input) => {
      const taskId = requireInteger(input, "task_id");
      if (taskId === null) {
        return "Error: Missing required 'task_id' for task_update.";
      }
      try {
        return this.taskManager.update(
          taskId,
          requireString(input, "status") ?? undefined,
          optionalArrayOfIntegers(input, "addBlockedBy"),
          optionalArrayOfIntegers(input, "removeBlockedBy"),
        );
      } catch (error) {
        return formatError(error);
      }
    },
    task_list: async () => {
      return this.taskManager.listAll();
    },
    background_run: async (input) => {
      const command = requireString(input, "command");
      if (!command || command.trim() === "") {
        return "Error: Missing required 'command' for background_run.";
      }
      return this.bg.run(command);
    },
    check_background: async (input) => {
      return this.bg.check(requireString(input, "task_id") ?? undefined);
    },
    list_teammates: async () => {
      if (!this.teammateManager) return "Error: Team not available.";
      return this.teammateManager.listAll();
    },
    send_message: async (input) => {
      if (!this.teammateManager) return "Error: Team not available.";
      const to = requireString(input, "to");
      if (!to || to.trim() === "") return "Error: Missing required 'to' for send_message.";
      const content = requireString(input, "content");
      if (content === null) return "Error: Missing required 'content' for send_message.";
      const from = agentIdentity.getStore() ?? "lead";
      return this.teammateManager.send(from, to, content, requireString(input, "msg_type") ?? "message");
    },
    read_inbox: async () => {
      if (!this.teammateManager) return "Error: Team not available.";
      const name = agentIdentity.getStore() ?? "lead";
      const msgs = this.teammateManager.drainInbox(name);
      if (msgs.length === 0) return "Inbox empty.";
      return JSON.stringify(msgs, null, 2);
    },
    broadcast: async (input) => {
      if (!this.teammateManager) return "Error: Team not available.";
      const content = requireString(input, "content");
      if (!content || content.trim() === "") return "Error: Missing required 'content' for broadcast.";
      const from = agentIdentity.getStore() ?? "lead";
      return this.teammateManager.broadcast(from, content);
    },
    update_memory: async (input) => {
      const name = requireString(input, "name");
      if (!name || name.trim() === "") return "Error: Missing required 'name' for update_memory.";
      const type = requireString(input, "type") ?? "user";
      if (!["user", "feedback", "project", "reference"].includes(type)) {
        return `Error: Invalid type '${type}'. Must be user, feedback, project, or reference.`;
      }
      const description = requireString(input, "description");
      if (!description || description.trim() === "") return "Error: Missing required 'description' for update_memory.";
      const body = requireString(input, "body");
      if (!body || body.trim() === "") return "Error: Missing required 'body' for update_memory.";
      const filename = this.memoryManager.write(name, type as MemoryType, description, body);
      return `Memory saved: ${filename}`;
    },
  };

  clearTasksIfAllDone(): boolean {
    return this.taskManager.clearIfAllCompleted();
  }

  hasActiveTasks(): boolean {
    return this.taskManager.hasActive();
  }

  taskSummary(): string | null {
    // For LLM injection — includes descriptions and dependency info.
    // LLM can call task_get for full detail on a specific task.
    return this.taskManager.listAll();
  }

  taskStatusForUser(): string | null {
    // Compact list with [ ] markers for terminal display
    const list = this.taskManager.listAll();
    if (list === "No tasks.") return null;
    return list;
  }

  hasRunningBackgroundTasks(): boolean {
    return this.bg.hasRunning();
  }

  drainBackgroundNotifications(): string | null {
    const notifs = this.bg.drainNotifications();
    if (notifs.length === 0) return null;
    return notifs
      .map(
        (n) =>
          `[bg:${n.taskId}] ${n.status}: ${n.result}`,
      )
      .join("\n");
  }

  async invokeTool(name: string, input: unknown): Promise<string> {
    const handler = this.handlers[name];
    if (!handler) {
      return `Error: Unsupported tool '${name}'.`;
    }

    const normalizedInput =
      typeof input === "object" && input !== null ? (input as ToolInput) : {};

    return handler(normalizedInput);
  }
}
