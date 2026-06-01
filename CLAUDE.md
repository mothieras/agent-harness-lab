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

**Entry point:** `src/main.ts` → `src/cli/index.ts` readline loop → `src/app/context.ts` app assembly → `src/agent/loop.ts`

**Core loop** (`src/agent/loop.ts`):
1. Sends messages to the model with tools
2. Captures model responses/errors as an `LLMOutcome`, asks `decideRecovery()` for a `RecoveryAction`, then applies that action in the loop
3. If stop_reason is `tool_use`, executes each tool via `ToolRuntime.invokeTool()` — all tools including orchestration tools (`subagent`, `teammate`) are dispatched uniformly; no if-else interception in the loop
4. If stop_reason is anything else, triggers `Stop` hook (which can force continuation), then returns
5. Enforces max_turns and timeout via `agent/deadline.ts`; recovery retries do not consume max_turns
6. Six hook trigger points: LoopStart, UserPromptSubmit, PreToolUse, PostToolUse, ToolResultsReady, Stop
7. Subagents use the same `agentLoop()` with restricted tools and fewer turns; orchestration tools are registered at startup as complete `RegisteredTool` entries
8. Teammates also reuse `agentLoop()` — inbox polling and notification injection are handled by `UserPromptSubmit` hook in `runtimeHooks.ts`
9. `allowedTools` is resolved through centralized tool profiles and fails fast on unknown tool names

**Hooks** (`src/hooks/index.ts`):
- Process-local hook bus: `register(event, callback)` + `trigger(event, ...args)` for 6 events
- Callbacks return `null` to continue, `string` to block (PreToolUse) or force continuation (Stop)

**Agent runtime** (`src/agent/`):
- `loop.ts` — the main agent loop, ~290 lines; LLM call wrapped in outcome capture → `decideRecovery()` → switch on recovery action; tool errors caught per-invocation
- `errorRecovery.ts` — pure decision function maps `(outcome, state, options)` to `RecoveryAction` union; handles output truncation, context overflow, rate limits, overloads, transient network failures, and fallback-model switching after repeated 529s
- `deadline.ts` — timeout/deadline utilities (AgentLoopTimeoutError, awaitWithDeadline, throwIfDeadlineExpired)
- `options.ts` — AgentLoopOptions + normalizeAgentLoopOptions(); `AgentLoopStopReason` includes `"error"` for unrecoverable failures
- `subagent.ts` — constrained agentLoop runner for the `subagent` tool; inherits error recovery for free
- `response.ts` — `describeFinalResponse()` for formatting agent output
- `contextCompact.ts` — micro-compact (per-turn result compression, >30k tokens), auto-compact (LLM summarization, >50k tokens), forceCompact (manual/recovery trigger with reason label)

**App wiring** (`src/app/`):
- `context.ts` — AppContext (DI container): SkillLoader, MemoryManager, ToolRegistry, ToolRuntime, TeammateManager; loads builtin tools, accepts preloaded provider results, and validates tool profiles at startup
- `orchestrationTools.ts` — registers `subagent` and `teammate` as complete `RegisteredTool` entries via `toolRuntime.registerTool()`; launches teammate loops
- `runtimeHooks.ts` — registers all business hooks: task status injection, background/teammate notification injection, task reminder state machine (per-agent via AsyncLocalStorage)

**Tools** (`src/tools/`):
- `toolTypes.ts` — shared tool contracts: `RegisteredTool`, `ToolDefinition`, provider diagnostics, and source metadata
- `toolRegistry.ts` — single runtime source of truth for tool definitions, handlers, and provider diagnostics
- `builtin/provider.ts` — app-startup loader that returns builtin `RegisteredTool[]`
- `builtin/` — per-tool builtin factories and file-tool implementations; each tool owns its `definition` and `handler`, while group indexes only aggregate them
- `mcp/` — MCP-0 provider boundary: minimal `McpClient`, mock client, schema conversion, handler creation, result normalization, and diagnostics
- `toolRuntime.ts` — runtime state holder for task/background managers; invokes tools by looking handlers up in `ToolRegistry`
- `toolProfiles.ts` — centralized allowed tool sets for subagent/teammate loops plus profile validation and fail-fast tool-definition selection
- `input.ts` — shared tool input validation helpers (`requireString`, `requireInteger`, optional parsers)
- `agentIdentity.ts` — AsyncLocalStorage identity context for lead/subagent/teammate execution
- File tools (`bash`, `read_file`, `write_file`, `edit_file`) route through `builtin/file/safePath.ts` which resolves symlinks and enforces workspace containment
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

**Config** (`src/config.ts`): Reads env vars, initializes Anthropic client, exports `MODEL`, `client`, and `getFallbackModel()` for error recovery fallback switching

## API Provider Compatibility

Uses Anthropic SDK but supports Anthropic-compatible providers via `ANTHROPIC_BASE_URL`. See `.env.example` for MiniMax, GLM (Zhipu), Kimi (Moonshot), and DeepSeek endpoint configs. Set `MODEL_ID` accordingly.

## Design Principles (from README)

Before merging, answer: reusability across callers, lifecycle alignment (state change frequency), crosscutting vs. business logic, hot path vs. cold path, and whether choices are falsifiable (not "I prefer").
