import { runBash } from "./bash.js";
import { runEditFile } from "./editFile.js";
import { runReadFile } from "./readFile.js";
import TodoManager from "./todoManager.js";
import { runWriteFile } from "./writeFile.js";

type ToolInput = Record<string, unknown>;
type ToolHandler = (input: ToolInput) => Promise<string>;
type TodoStatus = "pending" | "in_progress" | "completed";

type TodoItemInput = {
  id: string;
  text: string;
  status: TodoStatus;
};

function hasOwn(input: ToolInput, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requireString(input: ToolInput, key: string): string | null {
  if (!hasOwn(input, key)) return null;
  return String(input[key] ?? "");
}

function optionalLimit(input: ToolInput): number | undefined {
  if (!hasOwn(input, "limit")) return undefined;
  const raw = input.limit;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  return undefined;
}

function requireItems(input: ToolInput): TodoItemInput[] | null {
  if (!hasOwn(input, "items")) return null;
  const raw = input.items;
  if (!Array.isArray(raw)) return [];
  return raw as TodoItemInput[];
}

export class ToolRuntime {
  private readonly todoManager = new TodoManager();

  private readonly handlers: Record<string, ToolHandler> = {
    bash: async (input) => {
      const command = requireString(input, "command");
      if (!command || command.trim() === "") {
        return "Error: Missing required 'command' for bash tool.";
      }
      return runBash(command);
    },
    read_file: async (input) => {
      const path = requireString(input, "path");
      if (path === null) {
        return "Error: Missing required 'path' for read_file tool.";
      }
      return runReadFile(path, optionalLimit(input));
    },
    write_file: async (input) => {
      const path = requireString(input, "path");
      if (path === null) {
        return "Error: Missing required 'path' for write_file tool.";
      }
      const content = requireString(input, "content");
      if (content === null) {
        return "Error: Missing required 'content' for write_file tool.";
      }
      return runWriteFile(path, content);
    },
    edit_file: async (input) => {
      const path = requireString(input, "path");
      if (path === null) {
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
      return runEditFile(path, oldText, newText);
    },
    todo: async (input) => {
      const items = requireItems(input);
      if (items === null) {
        return "Error: Missing required 'items' for todo tool.";
      }
      if (!Array.isArray(input.items)) {
        return "Error: 'items' must be an array for todo tool.";
      }
      try {
        return this.todoManager.update(items);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };

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
