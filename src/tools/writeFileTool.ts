import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatError } from "./formatError.js";
import { safePath } from "./safePath.js";

export async function runWriteFile(
  pathArg: string,
  content: string,
  workspaceRoot: string,
): Promise<string> {
  try {
    const filePath = await safePath(pathArg, workspaceRoot);
    const parentDir = path.dirname(filePath);
    await mkdir(parentDir, { recursive: true });
    await writeFile(filePath, content, "utf8");
    return `Wrote ${content.length} bytes to ${pathArg}`;
  } catch (e) {
    return formatError(e);
  }
}
