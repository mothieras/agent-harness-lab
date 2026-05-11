import { readFile } from "node:fs/promises";
import { safePath } from "./safePath.js";

const MAX_OUTPUT_CHARS = 50_000;

export async function runReadFile(pathArg: string, limit?: number): Promise<string> {
  try {
    const text = await readFile(await safePath(pathArg), "utf8");
    let lines = text.split(/\r?\n/);

    // Match Python's `if limit and limit < len(lines)` behavior.
    if (limit && limit < lines.length) {
      lines = lines.slice(0, limit).concat(`... (${lines.length - limit} more lines)`);
    }

    return lines.join("\n").slice(0, MAX_OUTPUT_CHARS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Error: ${message}`;
  }
}
