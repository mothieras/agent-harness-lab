# Limitations and Roadmap

Honest record of what is *not* clean yet and where it would go next. This is a deliberately thin learning harness, so several "limitations" are intentional non-goals — those are listed separately at the end so they are not mistaken for backlog.

Where useful, items reference how a mature production agent (Hermes, ~1M LOC) handles the same concern, as a sanity check on direction.

## Known limitations

### 1. `ToolRuntime` is a grab-bag (highest priority)

`src/tools/runtime.ts` mixes two responsibilities: generic tool dispatch (`invokeTool` → registry → handler) and task/background convenience methods (`taskSummary`, `hasActiveTasks`, `drainBackgroundNotifications`, …). The dispatcher should not know about specific tool families.

- **Why it matters:** it is the one place the refactor left less clean than the rest. The generic loop dispatch path is coupled to two specific subsystems.
- **Direction:** split into a pure dispatcher (registry lookup + error normalization) and separate task/background state accessors that hooks/CLI read directly. Hermes keeps these apart as `agent/tool_executor.py` and `agent/tool_guardrails.py`, distinct from both the loop and state.
- **Was explicitly out of scope** in ADR 0007; it is the natural next cut.

### 2. Central composition does not scale past a handful of tools

`src/tools/builtins.ts` lists every tool, its order, and its deps in one file. This is great for a thin "everything visible" harness, but adding a tool means editing the central list.

- **Direction (only if tool count grows):** move to decentralized self-registration with discovery — each tool file registers itself; a discovery pass imports self-registering modules. Hermes does exactly this (`tools/registry.py`: `registry.register(...)` at module level + `discover_builtin_tools()`), which is why it carries ~90 tools without a central manifest. Keep the explicit manifest until the manifest itself becomes the friction.

### 3. Single model-provider seam

`src/config.ts` targets the Anthropic SDK (with `ANTHROPIC_BASE_URL` for Anthropic-compatible providers). There is no adapter layer for genuinely different provider protocols.

- **Direction (only if multi-protocol is needed):** introduce a provider-adapter seam at the model-call boundary in `src/loop/loop.ts`. Hermes isolates each protocol behind `agent/anthropic_adapter.py`, `agent/gemini_native_adapter.py`, `agent/codex_responses_adapter.py`, etc. Today this would be over-engineering.

### 4. No dynamic tool gating / search

All registered tool definitions are sent to the model every turn (subject to `profiles.ts` allow-lists). Fine at the current tool count.

- **Direction (only at scale):** dynamic tool search / lazy schema loading once the full tool list strains the context window. Hermes uses `tools/tool_search.py` + `managed_tool_gateway.py` for this.

### 5. Tests are integration-leaning

Coverage favors wiring (`createAppContext`, registry/runtime, hook injection) over per-tool unit tests. Tool handlers are mostly exercised indirectly.

- **Direction:** add focused unit tests per tool factory as individual tools accrue real logic. The structural contract test (`tests/builtin-tool-ownership.test.ts`) already guards the layout.

## Intentional non-goals (not limitations)

These are deliberate, consistent with the project being a thin, readable harness rather than a framework:

- **No nested subagents** — `SUB_AGENT_ALLOWED_TOOLS` excludes `subagent`/`check_subagent` (ADR 0006).
- **No real MCP transport** — `src/tools/mcp/` stops at the MCP-0 boundary behind `McpClient` (ADR 0004).
- **Central, explicit `builtins.ts`** — chosen over auto-discovery on purpose, so the full tool set and order are visible in one file (see limitation #2 for when to revisit).
- **No workflow/DAG scheduler** — task dispatch authority stays with the LLM, not a deterministic engine (ADR 0006).
