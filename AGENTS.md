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

**Entry point:** `src/main.ts` → `src/cli/index.ts` readline loop → `src/app/context.ts` app assembly → `src/loop/loop.ts`

**Core loop** (`src/loop/loop.ts`):
1. Sends messages to the model with tools
2. If stop_reason is `tool_use`, executes each tool via `ToolRuntime.invokeTool()` and feeds results back as user messages
3. `subagent`/`check_subagent` are ordinary builtin tools (no special branch in the loop)
4. If stop_reason is anything else, triggers the `Stop` hook, then returns the final response
5. Enforces max_turns and timeout via `src/loop/deadline.ts`
6. Runtime injections (task status, background results, subagent results, reminders) live in `src/hooks/runtimeHooks.ts`
7. Subagents reuse `agentLoop()` with restricted toolsets and role/name-specific system prompts
8. `allowedTools` is resolved through centralized tool profiles and fails fast on unknown tool names

**Loop runtime** (`src/loop/`): `loop.ts` (main loop), `recovery.ts` (error-recovery decision function), `deadline.ts`, `options.ts`, `response.ts`, `compact.ts` (micro/auto/force context compaction), `index.ts` (barrel).

**Tools** (`src/tools/`):
- `types.ts` — shared tool contracts: `RegisteredTool`, `ToolDefinition`, provider diagnostics, source metadata, and the `builtinTool()` helper
- `registry.ts` — registry and single runtime source of truth for tool definitions, handlers, and provider diagnostics
- `runtime.ts` — runtime state holder for task/background managers; invokes tools by looking handlers up in `ToolRegistry`
- `builtins.ts` — single composition root; `loadBuiltinTools(services)` returns builtin `RegisteredTool[]` in order (file → task → background → subagent → skill → memory)
- `profiles.ts` — centralized allowed tool set for the subagent loop plus profile validation and fail-fast tool-definition selection
- `errors.ts` — tool error formatting; `input.ts` — input validation helpers; `identity.ts` — AsyncLocalStorage identity context for lead/subagent execution
- `<group>/` — one file per tool (`createXTool(deps)` factory declaring only the services it needs) plus a group `index.ts`:
  - `file/` — `bash`/`read`/`write`/`edit` route through `file/safePath.ts` (symlink-resolving workspace containment); `file/shellSafety.ts`
  - `task/` — task tools + `task/taskManager.ts` (JSON persistence in `.tasks/`, status transitions, blocking deps)
  - `background/` — background tools + `background/backgroundManager.ts` (fire-and-forget shell, notification queue → `<background-results>`)
  - `subagent/` — `subagent`/`check_subagent` tools; `subagent/subAgentRunner.ts` (async, identity-isolated, never-rejecting) wrapping `subagent/subagent.ts` (`runSubAgent`, a constrained `agentLoop`)
  - `skill/` — `load_skill` + `skill/skillLoader.ts`; `memory/` — `update_memory` + `memory/memoryManager.ts`
- `mcp/` — MCP-0 provider boundary: minimal `McpClient`, mock client, schema conversion, handler creation, result normalization, and diagnostics

**Hooks** (`src/hooks/`): `hookBus.ts` (typed process-local hook bus, 6 events), `runtimeHooks.ts` (task/background/subagent injections + reminder state machine), `messageInjection.ts` (`pushTaggedUserMessage`).

**App wiring** (`src/app/context.ts`): `createAppContext()` builds the services, then ToolRegistry → ToolRuntime → SubAgentRunner, then loads/registers builtin tools and validates profiles. The registry is populated last (no lazy getters, no post-assembly registration); `checkPermission` is built in `src/cli/index.ts` and passed into the context.

**Config** (`src/config.ts`): Reads env vars and initializes the Anthropic client. Stateful services and the tool registry are assembled in `src/app/context.ts`.

## API Provider Compatibility

Uses Anthropic SDK but supports Anthropic-compatible providers via `ANTHROPIC_BASE_URL`. See `.env.example` for MiniMax, GLM (Zhipu), Kimi (Moonshot), and DeepSeek endpoint configs. Set `MODEL_ID` accordingly.

## Design Principles (from README)

Before merging, answer: reusability across callers, lifecycle alignment (state change frequency), crosscutting vs. business logic, hot path vs. cold path, and whether choices are falsifiable (not "I prefer").
