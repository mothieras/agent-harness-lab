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

**Entry point:** `src/main.ts` → `src/cli/index.ts` readline loop → `src/agent/loop.ts`

**Core loop** (`src/agent/loop.ts`):
1. Sends messages to the model with tools
2. If stop_reason is `tool_use`, executes each tool via `ToolRuntime.invokeTool()` — all tools including orchestration tools (task, spawn_teammate) are dispatched uniformly; no if-else interception in the loop
3. If stop_reason is anything else, triggers `Stop` hook (which can force continuation), then returns
4. Enforces max_turns and timeout via `agent/deadline.ts`
5. Six hook trigger points: LoopStart, UserPromptSubmit, PreToolUse, PostToolUse, ToolResultsReady, Stop
6. Subagents use the same `agentLoop()` with restricted tools and fewer turns; orchestration tools are registered at startup via `registerTool()`
7. Teammates also reuse `agentLoop()` — inbox polling and notification injection are handled by `UserPromptSubmit` hook in `runtimeHooks.ts`

**Hooks** (`src/hooks/index.ts`):
- Process-local hook bus: `register(event, callback)` + `trigger(event, ...args)` for 6 events
- Callbacks return `null` to continue, `string` to block (PreToolUse) or force continuation (Stop)

**Agent runtime** (`src/agent/`):
- `loop.ts` — the main agent loop, 139 lines, no domain logic
- `deadline.ts` — timeout/deadline utilities (AgentLoopTimeoutError, awaitWithDeadline, throwIfDeadlineExpired)
- `options.ts` — AgentLoopOptions (4 fields: maxTurns, timeoutMs, allowedTools, system) + normalizeAgentLoopOptions()
- `subagent.ts` — constrained agentLoop runner for the `task` tool
- `response.ts` — `describeFinalResponse()` for formatting agent output
- `contextCompact.ts` — micro-compact (per-turn result compression, >30k tokens) + auto-compact (LLM summarization, >50k tokens)

**App wiring** (`src/app/`):
- `context.ts` — AppContext (DI container): SkillLoader, MemoryManager, ToolRuntime, TeammateManager
- `orchestrationTools.ts` — registers `task` and `spawn_teammate` as dynamic tools via `toolRuntime.registerTool()`; launches teammate loops
- `runtimeHooks.ts` — registers all business hooks: task status injection, background/teammate notification injection, task reminder state machine (per-agent via AsyncLocalStorage)

**Tools** (`src/tools/`):
- `toolDefinitions.ts` — Anthropic tool schemas (what the model sees); `allowedTools` filters per agent role
- `toolRuntime.ts` — thin dispatcher/runtime state holder with `registerTool()` for dynamic tool registration
- `toolHandlers.ts` — built-in tool implementations grouped by concern: file, skill, task, background, team, memory
- `input.ts` — shared tool input validation helpers (`requireString`, `requireInteger`, optional parsers)
- `agentIdentity.ts` — AsyncLocalStorage identity context for lead/subagent/teammate execution
- File tools (`bash`, `read_file`, `write_file`, `edit_file`) route through `safePath.ts` which resolves symlinks and enforces workspace containment
- `taskManager.ts` — JSON-file task persistence in `.tasks/` with status transitions (pending→in_progress→completed) and blocking dependencies
- `backgroundManager.ts` — fire-and-forget shell commands with notification queue

**Agent Teams** (`src/team/`):
- `teammateManager.ts` — spawn/fire-and-forget teammate lifecycle (working→idle→shutdown), in-memory inbox Map per teammate, notification queue
- `types.ts` — TeamMember, TeamMessage; 5 message types (message/broadcast/shutdown_request/shutdown_response/plan_approval_response)

**Skills** (`src/skills/skillLoader.ts`):
- Two-layer injection: `getDescriptions()` returns a short list for the system prompt; `getContent(name)` returns the full SKILL.md body on tool call
- Directory convention: `skills/<name>/SKILL.md` with YAML frontmatter

**Memory** (`src/memory/`):
- `memoryManager.ts` — cross-session persistent memory (`.memory/*.md`) with index injection, dual write paths (tool + background extraction), and session-exit consolidation
- `types.ts` — MemoryType, MemoryEntry

**Config** (`src/config.ts`): Reads env vars, initializes Anthropic client, assembles system prompt via `buildSystem()`

## API Provider Compatibility

Uses Anthropic SDK but supports Anthropic-compatible providers via `ANTHROPIC_BASE_URL`. See `.env.example` for MiniMax, GLM (Zhipu), Kimi (Moonshot), and DeepSeek endpoint configs. Set `MODEL_ID` accordingly.

## Design Principles (from README)

Before merging, answer: reusability across callers, lifecycle alignment (state change frequency), crosscutting vs. business logic, hot path vs. cold path, and whether choices are falsifiable (not "I prefer").
