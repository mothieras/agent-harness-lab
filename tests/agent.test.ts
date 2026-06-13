import test from "node:test";
import assert from "node:assert/strict";
import { Agent } from "../src/agent.js";
import type { AgentConfig } from "../src/agent.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolRuntime } from "../src/tools/runtime.js";
import { TaskManager } from "../src/tools/task/taskManager.js";
import { BackgroundManager } from "../src/tools/background/backgroundManager.js";
import { HookBus } from "../src/hooks/hookBus.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RegisteredTool, ToolDefinition } from "../src/tools/types.js";

function definition(name: string): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    input_schema: { type: "object", properties: {} },
  };
}

function registeredTool(name: string): RegisteredTool {
  return {
    name,
    definition: definition(name),
    handler: () => `${name} handled`,
    source: { type: "builtin" },
  };
}

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "agent-test-"));
}

test("Agent constructs with required fields only", async () => {
  const tmp = await createTempDir();
  try {
    const registry = new ToolRegistry();
    const taskManager = new TaskManager(tmp);
    const bg = new BackgroundManager(tmp);
    const runtime = new ToolRuntime({ registry, taskManager, backgroundManager: bg });

    const agent = new Agent({ toolRuntime: runtime });

    assert.equal(agent.system, `You are a coding agent at ${process.cwd()}. Use tools to solve tasks.`);
    assert.equal(agent.workspaceRoot, process.cwd());
    assert.equal(agent.maxTurns, 200);
    assert.equal(agent.timeoutMs, undefined);
    assert.equal(agent.name, undefined);
    assert.equal(agent.role, undefined);
    assert.equal(agent.hooks, undefined);
    assert.equal(agent.checkPermission, undefined);
    assert.deepEqual(agent.messages, []);
    assert.equal(agent.allowedTools, undefined);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Agent constructs with all optional fields", async () => {
  const tmp = await createTempDir();
  try {
    const registry = new ToolRegistry();
    const taskManager = new TaskManager(tmp);
    const bg = new BackgroundManager(tmp);
    const runtime = new ToolRuntime({ registry, taskManager, backgroundManager: bg });
    const hooks = new HookBus();
    const checkPermission = async () => ({ allowed: true });
    const messages = [{ role: "user" as const, content: "hello" }];

    const agent = new Agent({
      name: "reviewer",
      role: "code review",
      maxTurns: 16,
      timeoutMs: 60000,
      system: "You are a reviewer.",
      workspaceRoot: "/tmp/ws",
      allowedTools: ["bash", "read_file"],
      toolRuntime: runtime,
      hooks,
      checkPermission,
      messages,
    });

    assert.equal(agent.name, "reviewer");
    assert.equal(agent.role, "code review");
    assert.equal(agent.maxTurns, 16);
    assert.equal(agent.timeoutMs, 60000);
    assert.equal(agent.system, "You are a reviewer.");
    assert.equal(agent.workspaceRoot, "/tmp/ws");
    assert.deepEqual(agent.allowedTools, ["bash", "read_file"]);
    assert.equal(agent.toolRuntime, runtime);
    assert.equal(agent.hooks, hooks);
    assert.equal(agent.checkPermission, checkPermission);
    assert.equal(agent.messages, messages);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Agent.getToolDefinitions returns all tools when no allowedTools", async () => {
  const tmp = await createTempDir();
  try {
    const registry = new ToolRegistry();
    registry.register(registeredTool("bash"));
    registry.register(registeredTool("read_file"));
    const taskManager = new TaskManager(tmp);
    const bg = new BackgroundManager(tmp);
    const runtime = new ToolRuntime({ registry, taskManager, backgroundManager: bg });

    const agent = new Agent({ toolRuntime: runtime });

    const defs = agent.getToolDefinitions();
    assert.equal(defs.length, 2);
    assert.equal(defs[0].name, "bash");
    assert.equal(defs[1].name, "read_file");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Agent.getToolDefinitions filters by allowedTools", async () => {
  const tmp = await createTempDir();
  try {
    const registry = new ToolRegistry();
    registry.register(registeredTool("bash"));
    registry.register(registeredTool("read_file"));
    registry.register(registeredTool("write_file"));
    const taskManager = new TaskManager(tmp);
    const bg = new BackgroundManager(tmp);
    const runtime = new ToolRuntime({ registry, taskManager, backgroundManager: bg });

    const agent = new Agent({
      toolRuntime: runtime,
      allowedTools: ["bash", "write_file"],
    });

    const defs = agent.getToolDefinitions();
    assert.equal(defs.length, 2);
    assert.equal(defs[0].name, "bash");
    assert.equal(defs[1].name, "write_file");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Agent.messages is mutable (loop writes to it)", async () => {
  const tmp = await createTempDir();
  try {
    const registry = new ToolRegistry();
    const taskManager = new TaskManager(tmp);
    const bg = new BackgroundManager(tmp);
    const runtime = new ToolRuntime({ registry, taskManager, backgroundManager: bg });

    const agent = new Agent({ toolRuntime: runtime });
    assert.deepEqual(agent.messages, []);

    agent.messages.push({ role: "user", content: "hi" });
    assert.equal(agent.messages.length, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("Agent with exactOptionalPropertyTypes — undefined optional fields don't leak", async () => {
  const tmp = await createTempDir();
  try {
    const registry = new ToolRegistry();
    const taskManager = new TaskManager(tmp);
    const bg = new BackgroundManager(tmp);
    const runtime = new ToolRuntime({ registry, taskManager, backgroundManager: bg });

    // Passing explicit undefined should behave the same as omitting
    const config: AgentConfig = {
      toolRuntime: runtime,
      name: undefined,
      role: undefined,
      maxTurns: undefined,
      timeoutMs: undefined,
      system: undefined,
      workspaceRoot: undefined,
      allowedTools: undefined,
      hooks: undefined,
      checkPermission: undefined,
      messages: undefined,
    };
    const agent = new Agent(config);

    assert.equal(agent.name, undefined);
    assert.equal(agent.role, undefined);
    assert.equal(agent.maxTurns, 200); // default
    assert.equal(agent.timeoutMs, undefined);
    assert.ok(agent.system.includes("coding agent"));
    assert.equal(agent.hooks, undefined);
    assert.equal(agent.checkPermission, undefined);
    assert.deepEqual(agent.messages, []);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
