# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Run with tsx (dev)
pnpm dev:watch        # Run with hot reload
pnpm build            # Clean + tsc compile
pnpm start            # Run compiled output
```

## Architecture

This is a minimal coding-agent runtime harness — it builds the core loop (model ↔ tools) from scratch so every piece is visible. It's **not a framework**; it's deliberately thin.

**Entry point:** `src/main.ts` → `src/cli.ts` readline loop → `src/agentLoop.ts`

**Core loop** (`src/agentLoop.ts`):
1. Sends messages to the model with tools
2. If stop_reason is `tool_use`, executes each tool via `ToolRuntime.invokeTool()`, feeds results back as user messages
3. Orchestration-level tools (`task`, `spawn_teammate`) are intercepted in the loop itself rather than dispatched to `toolRuntime`
4. If stop_reason is anything else, returns the final response
5. Enforces max_turns and timeout; injects task reminders after 3+ rounds without a task update
6. Subagents use the same `agentLoop()` but with a restricted toolset (no `task` tool), fewer turns, and no todo reminders
7. Teammates also reuse `agentLoop()` via `beforeTurn` hook for inbox polling, with 50-turn cap

**Tools** (`src/tools/`):
- `toolDefinitions.ts` — Anthropic tool schemas (what the model sees). 17 tools total; `allowedTools` filters per agent role
- `toolRuntime.ts` — dispatching handler that maps tool names to implementations. Uses `requireString`/`requireInteger` helpers for input validation; `agentIdentity` (AsyncLocalStorage) propagates caller identity for team tools
- File tools (`bash`, `read_file`, `write_file`, `edit_file`) all route through `safePath.ts` which resolves symlinks and enforces workspace containment
- `taskManager.ts` — JSON-file task persistence in `.tasks/` with status transitions (pending→in_progress→completed) and blocking dependencies
- `backgroundManager.ts` — fire-and-forget shell commands with notification queue, consumed by agentLoop as `<background-results>`
- `subagent.ts` — constrained `agentLoop` runner for the `task` tool; `TEAMMATE_ALLOWED_TOOLS` re-export moved to team module

**Agent Teams** (`src/team/`):
- `teammateManager.ts` — spawn/fire-and-forget teammate lifecycle (working→idle→shutdown), in-memory inbox Map per teammate, notification queue for `<teammate-updates>` injection
- `types.ts` — TeamMember, TeamMessage, TeamConfig; 5 message types declared (message/broadcast/shutdown_request/shutdown_response/plan_approval_response)
- Teammates share the same `agentLoop()` as the lead, differentiated by `allowedTools` (6 tools vs lead's 17), `system` prompt, and `beforeTurn` callback for inbox polling

**Skills** (`src/skills/skillLoader.ts`):
- Two-layer injection: `getDescriptions()` returns a short list for the system prompt; `getContent(name)` returns the full SKILL.md body on tool call
- Directory convention: `skills/<name>/SKILL.md` with `---\ndescription: ...\n---\n` YAML frontmatter
- Loaded at startup via `runtime.ts` singleton

**Context compaction** (`src/contextCompact.ts`):
- **Micro-compact** (per-turn, >30k estimated tokens): clears old tool results, preserving the last 8 and any `read_file` results
- **Auto-compact** (per-turn, >50k tokens): sends older messages to a summarizer model, saves full transcript to `.transcripts/`, replaces history with summary + recent messages

**Config** (`src/config.ts`): Reads env vars, initializes Anthropic client. `runtime.ts` holds stateful singletons (currently just `skillLoader`). Dependency direction: config → runtime (never reverse).

## API Provider Compatibility

Uses Anthropic SDK but supports Anthropic-compatible providers via `ANTHROPIC_BASE_URL`. See `.env.example` for MiniMax, GLM (Zhipu), Kimi (Moonshot), and DeepSeek endpoint configs. Set `MODEL_ID` accordingly.

## Design Principles (from README)

Before merging, answer: reusability across callers, lifecycle alignment (state change frequency), crosscutting vs. business logic, hot path vs. cold path, and whether choices are falsifiable (not "I prefer").
