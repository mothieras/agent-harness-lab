# 0006: Async Subagent Runner

## Status

Accepted. Supersedes [0005](0005-stable-subagent-orchestration.md) for the subagent execution model (synchronous → asynchronous). The role/name metadata, teammate deferral, and CLI readline-lifecycle decisions from 0005 remain in force. Note: the `src/agent/` paths below were later relocated to `src/tools/subagent/` by [0007](0007-tool-structure-and-layout-overhaul.md); the design is unchanged. Note: the identity-isolation mechanism described below (`agentIdentity.run(subId, …)`) and the `runSubAgent` wrapper were later replaced by an `Agent` object, `parent.fork()`, and a single `currentAgent` ALS — see [0008](0008-agent-object-model.md). The async execution model (runner, host auto-wake, never-rejects, lead-only drain, concurrency cap, no nested subagents) is unchanged.

## Context

0005 made `subagent` a **blocking** tool: the lead calls it, the runtime runs the child `agentLoop` inline, and the child's final response returns as the `tool_result` in the same turn. That stabilized reviewer-style delegation and removed the teammate inbox failure mode.

Two limitations surfaced:

- The Task system produces a dependency graph, but blocking subagents cannot exploit it. Even when the graph shows two independent tasks, the lead can only run them one at a time — each `subagent` call blocks the loop until the child finishes. The DAG is descriptive but not executable in parallel.
- 0005 explicitly deferred "lead auto-wake when async work completes." That deferral is exactly the missing primitive for concurrent delegation.

This runtime is single-threaded. "Concurrency" here means cooperative interleaving on one event loop: the agent loop is I/O-bound (every turn awaits an LLM call), so while the lead awaits its own model call, a pending child's awaited model call can progress. This yields real throughput for I/O-bound LLM work — not CPU parallelism.

The codebase already has a proven async primitive: `BackgroundManager` (fire-and-forget shell commands) with `run → id`, `check`, `hasRunning`, `drainNotifications`, plus host-side auto-wake in the CLI. Note: there is no `Stop` control hook gating the lead today — the "keep going while work is pending" behavior already lives in the CLI loop, not in the agent.

## Decision

Replace the blocking `subagent` tool with an async `SubAgentRunner` (`src/agent/subAgentRunner.ts`) that mirrors `BackgroundManager`.

`SubAgentRunner` is a **task-agnostic execution primitive**:

- `run(prompt, options) → sub_id` — returns immediately; spawns the child fire-and-forget.
- `check(subId?)`, `hasRunning()`, `drainNotifications()` — same shape as `BackgroundManager`.
- It wraps the existing `runSubAgent` and must never import `TaskManager`.

**Layering.** The runner is the bottom primitive; Task-DAG-driven dispatch is an **optional policy layer above it**, driven by the LLM. `task_id` is opaque ride-along metadata only (a correlation label echoed on notifications); the runner never reads or mutates task state. This keeps bare ad-hoc delegation (no task) as the default capability and DAG dispatch as additive.

**Lead lifecycle uses host auto-wake (Option A), not a Stop hook (Option B).**

- The lead ends its turn freely. The CLI loops `while (hasPendingAsyncWork(app))` — background tasks OR `subAgentRunner.hasRunning()` — and re-invokes the lead via `waitForAsyncWork` (a 500ms poll with a SIGINT escape).
- Results reach the lead via the lead-only `injectSubagentResults` on `PreLLMCall`, delivered as `<subagent-results>` messages.

**Three isolation properties** are engineered because, unlike `BackgroundManager` (separate OS process, zero shared state), a subagent runs in-process sharing `toolRuntime`:

