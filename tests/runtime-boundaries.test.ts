import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { HookBus } from "../src/hooks/hookBus.js";
import type Anthropic from "@anthropic-ai/sdk";
import { client } from "../src/config.js";
import { createAppContext } from "../src/app/context.js";
import { pushTaggedUserMessage } from "../src/hooks/messageInjection.js";
import { registerRuntimeHooks } from "../src/hooks/runtimeHooks.js";
import { runSubAgent } from "../src/tools/subagent/subagent.js";
import { SubAgentRunner } from "../src/tools/subagent/subAgentRunner.js";
import { hasPendingAsyncWork, safeQuestion } from "../src/cli/index.js";
import { PROMPT_SECTIONS } from "../src/prompt/sections.js";
import { BackgroundManager } from "../src/tools/background/backgroundManager.js";
import { agentIdentity } from "../src/tools/identity.js";
import { requireNonEmptyString } from "../src/tools/input.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolRuntime } from "../src/tools/runtime.js";
import { TaskManager } from "../src/tools/task/taskManager.js";
import { loadBuiltinTools } from "../src/tools/builtins.js";
import { validateToolProfiles } from "../src/tools/profiles.js";
import type { RegisteredTool } from "../src/tools/types.js";

function toolDefinition(name: string) {
  return {
    name,
    description: `${name} test tool`,
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  };
}

