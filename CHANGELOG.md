# Changelog

## 2026-06-13 — Unify agent identity onto Agent.id (merge two ALS)

### Changed
- **Single identity ALS.** Deleted `src/tools/identity.ts` (`agentIdentity: ALS<string>`); `Agent` gained an optional `id` (isolated by `fork`). `runtimeHooks` keys per-agent state off `currentAgent.getStore()?.id ?? "lead"`. `agentLoop` is now the *sole* place identity is established — cli (`leadAgent` = `{ id: "lead" }`) and `SubAgentRunner` no longer wrap calls in a separate `.run()`.
- **`forkSubAgent(parent, id, prompt, options?)`** — `id` is now **required** (was optional): a forked sub-agent can no longer silently alias `"lead"` and collide on hook/reminder state.

### Added (coverage from an adversarial review)
- `registry.getDefinitions` fail-fast on an unknown allowed tool (the real `selectAllowedToolDefinitions` path — previously only hand-rolled in a mock).
- `subagent` tool errors when invoked outside an agent loop.

### Removed
- `src/tools/identity.ts` and the `agentIdentity` re-export from `runtime.ts`.

## 2026-06-13 — Sub-agents fork from a parent Agent

### Added
- **`Agent.fork(overrides)`** (`src/agent.ts`) — derive a child agent with an explicit three-way split: **shares** `toolRuntime` (same reference), **inherits** `workspaceRoot`/`checkPermission` unless overridden, **isolates** `name`/`role`/`system`/`maxTurns`/`timeoutMs`/`allowedTools`/`messages`/`hooks` (a child starts a fresh, **silent** conversation — no HookBus unless explicitly given — with its own budget and tool scope). New `AgentForkOptions` type.
- **`currentAgent`** (`src/agent.ts`) — `AsyncLocalStorage<Agent>` bound by `agentLoop()` for the whole run, so tools (e.g. `subagent`) can fork the agent that invoked them without threading a parent reference. Mirrors the id-only `agentIdentity` ALS.
- **`forkSubAgent(parent, prompt, options)`** (`subagent/subagent.ts`) — replaces `runSubAgent`; forks `parent` into a constrained sub-agent (subagent tool profile, shorter budgets, prompt-seeded conversation). Optional `allowedTools` **narrows** the profile (requested ∩ profile) — a child can never widen its tool access, so it stays ⊆ the parent and can't reach `subagent`.
- **`tests/agent.test.ts`** — 2 fork tests (three-way split; overrides win / omitted fields fall back to defaults, not the parent).

### Changed
- **`agentLoop(agent)`** now runs inside `currentAgent.run(agent, …)`.
- **`SubAgentRunner`** — constructor drops `toolRuntime`/`hooks`/`workspaceRoot` (only an optional concurrency cap remains); `run(parent, prompt, options)` forks from the parent and stores the live child `Agent` in its task map, so `check` can report the child's conversation length.
- **`subagent` tool** reads the parent from `currentAgent` (errors if invoked outside an agent loop); new optional `allowed_tools` param lets the lead narrow a child's tool scope. New `optionalArrayOfStrings` input helper.
- **`tests/runtime-boundaries.test.ts`, `tests/subagent-runner.test.ts`** — adapted to the parent-fork API.

### Fixed
- **`src/cli/index.ts`** — `history` and `leadAgent.messages` had diverged after the Agent refactor (the loop mutates `agent.messages`, but `/compact` and memory extraction read a separate `history` that only ever received user turns). `history` is now an alias of `leadAgent.messages`.

### Design decisions (closing the prior "Remaining" list)
- **#1 sub-agent lifecycle** — done by holding `Agent` instances in the runner and moving forking onto `Agent`. Kept the runner (single-process async scheduling + concurrency cap + host auto-wake) instead of pushing lifecycle into each Agent.
- **#2 migrate AppContext services onto Agent** — rejected. `SkillLoader`/`MemoryManager`/`TaskManager`/`BackgroundManager` are process-level, disk-backed infrastructure; Agent owns identity + config + conversation only and reaches them via the shared `toolRuntime`. Owning stateful services is what makes forking leak state.
- **#3 Agent owns HookBus/MemoryManager** — MemoryManager: no (see #2). HookBus: **forked children no longer inherit the lead's HookBus** (it's a host-interaction device; sharing it leaked the child's tool logs into the lead's output), so a sub-agent runs **silent** by default. A child can still be handed its own hooks explicitly; a full per-agent output sink (foreground streaming vs background quiet, plus surfacing running sub-agents) is deferred until there's a TUI.
- **#4 session/fork semantics** — done via `Agent.fork`'s three-way split.
- **No `depth` guard** — recursion is already prevented: `SUB_AGENT_ALLOWED_TOOLS` excludes `subagent`, so a child can't spawn grandchildren. A depth counter would be dead defense.

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

### Remaining (superseded — see the entry above)
- `SubAgentRunner` still manages subagents with Map + notifications; not yet using Agent instances for lifecycle.
- `AppContext` still holds `SkillLoader`, `MemoryManager`, `TaskManager`, `BackgroundManager` — these should migrate onto Agent over time.
- Agent does not own its own `HookBus` or `MemoryManager` yet; these are still shared via `AppContext`.
- No session/fork semantics — Agent instances share the same `ToolRuntime`.
