import { runBash } from "./bash.js";
import { runEditFile } from "./editFile.js";
import { runReadFile } from "./readFile.js";
import { runWriteFile } from "./writeFile.js";

type ToolInput = Record<string, unknown>;
type ToolHandler = (input: ToolInput) => Promise<string>;

export const TOOLS = [
  {
    name: "bash",
    description: "Run a shell command.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read file contents.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace exact text in file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
];

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

const TOOL_HANDLERS: Record<string, ToolHandler> = {
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
};

export function getTools(): typeof TOOLS {
  return TOOLS;
}

export async function invokeTool(name: string, input: unknown): Promise<string> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return `Error: Unsupported tool '${name}'.`;
  }

  const normalizedInput =
    typeof input === "object" && input !== null ? (input as ToolInput) : {};

  return handler(normalizedInput);
}
