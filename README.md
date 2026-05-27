## Agent Harness Lab

A TypeScript learning harness for building coding-agent runtime pieces step by step,
following the [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) tutorial series.

The project is intentionally small so each harness concern stays visible in code.

## What's Built

- **Agent Loop** — model ↔ tools core loop with max_turns and deadline enforcement
- **Tool System** — 18 tools including file ops, task tracking, background tasks, team comms
- **System Prompt** — stability-ordered section assembly (soul → guidelines → skills → memory)
- **Permission Pipeline** — three-gate check (deny list → rule matching → user approval)
- **Hook Bus** — six event points with instance-based HookBus (not global state)
- **Subagent** — constrained agentLoop via `subagent` tool, isolated execution
- **Teammate** — persistent async agents with inbox-based communication via `teammate` tool
- **Skill Loading** — two-layer injection: index in system prompt, full content on demand
- **Context Compaction** — micro-compact (>30k tokens), auto-compact (>50k tokens), reactive compact on prompt overflow
- **Error Recovery** — output-token recovery, reactive compaction on prompt overflow, and bounded backoff for rate limits, overloads, and transient network failures
- **Task System** — JSON-file persistent tasks (`.tasks/`) with status transitions and dependencies
- **Background Tasks** — fire-and-forget shell commands with notification injection
- **Memory** — cross-session persistent memory (`.memory/*.md`) with auto-extraction and consolidation

## Source Layout

- `src/agent/` — core loop, recovery decisions, options, deadline, context compaction, subagent runner
- `src/prompt/` — system prompt sections and stability-ordered assembly
- `src/permission/` — three-gate permission pipeline (deny list, rules, user approval)
- `src/hooks/` — HookBus class with register/trigger for six loop events
- `src/tools/` — tool schemas, runtime dispatch, handlers grouped by concern, input validation
- `src/app/` — DI container (AppContext), orchestration tools, runtime hooks, message injection
- `src/cli/` — interactive readline shell and terminal presentation
- `src/team/` — teammate lifecycle, inbox messaging, notifications
- `src/memory/` — cross-session persistent memory with index and consolidation
- `src/skills/` — directory-based skill loading with YAML frontmatter

## Pre-merge Checklist

- [ ] **Reusability** — Would this still work if called from a CLI/test/doc-gen?
- [ ] **Lifecycle** — Do these pieces of state change at the same frequency?
- [ ] **Concern type** — Business logic, or crosscutting (logging/metrics/cache)?
- [ ] **Path weight** — Hot path (per call) or cold path (once at startup)?
- [ ] **Falsifiable** — Is the choice based on objective criteria, not "I prefer"?
