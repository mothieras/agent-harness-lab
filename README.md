## Agent Harness Lab

A from-scratch, framework-free coding-agent runtime in TypeScript (~2200 lines) — the
model↔tools core loop built up piece by piece so every runtime concern (tool dispatch,
permission gating, subagent delegation, context compaction, error recovery) stays visible
in code rather than buried inside a framework.

Started from the Python implementation in the
[shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) tutorial,
then substantially rewritten and extended into a modular TypeScript runtime — multi-agent
delegation, two-layer context compaction, skill loading, and the permission pipeline were
added independently.

## What's Built

- **Agent Loop** — model ↔ tools core loop with max_turns and deadline enforcement
- **Tool System** — one file per tool, grouped by function (file ops, task tracking, background tasks, async subagent delegation, skills, memory), composed through a single `loadBuiltinTools` provider
- **System Prompt** — stability-ordered section assembly (soul → guidelines → skills → memory)
- **Permission Pipeline** — three-gate check (deny list → rule matching → user approval)
- **Hook Bus** — six event points with instance-based HookBus (not global state)
- **Subagent** — async `agentLoop` delegation via the `subagent`/`check_subagent` builtin tools; fire-and-forget with identity isolation, host auto-wake, and lead-only result injection (see ADR 0006)
- **Skill Loading** — two-layer injection: index in system prompt, full content on demand
- **Context Compaction** — micro-compact (>30k tokens), auto-compact (>50k tokens), reactive compact on prompt overflow
- **Error Recovery** — output-token recovery, reactive compaction on prompt overflow, and bounded backoff for rate limits, overloads, and transient network failures
- **Task System** — JSON-file persistent tasks (`.tasks/`) with status transitions and dependencies
- **Background Tasks** — fire-and-forget shell commands with notification injection
- **Memory** — cross-session persistent memory (`.memory/*.md`) with auto-extraction and consolidation

## Source Layout

- `src/main.ts` → `src/cli/index.ts` → `src/app/context.ts` → `src/loop/loop.ts` is the normal startup path
- `src/loop/` — core loop, recovery decisions, options, deadline, context compaction, response formatting
- `src/prompt/` — system prompt sections and stability-ordered assembly
- `src/permission/` — three-gate permission pipeline (deny list, rules, user approval)
- `src/hooks/` — typed `HookBus` (`hookBus.ts`), runtime injections (`runtimeHooks.ts`), tagged message injection
- `src/tools/` — `RegisteredTool` contracts (`types.ts`), `ToolRegistry`, `ToolRuntime`, allowed tool profiles, the single `builtins.ts` composition, and one file per tool under function groups (`file/`, `task/`, `background/`, `subagent/`, `skill/`, `memory/`) with co-located state managers; `mcp/` mock provider boundary
- `src/app/` — DI container (`AppContext`) / composition root and tool-profile validation
- `src/cli/` — interactive readline shell and terminal presentation

## Runtime Flow

1. `createAppContext()` builds managers, then `ToolRegistry` → `ToolRuntime` → `SubAgentRunner`, then loads builtin `RegisteredTool[]` (including `subagent`/`check_subagent`) plus any preloaded provider results, and validates allowed tool profiles.
2. `agentLoop()` receives tool definitions and only owns model/tool protocol orchestration.
3. Tool execution goes through `ToolRuntime.invokeTool()` → `ToolRegistry.getHandler()`.
4. Subagent loops use centralized allowed tool profiles; unknown allowed tool names fail fast instead of being silently filtered.

## Architecture Docs

- `docs/architecture/runtime-flow.md` — startup path, loop responsibilities, and error boundaries
- `docs/architecture/tool-system.md` — `RegisteredTool`, providers, registry/runtime, builtin factories, and MCP-0 mock provider boundaries
- `docs/architecture/hook-system.md` — effect hooks, control hooks, event semantics, and hook invariants
- `docs/decisions/` — short ADR-style notes for the main architecture decisions
