## Agent Harness Lab

A TypeScript learning harness for building coding-agent runtime pieces step by step:
tool loops, local tools, skill loading, subagents, context compaction,
persistent task tracking, background task execution, agent teams with mailbox communication,
persistent memory with cross-session retention, and DI container (AppContext) for service lifecycle management.

Based on the [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) tutorial series,
reimplemented in TypeScript. Learning notes are in `note/`.

The project is intentionally small so each harness concern stays visible in code.

## What's Built

- **Tool Use** — bash, read_file, write_file, edit_file with workspace containment (safePath)
- **Subagent** — constrained agentLoop runner for the `task` tool, isolated execution
- **Skill Loading** — directory-based skill injection with YAML frontmatter
- **Context Compaction** — micro-compact (per-turn result compression) + auto-compact (LLM summarization)
- **Task System** — JSON-file persistent tasks (`.tasks/`) with status transitions and dependency graph
- **Background Tasks** — fire-and-forget shell commands with notification-based result injection
- **Agent Teams** — persistent named teammates with async mailboxes, inbox polling, and notification injection
- **Memory** — cross-session persistent memory (`.memory/*.md`) with index injection, dual write paths (tool + background extraction), and session-exit consolidation

## Source Layout

- `src/agent/` — model loop, loop options, deadline handling, context compaction, and subagent runner
- `src/app/` — app object graph and runtime wiring, including orchestration tools and hooks
- `src/cli/` — interactive readline shell and terminal presentation helpers
- `src/hooks/` — process-local hook bus used by app wiring, not core loop policy
- `src/tools/` — tool schemas, tool runtime dispatch, and concrete local tool implementations
- `src/team/`, `src/memory/`, `src/skills/` — focused domains used by the app/runtime layer

## Pre-merge Checklist

- [ ] **Reusability** — Would this still work if called from a CLI/test/doc-gen?
- [ ] **Lifecycle** — Do these pieces of state change at the same frequency?
- [ ] **Concern type** — Business logic, or crosscutting (logging/metrics/cache)?
- [ ] **Path weight** — Hot path (per call) or cold path (once at startup)?
- [ ] **Falsifiable** — Is the choice based on objective criteria, not "I prefer"?
