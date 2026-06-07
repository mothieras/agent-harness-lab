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

A tool factory owns one tool's definition and handler, and declares exactly the dependencies that tool needs.

Builtin tools live under `src/tools/<group>/`, one file per tool:

```text
src/tools/file/read.ts
src/tools/task/create.ts
src/tools/subagent/subagentTool.ts
```

Each file exports a `createXTool(deps): RegisteredTool` function. `deps` is a small inline object containing only the services that tool uses — there is no shared "deps bag". The `builtinTool(definition, handler)` helper in `src/tools/types.ts` stamps the `source: { type: "builtin" }` metadata so a factory only spells out its definition and handler.

### Group Indexes

Group indexes aggregate related tools:

```text
src/tools/file/index.ts
src/tools/task/index.ts
src/tools/subagent/index.ts
```

They answer: which builtin tools are in this group, in what order, and which services the group requires. They contain no tool business logic.

### Builtin Composition

`src/tools/builtins.ts` is the single composition root for builtin tools. `loadBuiltinTools(services)` takes a `BuiltinServices` object (all long-lived services), hands each group only the services it needs, and returns a `ToolProviderLoadResult`:

```ts
type ToolProviderLoadResult = {
  tools: RegisteredTool[];
  diagnostics: ProviderDiagnostic[];
};
```

It uses static imports and does not scan the filesystem. Tool order is explicit here: **file → task → background → subagent → skill → memory**. (`builtins.ts` replaces the older `builtin/index.ts` + `builtin/provider.ts` two-file split.)

### Co-located State

Stateful services that back a tool group live next to that group:

```text
src/tools/task/taskManager.ts
src/tools/background/backgroundManager.ts
```

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

`ToolRegistry` (`src/tools/registry.ts`) stores successfully registered tools and provider diagnostics.

It is responsible for:

- Ensuring `RegisteredTool.name === RegisteredTool.definition.name`.
- Rejecting duplicate tool names.
- Returning tool definitions for model calls.
- Returning handlers for runtime dispatch.
- Explaining unavailable provider namespaces.

It is not responsible for discovering providers.

### Tool Runtime

`ToolRuntime` (`src/tools/runtime.ts`) invokes tools through the registry:

```text
ToolRuntime.invokeTool(name, input)
-> ToolRegistry.getHandler(name)
-> handler(input)
```

If no handler exists, runtime checks diagnostics before returning unsupported tool errors.

## Adding A Builtin Tool

1. Create a focused factory file:

```text
src/tools/<group>/<name>.ts
```

2. Export a factory taking only the deps it needs:

```ts
export function createXTool(deps: { taskManager: TaskManager }): RegisteredTool {
  return builtinTool(definition, handler);
}
```

3. Add it to the group `index.ts`.

4. If the tool needs a service not yet threaded through, add it to `BuiltinServices` and pass it from `loadBuiltinTools()` in `src/tools/builtins.ts`.

5. If a restricted agent role (the `subagent` profile) should see it, update `src/tools/profiles.ts`.

Lead agent visibility normally comes from all registered tools, so most new builtin tools do not need profile changes.

## MCP-0 Boundary

Mock MCP tools follow the same final shape:

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
- Do not reintroduce a shared deps bag; each tool declares only the deps it uses.
- Do not put secrets in `source`; credentials belong in client/config/transport layers.
- Keep tool order explicit and stable through `builtins.ts`.
- Real MCP clients must call original MCP tool names, not global registry names.
