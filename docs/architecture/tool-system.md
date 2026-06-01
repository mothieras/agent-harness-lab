# Tool System

The tool system is built around one fact unit:

```ts
type RegisteredTool = {
  name: string;
  definition: ToolDefinition;
  handler: ToolHandler;
  source: ToolSource;
};
```

The important rule is that a tool's model-facing definition and executable handler travel together.

## Responsibilities

### Tool Factory

A tool factory owns one tool's definition and handler.

Builtin examples live under `src/tools/builtin/**`:

```text
src/tools/builtin/file/readFileTool.ts
src/tools/builtin/task/createTaskTool.ts
src/tools/builtin/team/sendMessageTool.ts
```

Each file exports a `createXTool(deps): RegisteredTool` function.

### Builtin Group Indexes

Group indexes aggregate related tools:

```text
src/tools/builtin/file/index.ts
src/tools/builtin/task/index.ts
src/tools/builtin/team/index.ts
```

They answer: which builtin tools are part of this group, and in what order?

They should not contain tool business logic.

### Builtin Provider

`src/tools/builtin/provider.ts` loads builtin tools and returns a `ToolProviderLoadResult`:

```ts
type ToolProviderLoadResult = {
  tools: RegisteredTool[];
  diagnostics: ProviderDiagnostic[];
};
```

The builtin provider uses static imports. It should not scan the filesystem.

### MCP Provider

`src/tools/mcp/provider.ts` implements the MCP-0 provider boundary without real transport.

It depends on a minimal `McpClient` interface:

```ts
interface McpClient {
  listTools(): Promise<McpToolSchema[]>;
  callTool(name: string, input: unknown): Promise<McpToolResult>;
}
```

The provider calls `listTools()`, converts each MCP schema into a namespaced `RegisteredTool`, and closes over the client in the handler.

If `listTools()` fails, the provider returns no tools and records an unavailable diagnostic for the server namespace.

`MockMcpClient` implements the same interface for tests and local architecture validation. Real stdio/http transport should implement `McpClient` later rather than changing registry/runtime.

### Tool Registry

`ToolRegistry` stores successfully registered tools and provider diagnostics.

It is responsible for:

- Ensuring `RegisteredTool.name === RegisteredTool.definition.name`.
- Rejecting duplicate tool names.
- Returning tool definitions for model calls.
- Returning handlers for runtime dispatch.
- Explaining unavailable provider namespaces.

It is not responsible for discovering providers.

### Tool Runtime

`ToolRuntime` invokes tools through the registry:

```text
ToolRuntime.invokeTool(name, input)
-> ToolRegistry.getHandler(name)
-> handler(input)
```

If no handler exists, runtime checks diagnostics before returning unsupported tool errors.

## Adding A Builtin Tool

1. Create a focused factory file:

```text
src/tools/builtin/<group>/<name>Tool.ts
```

2. Export a factory:

```ts
export function createXTool(deps: BuiltinToolDeps): RegisteredTool {
  return builtinTool(definition, handler);
}
```

3. Add it to the group `index.ts`.

4. If a restricted agent role should see it, update `src/tools/toolProfiles.ts`.

Lead agent visibility normally comes from all registered tools, so most new builtin tools do not need profile changes.

## MCP-0 Boundary

Mock MCP tools now follow the same final shape:

```ts
{
  name: "mcp__github__search_issues",
  definition: convertedSchema,
  source: {
    type: "mcp",
    serverName: "github",
    originalName: "search_issues",
  },
  handler: createMcpHandler(client, source),
}
```

The provider source is different, but the registry and runtime path stays the same.

The current implementation is not a real MCP transport. It intentionally stops at:

- MCP-like schema discovery through `McpClient.listTools()`.
- `mcp__server__tool` global naming.
- `source` metadata with server and original tool name.
- Handler invocation through `McpClient.callTool(originalName, input)`.
- Text/json/resource/image result normalization into strings.
- Provider diagnostics for list failures.

Real MCP transport should plug in behind `McpClient`.

## Invariants

- Do not recreate a global `toolDefinitions.ts` list.
- Do not recreate a central `toolHandlers.ts` file.
- Do not let `ToolRuntime` keep its own handler map.
- Do not put secrets in `source`; credentials belong in client/config/transport layers.
- Keep tool order explicit and stable through static aggregation.
- Real MCP clients must call original MCP tool names, not global registry names.
