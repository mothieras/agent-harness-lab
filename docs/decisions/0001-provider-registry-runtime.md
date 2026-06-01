# 0001: Provider, Registry, Runtime

## Status

Accepted.

## Context

The original tool system mixed static tool definitions, handler lookup, and runtime invocation. That was workable for a small set of builtin tools, but it did not leave a clean path for MCP, where tools are discovered dynamically and providers can fail independently.

We needed a model that supports both builtin tools and external providers without teaching the agent loop about every source type.

## Decision

Use three layers:

- Provider: loads tools from one source and returns `RegisteredTool[]` plus diagnostics.
- Registry: stores registered tools and provider diagnostics.
- Runtime: invokes tools through the registry.

The agent loop only receives tool definitions and calls runtime invocation.

## Consequences

Good:

- Tool source differences stay outside the loop.
- MCP can be added as another provider.
- Registry can explain unavailable namespaces without registering broken tools.
- Runtime no longer needs its own handler map.

Tradeoffs:

- Startup assembly is more explicit.
- Tests need to construct registry/runtime in more places.

## Invariants

- `RegisteredTool.name` must equal `definition.name`.
- Duplicate tool names fail registration.
- Provider diagnostics must not contain secrets.
- The loop must not import providers.
