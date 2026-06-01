# 0002: Builtin Tool Factories

## Status

Accepted.

## Context

After introducing `RegisteredTool`, builtin tools still lived in a central `toolHandlers.ts` file. That kept too much ownership in one place and made the builtin provider feel like a renamed global handler table.

The desired ownership model is that each tool owns its own definition and handler.

## Decision

Move builtin tools under `src/tools/builtin/**`.

Each tool file exports one factory:

```ts
createXTool(deps): RegisteredTool
```

Group indexes aggregate related tools. The builtin provider loads the top-level builtin index and returns the resulting tools.

## Consequences

Good:

- The tool owner is obvious.
- Definition and handler cannot drift across separate files.
- New tools follow a repeatable path.
- Builtin tools and future MCP tools share the same final shape.

Tradeoffs:

- More files.
- Simple tools have a little more boilerplate.

## Invariants

- Do not recreate `src/tools/toolDefinitions.ts`.
- Do not recreate `src/tools/toolHandlers.ts`.
- Group indexes aggregate only.
- Keep builtin tool order explicit.
