# Hook System

Hooks extend the agent loop at known lifecycle points. They are intentionally split into effect hooks and control hooks.

## Events

```text
LoopStart
UserPromptSubmit
PreToolUse
PostToolUse
ToolResultsReady
Stop
```

## Effect Hooks

Effect hooks run every registered callback. Return values are ignored.

```text
LoopStart
UserPromptSubmit
PostToolUse
ToolResultsReady
```

Use these for lifecycle state changes, message/result mutation, terminal display, and other observer behavior.

Important semantics:

- `LoopStart` initializes per-loop state.
- `UserPromptSubmit` may mutate `messages` before the model call.
- `PostToolUse` observes a completed tool call and may update local state.
- `ToolResultsReady` may mutate the result list before it is pushed as a user message.

`ToolResultsReady` is mutation-only. It no longer returns extra text through a second channel.

## Control Hooks

Control hooks return `string | null` and stop at the first non-null string.

```text
PreToolUse
Stop
```

`PreToolUse` can block a tool call. The returned string becomes the `tool_result.content`.

`Stop` can force continuation after a non-tool model stop. The returned string is appended as a user message.

## Typed Contract

`src/hooks/index.ts` defines per-event argument types:

```ts
type HookArgs = {
  LoopStart: [messages];
  UserPromptSubmit: [messages];
  PreToolUse: [block];
  PostToolUse: [block, output];
  ToolResultsReady: [results];
  Stop: [messages];
};
```

This avoids `unknown[]` casts in hook implementations and documents the loop contract in code.

## Failure Policy

Hook callbacks currently throw through the caller. This is intentional for now.

Do not silently swallow hook failures unless the hook system first gains explicit hook categories such as audit-only or best-effort logging.

## Invariants

- Effect hooks must not short-circuit.
- Control hooks must short-circuit on the first non-null string.
- `ToolResultsReady` should add content by mutating `results`.
- Hook code should not become the place where provider discovery, MCP transport, or tool normalization logic lives.
