# 0005: Stable Subagent Orchestration

## Status

Accepted, then superseded by [0006](0006-async-subagent-runner.md) for the subagent execution model (synchronous → asynchronous). The role/name metadata, teammate deferral, and CLI readline-lifecycle decisions below remain in force. Note: `runSubAgent` (below) was later replaced by `forkSubAgent`, which forks the parent `Agent` — see [0008](0008-agent-object-model.md); role/name injection into the child system prompt is unchanged.

## Context

Manual CLI testing showed that the basic file, task, background, skill, subagent, registry, runtime, builtin factory, hook, and mock MCP boundaries are mostly working. The unstable behavior is concentrated in orchestration and CLI lifecycle.

The failing path used `teammate` for a reviewer-style task:

```text
Create a teammate named reviewer, ask it to review docs/architecture/tool-system.md,
then read the message it sends back.
```

The lead agent spawned the teammate, repeatedly read an empty inbox, saw the teammate remain `working`, tried to message it again, and eventually hit a readline lifecycle crash:

```text
Error [ERR_USE_AFTER_CLOSE]: readline was closed
```

The root issue is architectural: `teammate` is an asynchronous actor, while this request expects blocking delegation. The lead agent receives only a "spawned" tool result, so the lead turn can stop before the teammate finishes. The result then depends on a later user prompt, inbox draining, and teammate self-reporting.

Claude Code / Codex style task delegation is better modeled as a blocking tool call:

```text
lead calls subagent/delegate
runtime waits for the child agent to finish
child result is returned as the tool result
lead resumes the same turn and reports to the user
```

## Decision

Use `subagent` as the default orchestration path for delegated work.

The default behavior is synchronous from the lead agent's point of view:

- The lead calls the `subagent` tool.
- The subagent runs an isolated `agentLoop`.
- The lead waits for the subagent loop to finish, timeout, or fail.
- The subagent final response is returned as the `tool_result`.
- The lead continues the same turn with that result.

Extend `subagent` with explicit role metadata:

- `prompt`: required task prompt.
- `role`: optional role description, such as `code reviewer`.
- `name`: optional display identity, such as `reviewer`.
- `max_turns`: optional positive integer.
- `timeout_ms`: optional positive integer.

The role and name should affect the subagent system prompt and observable logs only. They must not introduce persistent teammate state.

Hide `teammate` from the default orchestration entry point for now.

This means:

- Do not register the `teammate` orchestration tool by default.
- Keep the existing teammate manager and team builtin tools in source for future async-actor work.
- Do not delete teammate code as part of this change.
- Do not route ordinary reviewer, tester, or analyzer tasks through teammate.

Fix CLI readline close handling as part of this phase because it is not teammate-specific. Once the readline interface has closed, the CLI must not call `rl.question()` again.

## Non-Goals

This change does not redesign Provider, Registry, Runtime, builtin factories, HookBus, or MCP.

This change does not implement a full async teammate runtime. The following remain deferred:

- `wait_teammate`.
- teammate cancellation.
- teammate timeout policy.
- lead auto-wake when async teammate work completes.
- inbox injection versus manual `read_inbox` semantics.
- concurrent permission prompts across lead and background teammates.

## Consequences

Good:

- Reviewer-style tasks use the simpler and expected blocking delegation path.
- The lead does not stop before delegated work returns.
- Subagent results do not depend on inbox delivery.
- The CLI is more robust to readline close events.
- The main runtime boundary stays thin: orchestration remains normal tools registered at app assembly time.

Tradeoffs:

- Teammate is no longer available as a default visible tool.
- Async collaboration is postponed.
- Existing teammate tests may need to move toward manager-level coverage rather than default orchestration behavior.

## Implementation Scope

### Subagent

- Add `role` and `name` fields to the `subagent` tool schema.
- Thread `role` and `name` into `runSubAgent()`.
- Build the subagent system prompt from workspace, optional name, and optional role.
- Preserve current defaults for `max_turns` and `timeout_ms`.
- Keep allowed tools controlled by `SUB_AGENT_ALLOWED_TOOLS`.

### Orchestration Tool Registration

- Register `subagent` by default.
- Stop registering `teammate` in the default CLI/app orchestration path.
- Leave teammate implementation files in place.
- Leave `TEAMMATE_ALLOWED_TOOLS` in place for future async teammate work unless it becomes unused in TypeScript.

### CLI Lifecycle

- Guard readline usage with a closed flag.
- Treat `ERR_USE_AFTER_CLOSE` from `rl.question()` as a clean exit path.
- Avoid calling `rl.close()` again after it has already closed.
- Apply the same guarded question path to permission prompts.

## Tests

Add or update tests for:

- `subagent` tool schema accepts optional `role` and `name`.
- `runSubAgent()` includes role/name in the child system prompt.
- `subagent` remains blocking and returns the child final response as tool output.
- `subagent` preserves max-turn and timeout override behavior.
- default orchestration registration exposes `subagent` but not `teammate`.
- readline close handling does not throw `ERR_USE_AFTER_CLOSE`.

Keep teammate tests limited to existing manager behavior for now:

- working same-name spawn returns an error.
- resolved loop becomes `idle`.
- rejected loop becomes `failed`.

Do not add tests that require teammate inbox delivery as part of the default orchestration path in this phase.

## Invariants

- `agentLoop` must remain unaware of whether a tool is builtin, orchestration, or MCP.
- `ToolRuntime` must continue dispatching through `ToolRegistry`.
- Subagent delegation must return through normal tool-result flow.
- Teammate async actor behavior must not be the default path for delegated review or analysis tasks.
