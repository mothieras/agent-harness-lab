import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { HookBus } from "../src/hooks/index.js";
import { pushTaggedUserMessage } from "../src/app/messageInjection.js";
import { TeammateManager } from "../src/team/teammateManager.js";
import { BackgroundManager } from "../src/tools/backgroundManager.js";
import { agentIdentity } from "../src/tools/agentIdentity.js";
import { requireNonEmptyString } from "../src/tools/input.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolRuntime } from "../src/tools/toolRuntime.js";
import { TaskManager } from "../src/tools/taskManager.js";
import { loadBuiltinTools } from "../src/tools/builtin/provider.js";
import { validateToolProfiles } from "../src/tools/toolProfiles.js";
import type { RegisteredTool } from "../src/tools/toolTypes.js";

function createRuntime(workspaceRoot: string): ToolRuntime {
  const registry = new ToolRegistry();
  const taskManager = new TaskManager(path.join(workspaceRoot, ".tasks"));
  const backgroundManager = new BackgroundManager(workspaceRoot);
  const teammateManager = new TeammateManager();
  const builtin = loadBuiltinTools({
    workspaceRoot,
    skillLoader: { getContent: () => "", getDescriptions: () => "" },
    memoryManager: {
      write: () => "memory.md",
      buildIndex: () => "",
    },
    taskManager,
    backgroundManager,
    getTeammateManager: () => teammateManager,
  });
  registry.registerMany(builtin.tools);
  registry.recordDiagnostics(builtin.diagnostics);

  return new ToolRuntime({
    taskManager,
    backgroundManager,
    registry,
  });
}

function testTool(name: string, handler: RegisteredTool["handler"]): RegisteredTool {
  return {
    name,
    definition: {
      name,
      description: `${name} test tool`,
      input_schema: {
        type: "object",
        properties: {},
      },
    },
    handler,
    source: { type: "builtin" },
  };
}

test("loadBuiltinTools returns complete RegisteredTool entries", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  try {
    const taskManager = new TaskManager(path.join(workspace, ".tasks"));
    const backgroundManager = new BackgroundManager(workspace);
    const teammateManager = new TeammateManager();
    const builtin = loadBuiltinTools({
      workspaceRoot: workspace,
      skillLoader: { getContent: () => "", getDescriptions: () => "" },
      memoryManager: {
        write: () => "memory.md",
        buildIndex: () => "",
      },
      taskManager,
      backgroundManager,
      getTeammateManager: () => teammateManager,
    });

    assert.deepEqual(builtin.diagnostics, []);
    assert.deepEqual(
      builtin.tools.map((tool) => tool.name),
      [
        "bash",
        "read_file",
        "write_file",
        "edit_file",
        "task_create",
        "task_get",
        "task_update",
        "task_list",
        "load_skill",
        "background_run",
        "check_background",
        "list_teammates",
        "send_message",
        "read_inbox",
        "broadcast",
        "update_memory",
      ],
    );
    assert.equal(new Set(builtin.tools.map((tool) => tool.name)).size, builtin.tools.length);
    for (const tool of builtin.tools) {
      assert.equal(tool.name, tool.definition.name);
      assert.deepEqual(tool.source, { type: "builtin" });
      assert.equal(typeof tool.handler, "function");
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("tool profile validation reports unknown allowed tools", () => {
  const registry = new ToolRegistry();
  registry.register(testTool("read_file", () => "ok"));

  assert.throws(
    () =>
      validateToolProfiles(registry, {
        reviewer: ["read_file", "missing_tool"],
      }),
    /Tool profile 'reviewer' references unknown tool\(s\): missing_tool/,
  );
});

test("HookBus instances do not share registered callbacks", () => {
  const first = new HookBus();
  const second = new HookBus();

  first.register("Stop", () => "first");

  assert.equal(first.triggerControl("Stop", []), "first");
  assert.equal(second.triggerControl("Stop", []), null);
});

test("effect hooks run every callback even when one returns text", () => {
  const hooks = new HookBus();
  const calls: string[] = [];

  hooks.register("UserPromptSubmit", () => {
    calls.push("first");
    return "ignored";
  });
  hooks.register("UserPromptSubmit", () => {
    calls.push("second");
  });

  hooks.emitEffect("UserPromptSubmit", []);

  assert.deepEqual(calls, ["first", "second"]);
});

test("PreToolUse returns the first block reason", () => {
  const hooks = new HookBus();
  const calls: string[] = [];

  hooks.register("PreToolUse", () => {
    calls.push("first");
    return "blocked";
  });
  hooks.register("PreToolUse", () => {
    calls.push("second");
    return "also blocked";
  });

  assert.equal(
    hooks.triggerControl("PreToolUse", {
      type: "tool_use",
      id: "toolu_test",
      name: "bash",
      input: {},
    }),
    "blocked",
  );
  assert.deepEqual(calls, ["first"]);
});

test("Stop returns the first continue reason", () => {
  const hooks = new HookBus();
  const calls: string[] = [];

  hooks.register("Stop", () => {
    calls.push("first");
    return "continue";
  });
  hooks.register("Stop", () => {
    calls.push("second");
    return "continue again";
  });

  assert.equal(hooks.triggerControl("Stop", []), "continue");
  assert.deepEqual(calls, ["first"]);
});

test("ToolResultsReady appends results through mutation", () => {
  const hooks = new HookBus();
  const results = [
    { type: "tool_result" as const, tool_use_id: "toolu_test", content: "ok" },
  ];

  hooks.register("ToolResultsReady", (readyResults) => {
    readyResults.push({ type: "text", text: "extra" });
    return "ignored";
  });

  hooks.emitEffect("ToolResultsReady", results);

  assert.deepEqual(results, [
    { type: "tool_result", tool_use_id: "toolu_test", content: "ok" },
    { type: "text", text: "extra" },
  ]);
});

test("ToolRuntime resolves file tools against its workspace root", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(tmpdir());
    const runtime = createRuntime(workspace);

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
  const registry = new ToolRegistry();
  const runtime = new ToolRuntime({
    taskManager: new TaskManager(path.join(process.cwd(), ".tasks")),
    backgroundManager: new BackgroundManager(process.cwd()),
    registry,
  });

  runtime.registerTool(testTool("explode", () => {
    throw new Error("boom");
  }));
  runtime.registerTool(testTool("reject", async () => {
    throw new Error("async boom");
  }));

  assert.match(await runtime.invokeTool("explode", {}), /Error: boom/);
  assert.match(await runtime.invokeTool("reject", {}), /Error: async boom/);
});

test("ToolRuntime returns unsupported for unknown tools", async () => {
  const runtime = createRuntime(process.cwd());

  assert.equal(
    await runtime.invokeTool("missing_tool", {}),
    "Error: Unsupported tool 'missing_tool'.",
  );
});

test("ToolRuntime returns unavailable for failed provider namespaces", async () => {
  const registry = new ToolRegistry();
  registry.recordDiagnostic({
    providerName: "github",
    sourceType: "mcp",
    namespacePrefix: "mcp__github__",
    status: "unavailable",
    reason: "connection failed",
  });
  const runtime = new ToolRuntime({
    taskManager: new TaskManager(path.join(process.cwd(), ".tasks")),
    backgroundManager: new BackgroundManager(process.cwd()),
    registry,
  });

  assert.equal(
    await runtime.invokeTool("mcp__github__search", {}),
    "Error: Tool 'mcp__github__search' is unavailable from provider 'github': connection failed.",
  );
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
