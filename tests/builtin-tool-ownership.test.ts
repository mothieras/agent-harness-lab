import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const toolsRoot = path.join(process.cwd(), "src", "tools");
const builtinRoot = path.join(toolsRoot, "builtin");

test("builtin provider aggregates per-tool factories instead of a central handler file", async () => {
  const providerSource = await readFile(
    path.join(builtinRoot, "provider.ts"),
    "utf8",
  );

  assert.doesNotMatch(providerSource, /toolHandlers\.js/);
  assert.match(providerSource, /\.\/index\.js/);

  const expectedFactoryFiles = [
    "file/bashTool.ts",
    "file/readFileTool.ts",
    "file/writeFileTool.ts",
    "file/editFileTool.ts",
    "task/createTaskTool.ts",
    "task/getTaskTool.ts",
    "task/updateTaskTool.ts",
    "task/listTaskTool.ts",
    "skill/loadSkillTool.ts",
    "background/backgroundRunTool.ts",
    "background/checkBackgroundTool.ts",
    "team/listTeammatesTool.ts",
    "team/sendMessageTool.ts",
    "team/readInboxTool.ts",
    "team/broadcastTool.ts",
    "memory/updateMemoryTool.ts",
  ];

  const builtinFiles = await readdir(builtinRoot, { recursive: true });
  assert.deepEqual(
    expectedFactoryFiles.filter((file) => builtinFiles.includes(file)),
    expectedFactoryFiles,
  );

  await assert.rejects(access(path.join(toolsRoot, "builtinToolProvider.ts")));
  await assert.rejects(access(path.join(toolsRoot, "toolHandlers.ts")));
});
