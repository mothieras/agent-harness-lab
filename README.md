## Agent Harness Lab

A TypeScript learning harness for building coding-agent runtime pieces step by step,
following the [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) tutorial series.

The project is intentionally small so each harness concern stays visible in code.

## What's Built

- **Agent Loop** — model ↔ tools core loop with max_turns and deadline enforcement
- **Tool System** — builtin and orchestration tools including file ops, task tracking, background tasks, team comms, and blocking subagent delegation
- **System Prompt** — stability-ordered section assembly (soul → guidelines → skills → memory)
- **Permission Pipeline** — three-gate check (deny list → rule matching → user approval)
- **Hook Bus** — six event points with instance-based HookBus (not global state)
- **Subagent** — constrained blocking `agentLoop` delegation via `subagent` tool, isolated execution
- **Teammate** — async teammate manager and inbox primitives retained for future explicit actor work
- **Skill Loading** — two-layer injection: index in system prompt, full content on demand
- **Context Compaction** — micro-compact (>30k tokens), auto-compact (>50k tokens), reactive compact on prompt overflow
- **Error Recovery** — output-token recovery, reactive compaction on prompt overflow, and bounded backoff for rate limits, overloads, and transient network failures
- **Task System** — JSON-file persistent tasks (`.tasks/`) with status transitions and dependencies
- **Background Tasks** — fire-and-forget shell commands with notification injection
- **Memory** — cross-session persistent memory (`.memory/*.md`) with auto-extraction and consolidation

## Source Layout

- `src/main.ts` → `src/cli/index.ts` → `src/app/context.ts` → `src/agent/loop.ts` is the normal startup path
- `src/agent/` — core loop, recovery decisions, options, deadline, context compaction, subagent runner
- `src/prompt/` — system prompt sections and stability-ordered assembly
- `src/permission/` — three-gate permission pipeline (deny list, rules, user approval)
- `src/hooks/` — typed HookBus with effect/control events for six loop lifecycle points
- `src/tools/` — `RegisteredTool` contracts, builtin provider, mock MCP provider, per-tool builtin factories, `ToolRegistry`, `ToolRuntime`, allowed tool profiles, input validation
- `src/app/` — DI container (`AppContext`), startup registration, tool-profile validation, orchestration tools, runtime hooks, message injection
- `src/cli/` — interactive readline shell and terminal presentation
- `src/team/` — teammate lifecycle, inbox messaging, notifications
- `src/memory/` — cross-session persistent memory with index and consolidation
- `src/skills/` — directory-based skill loading with YAML frontmatter

## Runtime Flow

1. `createAppContext()` builds managers, loads builtin `RegisteredTool[]`, registers any preloaded provider results in `ToolRegistry`, then validates allowed tool profiles.
2. `registerOrchestrationTools()` adds `subagent` as the default orchestration tool.
3. `agentLoop()` receives tool definitions and only owns model/tool protocol orchestration.
4. Tool execution goes through `ToolRuntime.invokeTool()` → `ToolRegistry.getHandler()`.
5. Subagent loops use centralized allowed tool profiles; unknown allowed tool names fail fast instead of being silently filtered. Teammate profiles remain validated for future async actor work.

## Architecture Docs

- `docs/architecture/runtime-flow.md` — startup path, loop responsibilities, and error boundaries
- `docs/architecture/tool-system.md` — `RegisteredTool`, providers, registry/runtime, builtin factories, and MCP-0 mock provider boundaries
- `docs/architecture/hook-system.md` — effect hooks, control hooks, event semantics, and hook invariants
- `docs/decisions/` — short ADR-style notes for the main architecture decisions

## Pre-merge Checklist

- [ ] **Reusability** — Would this still work if called from a CLI/test/doc-gen?
- [ ] **Lifecycle** — Do these pieces of state change at the same frequency?
- [ ] **Concern type** — Business logic, or crosscutting (logging/metrics/cache)?
- [ ] **Path weight** — Hot path (per call) or cold path (once at startup)?
- [ ] **Falsifiable** — Is the choice based on objective criteria, not "I prefer"?
