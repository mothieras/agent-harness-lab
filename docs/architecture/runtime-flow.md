# Runtime Flow

This project is a thin coding-agent runtime. The core design goal is to keep the model loop, tool loading, tool dispatch, hooks, and stateful services visible and separately understandable.

## Startup Path

Normal startup flows through:

```text
src/main.ts
-> src/cli/index.ts
-> src/app/context.ts
-> src/agent/loop.ts
```

`createAppContext()` is the composition root. It builds long-lived services, loads tools from providers, registers them, validates tool profiles, and constructs the `ToolRuntime`.

The agent loop does not load providers. It receives tool definitions and calls `ToolRuntime.invokeTool()` when the model requests a tool.

## App Composition

`src/app/context.ts` owns startup assembly:

- Build `SkillLoader`, `MemoryManager`, `TaskManager`, `BackgroundManager`, and `TeammateManager`.
- Create a `ToolRegistry`.
- Load builtin tools through `loadBuiltinTools()`.
- Register returned `RegisteredTool[]` in the registry.
- Register any preloaded provider results passed into `createAppContext()`.
- Record provider diagnostics.
- Validate centralized tool profiles.
- Create `ToolRuntime` with the registry and state managers.

After context creation, orchestration tools are registered in `src/app/orchestrationTools.ts`. These tools are normal `RegisteredTool` entries, not special branches inside the loop.

## Agent Loop

`src/agent/loop.ts` owns protocol orchestration:

1. Emit lifecycle hooks.
2. Send messages, system prompt, and tool definitions to the model.
3. Run recovery decisions for model/API errors through `errorRecovery.ts`.
4. If the model returns `tool_use`, invoke tools through `ToolRuntime`.
5. Push `tool_result` blocks back as user messages.
6. If the model stops, run the `Stop` control hook and return unless continuation is requested.

The loop should not know whether a tool is builtin, orchestration, or MCP. It only sees names, tool definitions, and runtime invocation.

## Error Boundaries

Errors are intentionally split by layer:

- `errorRecovery.ts` decides how to respond to model/API call failures.
- `agentLoop` executes recovery actions because it owns loop state and message flow.
- `ToolRuntime` converts unknown, unavailable, and thrown tool errors into tool-result strings.
- `ToolRegistry` stores provider diagnostics that explain unavailable tool namespaces.
- Hooks are allowed to throw; the loop does not silently swallow hook failures.

Do not move all error handling into one global utility. Different errors belong to different lifecycle stages.

## Invariants

- `agentLoop` must not import providers or MCP modules.
- `ToolRuntime` must dispatch through `ToolRegistry`, not its own handler map.
- `ToolRegistry` is the runtime source of truth for registered definitions, handlers, and diagnostics.
- Provider results are registered at app assembly time, not during per-tool invocation.
- Orchestration tools are registered tools, not hard-coded loop branches.
