# 0007: Tool Structure and Project Layout Overhaul

## Status

Accepted (2026-06-07). Builds on [0001](0001-provider-registry-runtime.md) (provider/registry/runtime). Retires the teammate subsystem that [0005](0005-stable-subagent-orchestration.md)/[0006](0006-async-subagent-runner.md) had kept deferred.

## Context

The provider→registry→runtime model from 0001 was sound, and most tools were already single-file. But five things had drifted out of alignment:

1. **Teammate was dead code.** `subagent` (0006) fully replaced it, yet `src/team/`, the `team` tool group, the `teammate` tool profile, the `getTeammateManager` dependency, and two runtime injectors (`inbox`, `teammate-updates`) all remained, plus ~23 test references.
2. **Orchestration bypassed the pipeline.** `subagent`/`check_subagent` were hand-built in `src/app/orchestrationTools.ts` and registered directly onto `ToolRuntime`, the only tools not flowing through a provider into the registry. Registration also happened *after* context construction, reading `app.subAgentRunner` and a post-hoc `app.checkPermission` field via closure — a lazy-binding smell.
3. **File tools violated "one file per tool."** `bash`/`read`/`write`/`edit` were each split into `xTool.ts` (definition) + `runX.ts` (logic), unlike the single-file task/skill/memory tools.
4. **Dependencies were a god-bag.** Every tool factory took a 6-field `BuiltinToolDeps` even when it used one field.
5. **Naming and layout were inconsistent.** `toolRegistry.ts`/`toolRuntime.ts`/`toolTypes.ts` (redundant `tool` prefix inside `tools/`) vs `input.ts`; state services (`taskManager`, `backgroundManager`) sat flat next to the kernel; loop core lived in `src/agent/`.

## Decision

A five-step refactor, each step kept green (`tsc --noEmit` + tests) and committed separately.

- **Remove teammate** entirely (it is recoverable from git if ever needed).
- **Per-tool explicit dependencies.** Drop `BuiltinToolDeps`; each factory declares an inline object of only the services it uses. A single `BuiltinServices` object is destructured by the composition root and distributed per group. Merge each `runX.ts` into its tool file.
- **`subagent`/`check_subagent` become ordinary builtin tools** under `src/tools/subagent/`, registered through the same composition as every other tool. `src/app/orchestrationTools.ts` is deleted. `createAppContext` is reordered so the registry is **populated last** — `ToolRegistry → ToolRuntime → SubAgentRunner → load tools → registerMany` — so the runner already exists when tools are built. No lazy getter.
- **`checkPermission` is injected** into `createAppContext` (the CLI builds it before the context and passes it in); the mutable `AppContext.checkPermission` field is removed.
- **Function-grouped layout** with redundancy-free names (see target tree in [tool-system.md](../architecture/tool-system.md)). MCP is kept intact under `src/tools/mcp/`.

Locked choices made during planning:

1. **MCP kept** — it is a documented boundary (0004) with its own tests, not collateral.
2. **`app/context.ts` is pure DI assembly**; hook registration stays in the CLI.
3. **Per-tool deps**, not a shared bag.
4. **Model-facing tool names unchanged** (`update_memory`, `check_background`, …) — renaming would churn the prompt and assertions for no behavioral gain.
5. **`checkPermission` injected**, eliminating the post-hoc mutable field.

## Consequences

Good:

- Every tool — including subagent orchestration — follows one path: single-file `RegisteredTool` → group index → `builtins.ts` → registry → runtime. No special cases in the app layer.
- No lazy getters and no post-assembly mutation in startup; construction order expresses the real dependency graph.
- Each tool's dependencies are visible in its signature; no god-bag.
- Layout matches how the system is reasoned about (loop / tools-by-function / hooks), and the redundant `tool`/`Tool` prefixes are gone.

Tradeoffs:

- `builtins.ts` is a central list that must be edited when adding a tool (the deliberate inverse of self-registration — see [limitations-and-roadmap.md](../architecture/limitations-and-roadmap.md)).
- The move touched ~45 files and ~160 import sites (done mechanically via a path-rewriting script, verified by `tsc`).

## Invariants

- All builtin tools (including subagent) register through `loadBuiltinTools()` in `src/tools/builtins.ts`; nothing registers directly onto `ToolRuntime` from the app layer.
- No shared tool deps bag; each factory declares only what it needs.
- The registry is populated last in `createAppContext`, after runtime and `SubAgentRunner` exist.
- `checkPermission` flows in through `createAppContext` options; there is no mutable `AppContext.checkPermission`.
- One file per tool under `src/tools/<group>/`; group `index.ts` only aggregates.

## Tests

- All pre-existing behavior tests stay green (53 passing after removing 3 dead `TeammateManager` tests).
- The structural contract test (`tests/builtin-tool-ownership.test.ts`) was rewritten to assert the new layout: `builtins.ts` aggregates per-tool factories, the factory files live at `file/bash.ts … memory/save.ts`, and `src/tools/builtin/` no longer exists.
