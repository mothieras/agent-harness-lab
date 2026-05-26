import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { HookBus } from "../src/hooks/index.js";
import { TeammateManager } from "../src/team/teammateManager.js";
import { ToolRuntime } from "../src/tools/toolRuntime.js";

test("HookBus instances do not share registered callbacks", () => {
  const first = new HookBus();
  const second = new HookBus();

  first.register("Stop", () => "first");

  assert.equal(first.trigger("Stop"), "first");
  assert.equal(second.trigger("Stop"), null);
});

test("ToolRuntime resolves file tools against its workspace root", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(tmpdir());
    const runtime = new ToolRuntime(
      { getContent: () => "", getDescriptions: () => "" },
      {
        write: () => "memory.md",
        buildIndex: () => "",
      },
      workspace,
    );

    const output = await runtime.invokeTool("write_file", {
      path: "nested/example.txt",
      content: "workspace-root",
    });

    assert.match(output, /Wrote 14 bytes/);
    assert.equal(
      await readFile(path.join(workspace, "nested/example.txt"), "utf8"),
      "workspace-root",
    );
  } finally {
    process.chdir(previousCwd);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("TeammateManager records failed loops as failed", async () => {
  const manager = new TeammateManager();
  manager.spawn("tester", "qa", "check failure handling");

  manager.registerLoop("tester", Promise.reject(new Error("boom")));
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(manager.listAll(), /tester \(qa\): failed/);
  assert.match(manager.drainNotifications() ?? "", /failed: boom/);
});
