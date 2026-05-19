# Presence Independent Project Design

## Status

Approved direction: split Presence out of `my-claude-code` into an independent project at `/Users/luncer/Documents/presence`.

This design covers migration boundaries only. It does not add model calls, push delivery, scheduled execution, or expanded sensing.

## Context

Presence currently exists as a small incubation module inside `my-claude-code`:

- `presence/design.md` describes the Presence Loop goal.
- `presence/control.md` describes the current `tick` and `inspect` closed loop.
- `presence/soul.md` defines the digital-life identity layer.
- `src/presence/` contains deterministic TypeScript code for `tick`, `inspect`, senses, journal, salience, and state.
- `package.json` exposes `presence:tick` and `presence:inspect`.

This is becoming conceptually separate from `my-claude-code`, whose purpose is a learning harness for coding-agent loops. Presence should become its own project because its product goal is a digital life runtime: one that can be spoken to directly and can also wake, sense, remember, judge, and decide whether to speak.

## Goal

Create a physically independent Presence project with a clean boundary:

- It can run without depending on `my-claude-code`.
- Its documents, soul, runtime code, and local data have distinct locations.
- Existing deterministic behavior remains intact.
- No model layer is introduced during the split.

## Non-Goals

- Do not add model calls.
- Do not add push notifications or messaging integrations.
- Do not add a scheduler, daemon, cron, or launchd job.
- Do not expand sensing beyond current git and intent-card inputs.
- Do not implement chat yet.
- Do not retain duplicate Presence runtime code in `my-claude-code`.

## Target Location

```text
/Users/luncer/Documents/presence
```

## Target Structure

```text
/Users/luncer/Documents/presence
  package.json
  tsconfig.json
  README.md
  .gitignore

  docs/
    design.md
    control.md

  soul/
    soul.md

  src/
    heartbeat.ts
    inspect.ts
    journal.ts
    paths.ts
    state.ts
    salience.ts
    types.ts
    senses/
      gitSense.ts
      intentSense.ts

  data/
    state.json
    intents/
    journal/
    outbox/
```

The directory split is semantic:

- `docs/`: mechanism, control surface, and design notes.
- `soul/`: stable identity and behavior principles.
- `src/`: executable runtime.
- `data/`: local running state and lived traces.

## Commands

Because the new project is already Presence, command names should be short:

```bash
pnpm inspect
pnpm tick
pnpm build
```

`pnpm inspect` remains read-only:

- reads `data/state.json`
- reads `data/intents/*.json`
- reads latest journal/outbox metadata
- reads git status for the Presence project
- writes nothing

`pnpm tick` advances the deterministic loop:

- reads state, intents, and git status
- evaluates salience by rules
- writes journal
- writes outbox when salience rules require it
- updates state

## Data Policy

Local runtime data should not be committed by default:

- `data/state.json`
- `data/intents/*.json`
- `data/journal/*.md`
- `data/outbox/*.json`

Directory placeholders may be committed so the runtime shape is visible.

Docs, soul files, source files, package metadata, and examples are normal project assets and may be committed.

## Migration Plan

1. Create `/Users/luncer/Documents/presence` with package metadata and TypeScript config.
2. Move current `presence/design.md` and `presence/control.md` to `docs/`.
3. Move current `presence/soul.md` to `soul/soul.md`.
4. Move `src/presence/*` to new `src/`, renaming `presenceState.ts` to `state.ts`.
5. Move runtime data shape from `presence/` to `data/`.
6. Update paths so runtime data is resolved from the new project root as `data/`.
7. Add `pnpm tick` and `pnpm inspect`.
8. Remove old Presence scripts and source files from `my-claude-code`.
9. Verify deterministic behavior in the new project.

## Verification

The split is complete when:

- `/Users/luncer/Documents/presence` builds with `pnpm build`.
- `pnpm inspect` runs and writes no files.
- `pnpm tick` writes journal and state under `data/`.
- A due intent generates one outbox entry.
- Re-running `pnpm tick` does not duplicate the same handled intent.
- `my-claude-code` no longer contains Presence source code or Presence scripts.
- Runtime data is ignored by git while docs, soul, and source remain visible.

## Future Work After Split

After the independent project is stable, the next design should decide how to add the model mind layer:

```text
facts + soul + recent journal -> journal draft + outbox draft or silence
```

The model layer should not own permissions, file access, state mutation, or delivery. Rules continue to provide sensing, boundaries, policy gates, and persistence.
