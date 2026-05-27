import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { HookBus } from "../src/hooks/index.js";
import { pushTaggedUserMessage } from "../src/app/messageInjection.js";
import { TeammateManager } from "../src/team/teammateManager.js";
import { agentIdentity } from "../src/tools/agentIdentity.js";
import { requireNonEmptyString } from "../src/tools/input.js";
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

test("ToolRuntime returns handler exceptions as error strings", async () => {
  const runtime = new ToolRuntime(
    { getContent: () => "", getDescriptions: () => "" },
    {
      write: () => "memory.md",
      buildIndex: () => "",
    },
    process.cwd(),
  );

  runtime.registerTool("explode", () => {
    throw new Error("boom");
  });
  runtime.registerTool("reject", async () => {
    throw new Error("async boom");
  });

  assert.match(await runtime.invokeTool("explode", {}), /Error: boom/);
  assert.match(await runtime.invokeTool("reject", {}), /Error: async boom/);
});

test("TeammateManager records failed loops as failed", async () => {
  const manager = new TeammateManager();
  manager.spawn("tester", "qa", "check failure handling");

  manager.registerLoop("tester", Promise.reject(new Error("boom")));
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(manager.listAll(), /tester \(qa\): failed/);
  assert.match(manager.drainNotifications() ?? "", /failed: boom/);
});

test("agent identity is available outside the tool runtime dispatcher", () => {
  const result = agentIdentity.run("reviewer", () => agentIdentity.getStore());

  assert.equal(result, "reviewer");
});

test("requireNonEmptyString returns tool-scoped errors for missing text", () => {
  assert.deepEqual(requireNonEmptyString({}, "prompt", "task tool"), {
    error: "Error: Missing required 'prompt' for task tool.",
  });
  assert.deepEqual(requireNonEmptyString({ prompt: "  " }, "prompt", "task tool"), {
    error: "Error: Missing required 'prompt' for task tool.",
  });
  assert.deepEqual(requireNonEmptyString({ prompt: 42 }, "prompt", "task tool"), {
    value: "42",
  });
});

test("pushTaggedUserMessage appends xml-like user blocks consistently", () => {
  const messages = [];

  pushTaggedUserMessage(messages, "task-status", "one\ntwo");
  pushTaggedUserMessage(messages, "inbox", "{\"text\":\"hi\"}", "inline");

  assert.deepEqual(messages, [
    { role: "user", content: "<task-status>\none\ntwo\n</task-status>" },
    { role: "user", content: "<inbox>{\"text\":\"hi\"}</inbox>" },
  ]);
});
