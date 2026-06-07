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

**Entry point:** `src/main.ts` → `src/cli/index.ts` readline loop → `src/app/context.ts` app assembly → `src/agent/loop.ts`

**Core loop** (`src/agent/loop.ts`):
1. Sends messages to the model with tools
2. If stop_reason is `tool_use`, executes each tool via `ToolRuntime.invokeTool()` and feeds results back as user messages
3. The default orchestration-level tool (`subagent`) is registered dynamically in `src/app/orchestrationTools.ts`
4. If stop_reason is anything else, triggers the `Stop` hook, then returns the final response
5. Enforces max_turns and timeout via `src/agent/deadline.ts`
6. Runtime injections (task status, background results, inbox messages, reminders) live in `src/app/runtimeHooks.ts`
7. Subagents reuse `agentLoop()` with restricted toolsets and role/name-specific system prompts; teammate async actors are deferred and not registered by default
8. `allowedTools` is resolved through centralized tool profiles and fails fast on unknown tool names

**Tools** (`src/tools/`):
- `toolTypes.ts` — shared tool contracts: `RegisteredTool`, `ToolDefinition`, provider diagnostics, and source metadata
- `toolRegistry.ts` — registry and single runtime source of truth for tool definitions, handlers, and provider diagnostics
- `builtin/provider.ts` — app-startup loader that returns builtin `RegisteredTool[]`
- `builtin/` — per-tool builtin factories and file-tool implementations; each tool owns its `definition` and `handler`, while group indexes only aggregate them
- `mcp/` — MCP-0 provider boundary: minimal `McpClient`, mock client, schema conversion, handler creation, result normalization, and diagnostics
- `toolRuntime.ts` — runtime state holder for task/background managers; invokes tools by looking handlers up in `ToolRegistry`
- `toolProfiles.ts` — centralized allowed tool sets for subagent and deferred teammate loops plus profile validation and fail-fast tool-definition selection
- `input.ts` — shared tool input validation helpers (`requireString`, `requireInteger`, optional parsers)
- `agentIdentity.ts` — AsyncLocalStorage identity context used by lead, subagents, and teammates
- File tools (`bash`, `read_file`, `write_file`, `edit_file`) route through `builtin/file/safePath.ts` which resolves symlinks and enforces workspace containment
- `taskManager.ts` — JSON-file task persistence in `.tasks/` with status transitions (pending→in_progress→completed) and blocking dependencies
- `backgroundManager.ts` — fire-and-forget shell commands with notification queue, consumed by runtime hooks as `<background-results>`
- `src/agent/subagent.ts` — constrained `agentLoop` runner, wrapped by `src/agent/subAgentRunner.ts` (async fire-and-forget, identity-isolated, never-rejecting) behind the `subagent`/`check_subagent` orchestration tools

**Agent Teams** (`src/team/`):
- `teammateManager.ts` — spawn/fire-and-forget teammate lifecycle (working→idle→shutdown), in-memory inbox Map per teammate, notification queue for `<teammate-updates>` injection
- `types.ts` — TeamMember, TeamMessage; 5 message types declared (message/broadcast/shutdown_request/shutdown_response/plan_approval_response)
- Teammate async actor execution is deferred; current teammate code is retained as manager/inbox primitives, not a default orchestration path

**Skills** (`src/skills/skillLoader.ts`):
- Two-layer injection: `getDescriptions()` returns a short list for the system prompt; `getContent(name)` returns the full SKILL.md body on tool call
- Directory convention: `skills/<name>/SKILL.md` with `---\ndescription: ...\n---\n` YAML frontmatter
- Loaded at startup through `src/app/context.ts` into the app context

**Context compaction** (`src/agent/contextCompact.ts`):
- **Micro-compact** (per-turn, >30k estimated tokens): clears old tool results, preserving the last 8 and any `read_file` results
- **Auto-compact** (per-turn, >50k tokens): sends older messages to a summarizer model, saves full transcript to `.transcripts/`, replaces history with summary + recent messages

**Config** (`src/config.ts`): Reads env vars and initializes the Anthropic client. Stateful services and the tool registry are assembled in `src/app/context.ts`.

## API Provider Compatibility

Uses Anthropic SDK but supports Anthropic-compatible providers via `ANTHROPIC_BASE_URL`. See `.env.example` for MiniMax, GLM (Zhipu), Kimi (Moonshot), and DeepSeek endpoint configs. Set `MODEL_ID` accordingly.

## Design Principles (from README)

Before merging, answer: reusability across callers, lifecycle alignment (state change frequency), crosscutting vs. business logic, hot path vs. cold path, and whether choices are falsifiable (not "I prefer").
