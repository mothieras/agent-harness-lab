# Changelog

## 2026-06-13 — Introduce Agent class (minimal)

### Added
- **`src/agent.ts`** — `Agent` class + `AgentConfig` interface. Bundles identity, config, services, and conversation history into one object. Created `new Agent({ toolRuntime, system, ... })` — sub-agents are just different parameter combinations.
- **`tests/agent.test.ts`** — 6 tests covering construction defaults, all optional fields, `getToolDefinitions` (with/without allowedTools), messages mutability, and `exactOptionalPropertyTypes` compatibility.

### Changed
- **`src/loop/loop.ts`** — `agentLoop(messages, toolRuntime, options?)` → `agentLoop(agent: Agent)`. All config now read from the Agent instance.
- **`src/cli/index.ts`** — Creates a `leadAgent = new Agent(...)` at startup, passes it to `agentLoop`.
- **`src/tools/subagent/subagent.ts`** — `runSubAgent` internally creates an `Agent` instance instead of inline `AgentLoopOptions`.
- **`src/loop/options.ts`** — Removed `AgentLoopOptions`, `NormalizedAgentLoopOptions`, and `normalizeAgentLoopOptions` (dead code).
- **`src/loop/index.ts`** — Removed `AgentLoopOptions` from exports.
- **`tests/error-recovery.test.ts`** — Adapted to `new Agent({...})` pattern.

### Remaining
- `SubAgentRunner` still manages subagents with Map + notifications; not yet using Agent instances for lifecycle.
- `AppContext` still holds `SkillLoader`, `MemoryManager`, `TaskManager`, `BackgroundManager` — these should migrate onto Agent over time.
- Agent does not own its own `HookBus` or `MemoryManager` yet; these are still shared via `AppContext`.
- No session/fork semantics — Agent instances share the same `ToolRuntime`.
