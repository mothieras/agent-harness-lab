// tests/subagent-runner.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { client } from "../src/config.js";
import { Agent, currentAgent } from "../src/agent.js";
import { SubAgentRunner } from "../src/tools/subagent/subAgentRunner.js";
import type { ToolRuntime } from "../src/tools/runtime.js";
import { createAppContext } from "../src/app/context.js";

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

function toolUseResponse(
  name: string,
  input: Record<string, unknown>,
): Anthropic.Messages.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "tool_use", id: "tu_1", name, input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

// Subagents fork the parent and inherit its toolRuntime; the stub runtime must
// expose definitions for each SUB_AGENT_ALLOWED_TOOLS or selection will throw.
const SUB_TOOL_NAMES = ["bash", "read_file", "write_file", "edit_file", "load_skill"];
function okRuntime(): ToolRuntime {
  const tools = SUB_TOOL_NAMES.map((name) => ({
    name,
    description: `${name} test tool`,
    input_schema: { type: "object" as const, properties: {} },
  }));
  return { getToolDefinitions: () => tools, invokeTool: async () => "" } as never;
}

function parentAgent(runtime: ToolRuntime): Agent {
  return new Agent({ toolRuntime: runtime, workspaceRoot: "/tmp/ws" });
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
    const runner = new SubAgentRunner();
    const out = runner.run(parentAgent(okRuntime()), "do X");
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
    const runner = new SubAgentRunner();
    const out = runner.run(parentAgent(okRuntime()), "do Y");
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

test("each subagent runs under its own identity, never 'lead' (observed via tool dispatch)", async () => {
  const original = client.messages.create;
  // A silent sub-agent has no hooks, so the tool runtime is the observation
  // point: turn 1 calls a tool (dispatched under the sub's identity), turn 2 ends.
  let calls = 0;
  client.messages.create = (async () => {
    calls += 1;
    return calls === 1 ? toolUseResponse("bash", {}) : textResponse("done");
  }) as typeof client.messages.create;

  let observed: string | undefined;
  const runtime = {
    getToolDefinitions: () =>
      SUB_TOOL_NAMES.map((name) => ({
        name,
        description: `${name} test tool`,
        input_schema: { type: "object" as const, properties: {} },
      })),
    invokeTool: async () => {
      observed = currentAgent.getStore()?.id;
      return "";
    },
  } as never;

  try {
    const runner = new SubAgentRunner();
    const out = runner.run(parentAgent(runtime), "do Z");
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
  const runner = new SubAgentRunner();
  const out = runner.run(parentAgent(explodingRuntime), "do W");
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
    const runner = new SubAgentRunner(1);
    const parent = parentAgent(okRuntime());
    const first = runner.run(parent, "a");
    const second = runner.run(parent, "b");
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
    const runner = new SubAgentRunner();
    assert.equal(runner.check(), "No subagents.");
    runner.run(parentAgent(okRuntime()), "alpha");
    assert.match(runner.check(), /running/);
    await waitUntilSettled(runner);
  } finally {
    client.messages.create = original;
  }
});

test("createAppContext exposes an idle SubAgentRunner", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "subrunner-"));
  try {
    const app = createAppContext(workspace);
    assert.ok(app.subAgentRunner instanceof SubAgentRunner);
    assert.equal(app.subAgentRunner.hasRunning(), false);
    assert.equal(app.subAgentRunner.check(), "No subagents.");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
