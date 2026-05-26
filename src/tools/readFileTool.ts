import { readFile } from "node:fs/promises";
import { formatError } from "./formatError.js";
import { safePath } from "./safePath.js";

const MAX_OUTPUT_CHARS = 50_000;

export async function runReadFile(
  pathArg: string,
  workspaceRoot: string,
  limit?: number,
): Promise<string> {
  try {
    const text = await readFile(await safePath(pathArg, workspaceRoot), "utf8");
    let lines = text.split(/\r?\n/);

    if (typeof limit === "number" && limit > 0 && limit < lines.length) {
      lines = lines.slice(0, limit).concat(`... (${lines.length - limit} more lines)`);
    }

    return lines.join("\n").slice(0, MAX_OUTPUT_CHARS);
  } catch (e) {
    return formatError(e);
  }
}
