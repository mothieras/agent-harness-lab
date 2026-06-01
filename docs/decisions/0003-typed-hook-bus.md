# 0003: Typed Hook Bus

## Status

Accepted.

## Context

The hook bus originally used one callback type:

```ts
(...args: unknown[]) => string | null
```

That hid the real contract. Some events mutate messages, some observe tool output, some block tool execution, and some force continuation. Worse, the old trigger path short-circuited on the first non-null string for every event, even when the caller ignored the return value.

## Decision

Split hooks into:

- Effect hooks: run all callbacks, ignore return values.
- Control hooks: return `string | null`, short-circuit on the first string.

Define per-event argument types in `HookArgs`.

`ToolResultsReady` is now mutation-only; callbacks push additional result blocks directly.

## Consequences

Good:

- Hook intent is visible in the type system.
- Effect hooks cannot accidentally skip later callbacks at runtime.
- Runtime hooks no longer need `unknown` casts.
- The hook system is less likely to become a catch-all for MCP/provider logic.

Tradeoffs:

- HookBus has two trigger methods instead of one.
- TypeScript still allows a function returning a value to be passed where `void` is expected, but runtime ignores that value.

## Invariants

- Use `emitEffect()` for effect hooks.
- Use `triggerControl()` for control hooks.
- Do not add a second return-value channel to `ToolResultsReady`.
- Do not swallow hook exceptions without an explicit policy.
