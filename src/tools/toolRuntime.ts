import path from "node:path";
import { skillLoader } from "../runtime.js";
import { runBash } from "./bash.js";
import { runEditFile } from "./editFile.js";
import { runReadFile } from "./readFile.js";
import TaskManager from "./taskManager.js";
import { runWriteFile } from "./writeFile.js";

type ToolInput = Record<string, unknown>;
type ToolHandler = (input: ToolInput) => Promise<string>;

function hasOwn(input: ToolInput, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requireString(input: ToolInput, key: string): string | null {
  if (!hasOwn(input, key)) return null;
  return String(input[key] ?? "");
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
      return `<skill name="${name}">\n${skillLoader.getContent(name)}\n</skill>`;
    },
    task_create: async (input) => {
      const subject = requireString(input, "subject");
      if (!subject || subject.trim() === "") {
        return "Error: Missing required 'subject' for task_create.";
      }
      try {
        return this.taskManager.create(subject, requireString(input, "description") ?? "");
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
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
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
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
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    task_list: async () => {
      return this.taskManager.listAll();
    },
    task: async (input) => {
      const prompt = requireString(input, "prompt");
      if (!prompt || prompt.trim() === "") {
        return "Error: Missing required 'prompt' for task tool.";
      }

      const options: { maxTurns?: number; timeoutMs?: number } = {};
      const mt = optionalInteger(input, "max_turns");
      if (mt !== undefined) options.maxTurns = mt;
      const to = optionalInteger(input, "timeout_ms");
      if (to !== undefined) options.timeoutMs = to;

      try {
        const { runSubAgent } = await import("../subagent.js");
        return await runSubAgent(prompt, options);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };

  hasActiveTasks(): boolean {
    return this.taskManager.hasActive();
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
