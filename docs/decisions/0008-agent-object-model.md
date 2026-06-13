# 0008: Agent Object Model and Forked Sub-agents

## Status

Accepted. Supersedes the **identity-isolation and sub-agent construction** mechanisms of [0006](0006-async-subagent-runner.md) and the `runSubAgent` construction of [0005](0005-stable-subagent-orchestration.md): the separate `agentIdentity` string ALS and the `runSubAgent` free function are replaced by an `Agent` class, `parent.fork()`, and a single `currentAgent` ALS. The async *execution* model of 0006 — `SubAgentRunner`, host auto-wake, never-rejects, lead-only drain, concurrency cap, no nested subagents — **remains in force**. Only how a child is constructed and how identity is carried have changed.

## Context

Three things had accreted independently:

1. `agentLoop(messages, toolRuntime, options)` took loosely-bundled parameters; identity, config, services, and conversation were threaded separately.
2. Per-agent identity lived in its own `agentIdentity: AsyncLocalStorage<string>` (ADR 0006), keyed by `subId` / `"lead"`, used only so hooks attribute to the right agent.
3. Sub-agents were built by `runSubAgent`, a free function that constructed an inline agent config from the parent's `toolRuntime`.

This worked, but had two seams: identity was a *string* ALS disconnected from the thing it identified, and "what a sub-agent is" was scattered between `runSubAgent` and the runner.

Hermes (the production reference) models the agent as an object (`AIAgent`) instantiated everywhere and never subclassed; a fork there re-binds ~10 private fields by hand, because the agent owns its stateful services. That hand-rebind is the cost of an agent that owns services.

## Decision

Introduce an `Agent` class (`src/agent.ts`) as the unit of identity + config + conversation, and make sub-agents forks of it.

- **`Agent`** bundles `id`, config (`system`, budgets, `allowedTools`), shared service *references* (`toolRuntime`, `hooks`, `checkPermission`), and the conversation `messages`. It owns no stateful service — process-level infrastructure (skill / memory / task / background managers) stays in `AppContext` and is reached through `toolRuntime`. This is precisely what lets a fork be cheap and leak-free — the opposite of Hermes' hand-rebind.
- **`agentLoop(agent)`** reads everything off the instance and binds it into a single `currentAgent: AsyncLocalStorage<Agent>` for the whole run. This is the **sole** place identity is established; the separate `agentIdentity` string ALS is deleted, and `runtimeHooks` now key per-agent state off `currentAgent.getStore()?.id ?? "lead"`.
- **`parent.fork(overrides)`** derives a child with an explicit three-way split:
  - **shared** (same reference): `toolRuntime`.
  - **inherited** unless overridden: `workspaceRoot`, `checkPermission` (so a child's permission can only be ≤ the parent's).
  - **isolated** (taken only from overrides, never copied from the parent): `id`, `name`, `role`, `system`, `maxTurns`, `timeoutMs`, `allowedTools`, `messages`, `hooks`.
- **`forkSubAgent(parent, id, prompt, options)`** replaces `runSubAgent`: it forks the parent into the subagent tool profile with shorter budgets and a prompt-seeded conversation. `id` is **required** so a child can never silently alias `"lead"`. `allowedTools` may only **narrow** the profile (requested ∩ profile), so a child's tool access stays ⊆ the parent and can't reach `subagent`.
- **A forked child is silent.** `hooks` is not inherited; the `HookBus` is a host-interaction device that belongs to the lead. A child runs without one unless explicitly handed its own, so its tool logs don't pollute the lead's output.

The dependency direction is the load-bearing property: `Agent → ToolRuntime`, but `ToolRuntime` / `ToolRegistry` / every tool **never import `Agent`**. A tool that must act on its caller (e.g. `subagent`) reads `currentAgent.getStore()` — a reverse edge carried by ALS, not a type import, so there is no `Agent ↔ ToolRuntime` cycle.

## Alternatives Considered

- **Migrate `AppContext` services onto `Agent`** (each agent owns its memory / task / skill managers). Rejected: these are process-level, disk-backed infrastructure with a lifecycle longer than any one agent. Owning stateful services is exactly what forces Hermes' per-field rebind on fork and what leaks state between parent and child. Sharing them by reference through `toolRuntime` keeps forks clean.
- **Keep the string `agentIdentity` ALS alongside the `Agent` object.** Rejected: two ALS for one concept. Once the agent is an object, the object *is* the identity; a second string keyed to it is redundant and can drift.
- **A `depth` counter to bound recursion.** Rejected as dead defense: `SUB_AGENT_ALLOWED_TOOLS` already excludes `subagent`, so a child cannot spawn grandchildren.

## Consequences

Good:

- One identity: the ALS carries the agent itself, not a string keyed to it. Forking is the only derivation path and the split is explicit in one method.
- Leak-free forks: because `Agent` owns no stateful service, a fork shares infrastructure by reference and isolates conversation/identity automatically — no hand-rebind of N fields.
- Monotonic tool scope: a child can only narrow, never widen, and can never spawn grandchildren.

Tradeoffs:

- `currentAgent` is an *implicit* dependency: a tool that forks its caller assumes it runs inside an `agentLoop`. This isn't in any signature, so such tools must guard (the `subagent` tool errors when `currentAgent` is unset).
- Sub-agents are unobservable mid-run: with no hooks, `check_subagent` can only report a child's message count, not its progress (see limitation #6).

## Invariants

- `agentLoop` is the sole binder of `currentAgent` and the sole place per-agent identity is established.
- `ToolRuntime` / `ToolRegistry` / tools must never import `Agent`; reverse access goes through `currentAgent`.
- `Agent` must not own stateful services; process-level infrastructure stays in `AppContext`.
- `fork` must not inherit `hooks` — a child is silent by default.
- A forked sub-agent's `allowedTools` must be ⊆ `SUB_AGENT_ALLOWED_TOOLS` (narrow-only), which excludes `subagent` (no nested subagents — consistent with 0006).
- `forkSubAgent` requires an explicit `id` (no silent `"lead"` alias).
