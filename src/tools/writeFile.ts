import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { safePath } from "./safePath.js";

export async function runWriteFile(pathArg: string, content: string): Promise<string> {
  try {
    const filePath = await safePath(pathArg);
    const parentDir = path.dirname(filePath);
    await mkdir(parentDir, { recursive: true });
    await writeFile(filePath, content, "utf8");
    return `Wrote ${content.length} bytes to ${pathArg}`;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Error: ${message}`;
  }
}
