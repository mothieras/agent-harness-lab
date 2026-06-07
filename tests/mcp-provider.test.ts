import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createAppContext } from "../src/app/context.js";
import { BackgroundManager } from "../src/tools/background/backgroundManager.js";
import { MockMcpClient } from "../src/tools/mcp/mockClient.js";
import { loadMcpTools } from "../src/tools/mcp/provider.js";
import { TaskManager } from "../src/tools/task/taskManager.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolRuntime } from "../src/tools/runtime.js";

test("MCP provider converts listed tools into namespaced RegisteredTool entries", async () => {
  const client = new MockMcpClient({
    tools: [
      {
        name: "search_issues",
        description: "Search GitHub issues.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    ],
  });

  const result = await loadMcpTools({ serverName: "github", client });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].name, "mcp__github__search_issues");
  assert.equal(result.tools[0].definition.name, "mcp__github__search_issues");
  assert.equal(result.tools[0].definition.description, "Search GitHub issues.");
  assert.deepEqual(result.tools[0].definition.input_schema, {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  });
  assert.deepEqual(result.tools[0].source, {
    type: "mcp",
    serverName: "github",
    originalName: "search_issues",
  });
});

test("MCP registered tool invokes the client with the original MCP tool name", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "mcp-provider-"));
  try {
    const client = new MockMcpClient({
      tools: [
        {
          name: "search_issues",
          description: "Search GitHub issues.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      handlers: {
        search_issues: async () => ({
          content: [
            { type: "text", text: "Found 2 issues." },
            { type: "json", json: { ids: [1, 2] } },
          ],
        }),
      },
    });
    const registry = new ToolRegistry();
    const mcp = await loadMcpTools({ serverName: "github", client });
    registry.registerMany(mcp.tools);
    registry.recordDiagnostics(mcp.diagnostics);
    const runtime = new ToolRuntime({
      taskManager: new TaskManager(path.join(workspace, ".tasks")),
      backgroundManager: new BackgroundManager(workspace),
      registry,
    });

    const output = await runtime.invokeTool("mcp__github__search_issues", {
      query: "is:open",
    });

    assert.deepEqual(client.calls, [
      { name: "search_issues", input: { query: "is:open" } },
    ]);
    assert.equal(output, 'Found 2 issues.\n{\n  "ids": [\n    1,\n    2\n  ]\n}');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("MCP provider records unavailable diagnostics when listTools fails", async () => {
  const client = new MockMcpClient({
    listError: new Error("failed to connect"),
  });

  const result = await loadMcpTools({ serverName: "github", client });

  assert.deepEqual(result.tools, []);
  assert.deepEqual(result.diagnostics, [
    {
      providerName: "github",
      sourceType: "mcp",
      namespacePrefix: "mcp__github__",
      status: "unavailable",
      reason: "failed to connect",
    },
  ]);
});

test("app context can register preloaded mock MCP provider results", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "mcp-app-context-"));
  try {
    const client = new MockMcpClient({
      tools: [
        {
          name: "ping",
          description: "Ping the mock server.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      handlers: {
        ping: async () => ({ content: [{ type: "text", text: "pong" }] }),
      },
    });
    const mcp = await loadMcpTools({ serverName: "mock", client });

    const app = createAppContext(workspace, {
      toolProviderResults: [mcp],
    });

    assert.equal(
      await app.toolRuntime.invokeTool("mcp__mock__ping", {}),
      "pong",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