- **Identity isolation** — each child executes inside `agentIdentity.run(subId, …)` so its hooks attribute to `subId`, never the lead. Without it a child corrupts the lead's task state and drains the lead's inbox.
- **Never-rejects** — the detached promise `.catch`es into an `error` status; an unhandled rejection would crash the Node process (`BackgroundManager` gets this for free via `exec`'s callback).
- **Lead-only drain** — `injectSubagentResults` and `injectBackgroundResults` early-return unless `agentName() === "lead"`, so a child cannot drain the lead's shared result queue.

**Deliberate divergences from `BackgroundManager`:**

- Results are injected **untruncated** — a subagent's product is its whole value; a shell tail is not. (`BackgroundManager` caps results at 500 chars.)
- A **concurrency cap** (`DEFAULT_MAX_CONCURRENT = 3`) rejects new runs past the limit with an error string. Subagents cost tokens and share one API key (429 risk); shell commands do not.

**Delivery invariant.** `settle()` pushes the notification synchronously **before** the running count drops, with no `await` in between. So when the host observes `hasRunning() === false`, every result is already queued, and the subsequent `runLeadTurn` drains it. No completed result is lost between turns.

## Alternatives Considered

- **Option B — `Stop` control hook** that forces the lead to continue while children are pending. Rejected: it puts a lifecycle concern inside the reasoning loop and degenerates into a token-burning busy-wait (each "are you done?" is another LLM call). Host auto-wake polls with zero LLM calls and reuses the existing background pattern.
- **Concurrent tool dispatch (`Promise.all` over `tool_use` blocks).** Rejected as the primary model: it blocks the turn on the slowest child and cannot interleave with further lead reasoning or react to early results. The async runner is strictly more flexible; batched dispatch stays compatible on top.
- **Deterministic harness DAG scheduler** (runtime auto-dispatches ready tasks). Deferred: it turns the project into a workflow engine and demotes the LLM to a task definer. Option A keeps dispatch authority in the host layer, leaving this door open.

## Non-Goals

- No nested subagents — `SUB_AGENT_ALLOWED_TOOLS` excludes `subagent`/`check_subagent` (prevents fork bombs and keeps notification routing flat).
- No automatic task-status mutation by the runner — the LLM marks a task `in_progress` before dispatch (guidance in the system prompt), which also prevents double-dispatch on re-wake.
- No teammate redesign; teammate code stays deferred as in 0005.
- No `subagent` cancellation; SIGINT skips waiting but does not abort a running child (same semantics as background tasks).

## Consequences

Good:

- The Task DAG becomes executable in parallel: the lead spawns children for independent tasks and collects results as they land.
- The async machinery is reused, not reinvented — one mental model shared with background tasks.
- Bare ad-hoc delegation (no task) is the default capability; DAG dispatch is additive.
- A pre-existing latent bug is fixed: `injectBackgroundResults` is now lead-only, so children can no longer drain the lead's background queue.

Tradeoffs:

- The lead no longer receives a subagent result as the spawning call's `tool_result`; results arrive as injected `<subagent-results>` on a later turn (one extra turn for the "spawn one, just wait" case).
- DAG parallelism is best-effort (LLM-directed), not guaranteed-optimal.
- Concurrent children burn tokens in parallel; the cap bounds but does not eliminate this.

## Invariants

- `SubAgentRunner` must not import `TaskManager`; `task_id` stays opaque.
- Every child must execute inside `agentIdentity.run(subId, …)`.
- The detached promise from `run()` must never reject.
- `injectSubagentResults` / `injectBackgroundResults` must drain only in lead identity.
- `hasRunningSubagents` must not live on `ToolRuntime` (would cycle `toolRuntime → subAgentRunner → toolRuntime`); the CLI reads `app.subAgentRunner` directly.
- `agentLoop` remains unaware of subagent orchestration; `subagent`/`check_subagent` are ordinary registered tools.

## Tests

- Runner: returns `sub_id` and registers running; completed reports untruncated result then drains once; each child runs under its own identity (not `lead`); a rejecting child settles as `error` without crashing; cap rejects past the limit; `check()` with no id lists all.
- Wiring: `createAppContext` exposes an idle runner.
- Tools: default orchestration exposes `subagent` and `check_subagent`; schema carries optional `task_id`; the tool returns a `sub_id` immediately.
- Hooks: subagent results inject in lead context only, not in child context.
- CLI: `hasPendingAsyncWork` reflects running subagents.
- Prompt: guidelines describe async dispatch, `check_subagent`, and marking tasks `in_progress` before dispatch.
