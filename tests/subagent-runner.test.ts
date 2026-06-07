// tests/subagent-runner.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { client } from "../src/config.js";
import { HookBus } from "../src/hooks/index.js";
import { agentIdentity } from "../src/tools/agentIdentity.js";
import { SubAgentRunner } from "../src/agent/subAgentRunner.js";
import type { ToolRuntime } from "../src/tools/toolRuntime.js";

function textResponse(text: string): Anthropic.Messages.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

// runSubAgent hardcodes allowedTools: SUB_AGENT_ALLOWED_TOOLS, so the stub
// runtime must expose definitions for each of them or normalize will throw.
const SUB_TOOL_NAMES = ["bash", "read_file", "write_file", "edit_file", "load_skill"];
function okRuntime(): ToolRuntime {
  const tools = SUB_TOOL_NAMES.map((name) => ({
    name,
    description: `${name} test tool`,
    input_schema: { type: "object" as const, properties: {} },
  }));
  return { getToolDefinitions: () => tools, invokeTool: async () => "" } as never;
}

async function waitUntilSettled(runner: SubAgentRunner, timeoutMs = 2000) {
  const start = Date.now();
  while (runner.hasRunning() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("run() returns a sub_id message and registers a running subagent", async () => {
  const original = client.messages.create;
  client.messages.create = (async () => textResponse("done")) as typeof client.messages.create;
  try {
    const runner = new SubAgentRunner(okRuntime(), new HookBus(), "/tmp/ws");
    const out = runner.run("do X");
    assert.match(out, /Subagent \w+ started: do X/);
    assert.equal(runner.hasRunning(), true);
    await waitUntilSettled(runner);
    assert.equal(runner.hasRunning(), false);
  } finally {
    client.messages.create = original;
  }
});

test("completed subagent reports full untruncated result, then drains once", async () => {
  const original = client.messages.create;
  const big = "R".repeat(1200);
  client.messages.create = (async () => textResponse(big)) as typeof client.messages.create;
  try {
    const runner = new SubAgentRunner(okRuntime(), new HookBus(), "/tmp/ws");
    const out = runner.run("do Y");
    const subId = out.match(/Subagent (\w+) started/)![1];
    await waitUntilSettled(runner);

    const status = runner.check(subId);
    assert.match(status, /\[completed\]/);
    assert.match(status, new RegExp(big));

    const notifs = runner.drainNotifications();
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].subId, subId);
    assert.equal(notifs[0].status, "completed");
    assert.equal(notifs[0].result.length, big.length); // NOT truncated

    assert.deepEqual(runner.drainNotifications(), []); // drained + deleted
    assert.match(runner.check(subId), /Unknown subagent/);
  } finally {
    client.messages.create = original;
  }
});

test("each subagent runs under its own identity, never 'lead'", async () => {
  const original = client.messages.create;
  client.messages.create = (async () => textResponse("done")) as typeof client.messages.create;
  const hooks = new HookBus();
  let observed: string | undefined;
  hooks.register("UserPromptSubmit", () => {
    observed = agentIdentity.getStore();
  });
  try {
    const runner = new SubAgentRunner(okRuntime(), hooks, "/tmp/ws");
    const out = agentIdentity.run("lead", () => runner.run("do Z"));
    const subId = out.match(/Subagent (\w+) started/)![1];
    await waitUntilSettled(runner);
    assert.ok(observed);
    assert.notEqual(observed, "lead");
    assert.equal(observed, subId);
  } finally {
    client.messages.create = original;
  }
});

test("a rejecting subagent settles as error and never crashes the process", async () => {
  const explodingRuntime = {
    getToolDefinitions: () => {
      throw new Error("boom");
    },
    invokeTool: async () => "",
  } as never;
  const runner = new SubAgentRunner(explodingRuntime, new HookBus(), "/tmp/ws");
  const out = runner.run("do W");
  const subId = out.match(/Subagent (\w+) started/)![1];
  await waitUntilSettled(runner);

  const notifs = runner.drainNotifications();
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].status, "error");
  assert.match(notifs[0].result, /Error: boom/);
});

test("run() refuses to exceed the concurrency cap", async () => {
  const original = client.messages.create;
  client.messages.create = (async () => textResponse("done")) as typeof client.messages.create;
  try {
    const runner = new SubAgentRunner(okRuntime(), new HookBus(), "/tmp/ws", 1);
    const first = runner.run("a");
    const second = runner.run("b");
    assert.match(first, /started/);
    assert.match(second, /Error: too many running subagents/);
    await waitUntilSettled(runner);
  } finally {
    client.messages.create = original;
  }
});

test("check() with no id lists all subagents", async () => {
  const original = client.messages.create;
  client.messages.create = (async () => textResponse("done")) as typeof client.messages.create;
  try {
    const runner = new SubAgentRunner(okRuntime(), new HookBus(), "/tmp/ws");
    assert.equal(runner.check(), "No subagents.");
    runner.run("alpha");
    assert.match(runner.check(), /running/);
    await waitUntilSettled(runner);
  } finally {
    client.messages.create = original;
  }
});
