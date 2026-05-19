import { readFile, writeFile } from "node:fs/promises";
import { formatError } from "./formatError.js";
import { safePath } from "./safePath.js";

export async function runEditFile(
  pathArg: string,
  oldText: string,
  newText: string,
): Promise<string> {
  try {
    const filePath = await safePath(pathArg);
    const content = await readFile(filePath, "utf8");
    if (!content.includes(oldText)) {
      return `Error: Text not found in ${pathArg}`;
    }
    await writeFile(filePath, content.replace(oldText, newText), "utf8");
    return `Edited ${pathArg}`;
  } catch (e) {
    return formatError(e);
  }
}
