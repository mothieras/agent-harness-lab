# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Run with tsx (dev)
pnpm dev:watch        # Run with hot reload
pnpm build            # Clean + tsc compile
pnpm start            # Run compiled output
```

## Architecture

This is a minimal coding-agent runtime harness — it builds the core loop (model ↔ tools) from scratch so every piece is visible. It's **not a framework**; it's deliberately thin.

**Entry point:** `src/main.ts` → `src/cli/index.ts` readline loop → `src/agent/loop.ts`

**Core loop** (`src/agent/loop.ts`):
1. Sends messages to the model with tools
2. If stop_reason is `tool_use`, executes each tool via `ToolRuntime.invokeTool()` and feeds results back as user messages
3. Orchestration-level tools (`task`, `spawn_teammate`) are registered dynamically in `src/app/orchestrationTools.ts`
4. If stop_reason is anything else, triggers the `Stop` hook, then returns the final response
5. Enforces max_turns and timeout via `src/agent/deadline.ts`
6. Runtime injections (task status, background results, inbox messages, reminders) live in `src/app/runtimeHooks.ts`
7. Subagents and teammates reuse `agentLoop()` with restricted toolsets and different system prompts

**Tools** (`src/tools/`):
- `toolDefinitions.ts` — Anthropic tool schemas (what the model sees). 18 tools total; `allowedTools` filters per agent role
- `toolRuntime.ts` — thin dispatcher and runtime state holder; owns task/background managers and dynamic tool registration
- `toolHandlers.ts` — built-in tool implementations grouped by concern: file, skill, task, background, team, memory
- `input.ts` — shared tool input validation helpers (`requireString`, `requireInteger`, optional parsers)
- `agentIdentity.ts` — AsyncLocalStorage identity context used by lead, subagents, and teammates
- File tools (`bash`, `read_file`, `write_file`, `edit_file`) all route through `safePath.ts` which resolves symlinks and enforces workspace containment
- `taskManager.ts` — JSON-file task persistence in `.tasks/` with status transitions (pending→in_progress→completed) and blocking dependencies
- `backgroundManager.ts` — fire-and-forget shell commands with notification queue, consumed by runtime hooks as `<background-results>`
- `src/agent/subagent.ts` — constrained `agentLoop` runner used by the `task` tool

**Agent Teams** (`src/team/`):
- `teammateManager.ts` — spawn/fire-and-forget teammate lifecycle (working→idle→shutdown), in-memory inbox Map per teammate, notification queue for `<teammate-updates>` injection
- `types.ts` — TeamMember, TeamMessage; 5 message types declared (message/broadcast/shutdown_request/shutdown_response/plan_approval_response)
- Teammates share the same `agentLoop()` as the lead, differentiated by `allowedTools`, `system` prompt, and inbox polling via runtime hooks

**Skills** (`src/skills/skillLoader.ts`):
- Two-layer injection: `getDescriptions()` returns a short list for the system prompt; `getContent(name)` returns the full SKILL.md body on tool call
- Directory convention: `skills/<name>/SKILL.md` with `---\ndescription: ...\n---\n` YAML frontmatter
- Loaded at startup through `src/app/context.ts` into the app context

**Context compaction** (`src/agent/contextCompact.ts`):
- **Micro-compact** (per-turn, >30k estimated tokens): clears old tool results, preserving the last 8 and any `read_file` results
- **Auto-compact** (per-turn, >50k tokens): sends older messages to a summarizer model, saves full transcript to `.transcripts/`, replaces history with summary + recent messages

**Config** (`src/config.ts`): Reads env vars and initializes the Anthropic client. Stateful services are assembled in `src/app/context.ts`.

## API Provider Compatibility

Uses Anthropic SDK but supports Anthropic-compatible providers via `ANTHROPIC_BASE_URL`. See `.env.example` for MiniMax, GLM (Zhipu), Kimi (Moonshot), and DeepSeek endpoint configs. Set `MODEL_ID` accordingly.

## Design Principles (from README)

Before merging, answer: reusability across callers, lifecycle alignment (state change frequency), crosscutting vs. business logic, hot path vs. cold path, and whether choices are falsifiable (not "I prefer").
