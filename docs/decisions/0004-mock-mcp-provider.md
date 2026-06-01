# 0004: Mock MCP Provider Boundary

## Status

Accepted.

## Context

The tool architecture was prepared for MCP, but connecting real MCP transport immediately would mix several concerns: provider loading, schema conversion, result normalization, process/http transport, credentials, and connection lifecycle.

We needed to validate the provider/registry/runtime boundary before introducing real transport complexity.

## Decision

Implement MCP-0 as a mockable provider boundary:

- Define a minimal `McpClient` interface.
- Implement `loadMcpTools({ serverName, client })`.
- Convert listed MCP tools into namespaced `RegisteredTool` entries.
- Preserve source metadata as `{ type: "mcp", serverName, originalName }`.
- Build handlers that call `client.callTool(originalName, input)`.
- Normalize MCP-like results into the current string tool-result format.
- Return unavailable provider diagnostics when listing tools fails.
- Provide `MockMcpClient` for tests and architecture validation.

`createAppContext()` accepts preloaded provider results, so tests or future setup code can register mock MCP tools without making app context async.

## Consequences

Good:

- MCP data flow is now executable through registry and runtime.
- The loop remains unaware of MCP.
- Real transport can be added behind `McpClient`.
- Result normalization and diagnostics are testable without external servers.

Tradeoffs:

- This is not yet real MCP transport.
- App startup does not discover MCP config on its own.
- Real transport will still need config, credentials, lifecycle, and connection handling.

## Invariants

- Registry names use `mcp__server__tool`.
- MCP servers are called with original tool names.
- `source` must not contain credentials.
- Provider failures return diagnostics, not partially registered broken tools.
