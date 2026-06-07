import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const toolsRoot = path.join(process.cwd(), "src", "tools");

test("builtins aggregates per-tool factories instead of a central handler file", async () => {
  const builtinsSource = await readFile(
    path.join(toolsRoot, "builtins.ts"),
    "utf8",
  );

  assert.doesNotMatch(builtinsSource, /toolHandlers\.js/);
  assert.match(builtinsSource, /\.\/file\/index\.js/);

  const expectedFactoryFiles = [
    "file/bash.ts",
    "file/read.ts",
    "file/write.ts",
    "file/edit.ts",
    "task/create.ts",
    "task/get.ts",
    "task/update.ts",
    "task/list.ts",
    "background/run.ts",
    "background/check.ts",
    "subagent/subagentTool.ts",
    "subagent/checkTool.ts",
    "skill/load.ts",
    "memory/save.ts",
  ];

  const toolFiles = await readdir(toolsRoot, { recursive: true });
  assert.deepEqual(
    expectedFactoryFiles.filter((file) => toolFiles.includes(file)),
    expectedFactoryFiles,
  );

  await assert.rejects(access(path.join(toolsRoot, "builtin")));
  await assert.rejects(access(path.join(toolsRoot, "toolHandlers.ts")));
});