function textResponse(
  text: string,
  stopReason: Anthropic.Messages.Message["stop_reason"] = "end_turn",
): Anthropic.Messages.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function createRuntime(workspaceRoot: string): ToolRuntime {
  const registry = new ToolRegistry();
  const taskManager = new TaskManager(path.join(workspaceRoot, ".tasks"));
  const backgroundManager = new BackgroundManager(workspaceRoot);
  const runtime = new ToolRuntime({ taskManager, backgroundManager, registry });
  const subAgentRunner = new SubAgentRunner(runtime, new HookBus(), workspaceRoot);
  const builtin = loadBuiltinTools({
    workspaceRoot,
    skillLoader: { getContent: () => "", getDescriptions: () => "" },
    memoryManager: {
      write: () => "memory.md",
      buildIndex: () => "",
    },
    taskManager,
    backgroundManager,
    subAgentRunner,
  });
  registry.registerMany(builtin.tools);
  registry.recordDiagnostics(builtin.diagnostics);

  return runtime;
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
    const registry = new ToolRegistry();
    const runtime = new ToolRuntime({ taskManager, backgroundManager, registry });
    const subAgentRunner = new SubAgentRunner(runtime, new HookBus(), workspace);
    const builtin = loadBuiltinTools({
      workspaceRoot: workspace,
      skillLoader: { getContent: () => "", getDescriptions: () => "" },
      memoryManager: {
        write: () => "memory.md",
        buildIndex: () => "",
      },
      taskManager,
      backgroundManager,
      subAgentRunner,
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
        "background_run",
        "check_background",
        "subagent",
        "check_subagent",
        "load_skill",
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

test("default orchestration exposes subagent and check_subagent but not teammate", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  try {
    const app = createAppContext(workspace);

    const toolNames = app.toolRegistry.getDefinitions().map((tool) => tool.name);

    assert.ok(toolNames.includes("subagent"));
    assert.ok(toolNames.includes("check_subagent"));
    assert.ok(!toolNames.includes("teammate"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("subagent schema accepts optional role, name, and task_id", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  try {
    const app = createAppContext(workspace);
    const subagent = app.toolRegistry
      .getDefinitions()
      .find((tool) => tool.name === "subagent");

    assert.ok(subagent);
    assert.deepEqual(
      Object.keys(subagent.input_schema.properties ?? {}).sort(),
      ["max_turns", "name", "prompt", "role", "task_id", "timeout_ms"],
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("subagent tool returns a sub_id immediately and check_subagent reports it", async () => {
  const original = client.messages.create;
  client.messages.create = (async () =>
    textResponse("subagent done")) as typeof client.messages.create;
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  try {
    const app = createAppContext(workspace);

    const out = await agentIdentity.run("lead", () =>
      app.toolRuntime.invokeTool("subagent", { prompt: "research X" }),
    );
    assert.match(out, /Subagent \w+ started/);
    assert.equal(app.subAgentRunner.hasRunning(), true);

    const list = await app.toolRuntime.invokeTool("check_subagent", {});
    assert.match(list, /running/);

    while (app.subAgentRunner.hasRunning()) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    client.messages.create = original;
    await rm(workspace, { recursive: true, force: true });
  }
});

test("runSubAgent includes optional role and name in system prompt", async () => {
  const originalCreate = client.messages.create;
  let observedSystem: Anthropic.Messages.MessageCreateParams["system"];
  const tools = ["bash", "read_file", "write_file", "edit_file", "load_skill"].map(
    toolDefinition,
  );
  const runtime = {
    getToolDefinitions: () => tools,
    invokeTool: async () => "",
  };

  client.messages.create = (async (params: Anthropic.Messages.MessageCreateParams) => {
    observedSystem = params.system;
    return textResponse("review complete");
  }) as typeof client.messages.create;

  try {
    const result = await runSubAgent("review docs", runtime as never, {
      workspaceRoot: "/tmp/workspace",
      name: "reviewer",
      role: "code reviewer",
    });

    assert.match(result, /review complete/);
    assert.match(String(observedSystem), /reviewer/);
    assert.match(String(observedSystem), /code reviewer/);
    assert.match(String(observedSystem), /\/tmp\/workspace/);
  } finally {
    client.messages.create = originalCreate;
  }
});

test("safeQuestion returns null when readline has already closed", async () => {
  const question = async () => {
    const error = new Error("readline was closed") as Error & { code: string };
    error.code = "ERR_USE_AFTER_CLOSE";
    throw error;
  };

  assert.equal(await safeQuestion(question, "agent >> "), null);
});

test("default prompt guides parallel subagent delegation", () => {
  const guidelines = PROMPT_SECTIONS.guidelines({
    workspace: "/tmp/workspace",
    memories: "",
    skills: "",
  });

  assert.match(guidelines ?? "", /subagent/);
  assert.match(guidelines ?? "", /check_subagent/);
  assert.match(guidelines ?? "", /in_progress/);
  assert.doesNotMatch(guidelines ?? "", /Use teammate/);
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

test("subagent results inject in lead context only, not in subagent context", async () => {
  const original = client.messages.create;
  client.messages.create = (async () =>
    textResponse("sub result payload")) as typeof client.messages.create;
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  try {
    const app = createAppContext(workspace);
    registerRuntimeHooks(app);

    agentIdentity.run("lead", () => app.subAgentRunner.run("do thing"));
    while (app.subAgentRunner.hasRunning()) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Non-lead context must NOT drain the lead's subagent results.
    const subMessages: Anthropic.Messages.MessageParam[] = [];
    agentIdentity.run("worker-1", () =>
      app.hooks.emitEffect("UserPromptSubmit", subMessages),
    );
    assert.doesNotMatch(JSON.stringify(subMessages), /subagent-results/);

    // Lead context drains and injects the (still-present) result.
    const leadMessages: Anthropic.Messages.MessageParam[] = [];
    agentIdentity.run("lead", () =>
      app.hooks.emitEffect("UserPromptSubmit", leadMessages),
    );
    const leadText = JSON.stringify(leadMessages);
    assert.match(leadText, /subagent-results/);
    assert.match(leadText, /sub result payload/);
  } finally {
    client.messages.create = original;
    await rm(workspace, { recursive: true, force: true });
  }
});

test("hasPendingAsyncWork reflects running subagents", async () => {
  const original = client.messages.create;
  client.messages.create = (async () =>
    textResponse("done")) as typeof client.messages.create;
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-runtime-"));
  try {
    const app = createAppContext(workspace);

    assert.equal(hasPendingAsyncWork(app), false);
    agentIdentity.run("lead", () => app.subAgentRunner.run("work"));
    assert.equal(hasPendingAsyncWork(app), true);

    while (app.subAgentRunner.hasRunning()) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(hasPendingAsyncWork(app), false);
  } finally {
    client.messages.create = original;
    await rm(workspace, { recursive: true, force: true });
  }
});
