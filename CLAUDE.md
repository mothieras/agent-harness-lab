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

**Entry point:** `src/main.ts` → `src/cli/index.ts` readline loop (creates the lead `Agent`) → `src/app/context.ts` app assembly → `src/loop/loop.ts` `agentLoop(agent)`

**Agent** (`src/agent.ts`): the `Agent` class bundles identity, config, services (`toolRuntime`, `hooks`, `checkPermission`), and conversation `messages` into one object. `agentLoop(agent)` reads everything off the instance and binds the running agent into `currentAgent` (an `AsyncLocalStorage`) so tools can fork their caller. Sub-agents are derived with `parent.fork(overrides)` — same class, with an explicit share (`toolRuntime`) / inherit (`workspaceRoot`, `checkPermission`) / isolate (conversation, tools, budgets, and `hooks` — a forked child is silent unless handed its own) split.

**Core loop** (`src/loop/loop.ts`):
1. Sends messages to the model with tools
2. Captures model responses/errors as an `LLMOutcome`, asks `decideRecovery()` for a `RecoveryAction`, then applies that action in the loop
3. If stop_reason is `tool_use`, executes each tool via `ToolRuntime.invokeTool()` — all tools including `subagent`/`check_subagent` are dispatched uniformly; no if-else interception in the loop
4. If stop_reason is anything else, triggers `Stop` hook (which can force continuation), then returns
5. Enforces max_turns and timeout via `loop/deadline.ts`; recovery retries do not consume max_turns
6. Six hook trigger points: LoopStart, UserPromptSubmit, PreToolUse, PostToolUse, ToolResultsReady, Stop
7. Subagents use the same `agentLoop()` with restricted tools and fewer turns; the default orchestration path is async delegation through the `subagent`/`check_subagent` builtin tools (fire-and-forget + host auto-wake, see ADR 0006)
8. `allowedTools` is resolved through centralized tool profiles and fails fast on unknown tool names

**Loop runtime** (`src/loop/`):
- `loop.ts` — the main agent loop; LLM call wrapped in outcome capture → `decideRecovery()` → switch on recovery action; tool errors caught per-invocation
- `recovery.ts` — pure decision function maps `(outcome, state, options)` to a `RecoveryAction` union; handles output truncation, context overflow, rate limits, overloads, transient network failures, and fallback-model switching after repeated 529s
- `deadline.ts` — timeout/deadline utilities (AgentLoopTimeoutError, awaitWithDeadline, throwIfDeadlineExpired)
- `options.ts` — `AgentLoopResult` / `AgentLoopStopReason` types (`"error"` covers unrecoverable failures) plus default turn/timeout constants; per-agent config now lives on the `Agent` class (`src/agent.ts`)
- `response.ts` — `describeFinalResponse()` for formatting agent output
- `compact.ts` — micro-compact (per-turn result compression, >30k tokens), auto-compact (LLM summarization, >50k tokens), forceCompact (manual/recovery trigger)
- `index.ts` — barrel for the loop's public surface

**App wiring** (`src/app/context.ts`):
- `createAppContext()` is the composition root (DI container): builds SkillLoader, MemoryManager, TaskManager, BackgroundManager; creates ToolRegistry → ToolRuntime → SubAgentRunner; loads builtin tools (passing each only the services it needs + an optional `checkPermission`); registers them; accepts preloaded provider results; validates tool profiles. The registry is populated last, so the runtime and subagent runner already exist when tools are built — no lazy getters, no post-assembly registration.
- Hook registration lives in `src/cli/index.ts` (which builds `checkPermission` before the context and passes it in) and `src/hooks/runtimeHooks.ts`, not in the context.

**Tools** (`src/tools/`):
- `types.ts` — shared tool contracts: `RegisteredTool`, `ToolDefinition`, provider diagnostics, source metadata, and the `builtinTool()` helper
- `registry.ts` — single runtime source of truth for tool definitions, handlers, and provider diagnostics
- `runtime.ts` — runtime state holder for task/background managers; invokes tools by looking handlers up in `ToolRegistry`
- `builtins.ts` — single composition root: `loadBuiltinTools(services)` returns the builtin `RegisteredTool[]` in order (file → task → background → subagent → skill → memory)
- `profiles.ts` — centralized allowed tool set for the subagent loop plus profile validation and fail-fast tool-definition selection
- `errors.ts` — tool error formatting (unsupported / unavailable / execution + generic `formatError`)
- `input.ts` — shared tool input validation helpers (`requireString`, `requireInteger`, optional parsers)
- `<group>/` — one file per tool, each exposing a `createXTool(deps)` factory that declares only the services it needs; the group `index.ts` aggregates that group:
  - `file/` — `bash`/`read`/`write`/`edit` route through `file/safePath.ts` (resolves symlinks, enforces workspace containment); `file/shellSafety.ts` blocks dangerous commands
  - `task/` — `task_create`/`task_get`/`task_update`/`task_list`; `task/taskManager.ts` is JSON-file task persistence in `.tasks/` with status transitions and blocking deps
  - `background/` — `background_run`/`check_background`; `background/backgroundManager.ts` runs fire-and-forget shell commands with a notification queue
  - `subagent/` — `subagent`/`check_subagent` builtin tools; `subagent/subAgentRunner.ts` (async, identity-isolated, never-rejecting runner; holds the live child `Agent`s) wraps `subagent/subagent.ts` (`forkSubAgent`, which forks the parent into a constrained agent)
  - `skill/` — `load_skill`; `skill/skillLoader.ts` two-layer skill injection
  - `memory/` — `update_memory`; `memory/memoryManager.ts` cross-session persistent memory in `.memory/`
- `mcp/` — MCP-0 provider boundary: minimal `McpClient`, mock client, schema conversion, handler creation, result normalization, and diagnostics

**Hooks** (`src/hooks/`):
- `hookBus.ts` — process-local typed hook bus: `register(event, callback)` + effect/control dispatch for 6 events; callbacks return `null` to continue, `string` to block (PreToolUse) or force continuation (Stop)
- `runtimeHooks.ts` — business hooks: task status injection, background/subagent notification injection, task reminder state machine (per-agent via AsyncLocalStorage)
- `messageInjection.ts` — `pushTaggedUserMessage()` helper for xml-tagged user-message injection

**Config** (`src/config.ts`): Reads env vars, initializes the Anthropic client, exports `MODEL`, `client`, and `getFallbackModel()` for error recovery fallback switching

## API Provider Compatibility

Uses Anthropic SDK but supports Anthropic-compatible providers via `ANTHROPIC_BASE_URL`. See `.env.example` for MiniMax, GLM (Zhipu), Kimi (Moonshot), and DeepSeek endpoint configs. Set `MODEL_ID` accordingly.

## Design Principles (from README)

Before merging, answer: reusability across callers, lifecycle alignment (state change frequency), crosscutting vs. business logic, hot path vs. cold path, and whether choices are falsifiable (not "I prefer").
