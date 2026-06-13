# Runtime Flow

This project is a thin coding-agent runtime. The core design goal is to keep the model loop, tool loading, tool dispatch, hooks, and stateful services visible and separately understandable.

## Startup Path

Normal startup flows through:

```text
src/main.ts
-> src/cli/index.ts
-> src/app/context.ts
-> src/loop/loop.ts
```

`createAppContext()` is the composition root. It builds long-lived services, loads tools from providers, registers them, validates tool profiles, and constructs the `ToolRuntime`.

The agent loop does not load providers. It receives an `Agent` — which carries the tool definitions, system prompt, budgets, and conversation — and calls `ToolRuntime.invokeTool()` when the model requests a tool.

## App Composition

`src/app/context.ts` owns startup assembly, in dependency order:

- Build `SkillLoader`, `MemoryManager`, `TaskManager`, `BackgroundManager`.
- Create a `ToolRegistry`, then a `ToolRuntime` over it. The `SubAgentRunner` is a standalone async scheduler (concurrency cap only) — it holds no services and forks the parent `Agent` handed to `run()`, so it does not wrap the runtime.
- Load builtin tools through `loadBuiltinTools()`, passing each tool only the services it needs (including the `SubAgentRunner` and an optional `checkPermission`).
- Register the returned `RegisteredTool[]` in the registry.
- Register any preloaded provider results passed into `createAppContext()`, and record provider diagnostics.
- Validate centralized tool profiles.

The registry is populated last, so the runtime and subagent runner already exist when tools are built — no lazy getters and no post-assembly registration. `subagent` and `check_subagent` are ordinary builtin tools (`src/tools/subagent/`), not special branches inside the loop.

## Agent Loop

`agentLoop(agent)` takes a single `Agent` (identity + config + shared service references + conversation `messages`) and binds it into `currentAgent` (an `AsyncLocalStorage<Agent>`) for the whole run — this is the sole place per-agent identity is established, and what lets a tool fork the agent that invoked it (e.g. `subagent`). Sub-agents are derived with `parent.fork(overrides)` (see [0008](../decisions/0008-agent-object-model.md)).

`src/loop/loop.ts` then owns protocol orchestration:

1. Emit lifecycle hooks.
2. Send messages, system prompt, and tool definitions to the model.
3. Run recovery decisions for model/API errors through `src/loop/recovery.ts`.
4. If the model returns `tool_use`, invoke tools through `ToolRuntime`.
5. Push `tool_result` blocks back as user messages.
6. If the model stops, run the `Stop` control hook and return unless continuation is requested.

The loop should not know whether a tool is builtin or MCP. It only sees names, tool definitions, and runtime invocation.

## Error Boundaries

Errors are intentionally split by layer:

- `recovery.ts` decides how to respond to model/API call failures.
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
- Subagent tools are ordinary registered builtin tools, not hard-coded loop branches.
- `agentLoop` is the sole binder of `currentAgent`; per-agent identity (`agent.id`, default `"lead"`) is established nowhere else.
- Tools must reach their calling agent through `currentAgent.getStore()`, never by importing `Agent` (that would cycle `Agent → ToolRuntime → Agent`).
