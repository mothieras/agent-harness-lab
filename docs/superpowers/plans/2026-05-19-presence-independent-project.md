# Presence Independent Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Presence from `my-claude-code` into `/Users/luncer/Documents/presence` as an independent TypeScript project while preserving deterministic `tick` and `inspect` behavior.

**Architecture:** The new project separates stable documents (`docs/`), identity (`soul/`), executable TypeScript runtime (`src/`), and local runtime data (`data/`). Runtime paths resolve from the new project root to `data/`; no model, scheduler, push delivery, or expanded sensing is added in this migration.

**Tech Stack:** Node.js ESM, TypeScript `NodeNext`, `tsx`, `pnpm`, built-in `node:test` for deterministic regression coverage.

---

## File Structure

Create and maintain these files in `/Users/luncer/Documents/presence`:

- `package.json`: independent package metadata and scripts.
- `tsconfig.json`: strict TypeScript build config.
- `.gitignore`: ignores dependencies, build output, and local runtime data.
- `README.md`: project purpose and command quickstart.
- `docs/design.md`: migrated mechanism design.
- `docs/control.md`: migrated command/read-write boundary.
- `soul/soul.md`: migrated Presence identity layer.
- `src/paths.ts`: resolves `data/` paths from the project root.
- `src/state.ts`: reads/writes Presence state and ensures runtime directories.
- `src/types.ts`: shared runtime types.
- `src/senses/gitSense.ts`: reads git status and latest commit.
- `src/senses/intentSense.ts`: reads intent cards.
- `src/salience.ts`: deterministic rule decision.
- `src/journal.ts`: writes journal and outbox files.
- `src/heartbeat.ts`: `pnpm tick` entrypoint.
- `src/inspect.ts`: `pnpm inspect` entrypoint.
- `src/presenceTest.ts`: deterministic regression test harness.
- `data/intents/.gitkeep`, `data/journal/.gitkeep`, `data/outbox/.gitkeep`: visible runtime shape.

Remove these host-project files after the new project passes verification:

- `/Users/luncer/Documents/my-claude-code/src/presence/**`
- `/Users/luncer/Documents/my-claude-code/presence/**`
- `presence:tick` and `presence:inspect` scripts from `/Users/luncer/Documents/my-claude-code/package.json`
- Presence runtime-data ignore rules from `/Users/luncer/Documents/my-claude-code/.gitignore`

### Task 1: Scaffold Independent Project

**Files:**
- Create: `/Users/luncer/Documents/presence/package.json`
- Create: `/Users/luncer/Documents/presence/tsconfig.json`
- Create: `/Users/luncer/Documents/presence/.gitignore`
- Create: `/Users/luncer/Documents/presence/README.md`
- Create: `/Users/luncer/Documents/presence/data/intents/.gitkeep`
- Create: `/Users/luncer/Documents/presence/data/journal/.gitkeep`
- Create: `/Users/luncer/Documents/presence/data/outbox/.gitkeep`

- [ ] **Step 1: Create project directories**

Run:

```bash
mkdir -p /Users/luncer/Documents/presence/{src/senses,docs,soul,data/intents,data/journal,data/outbox}
```

Expected: command exits `0`.

- [ ] **Step 2: Create `package.json`**

Write this exact file:

```json
{
  "name": "presence",
  "version": "0.1.0",
  "description": "A minimal Presence Loop runtime for a digital life prototype.",
  "main": "dist/heartbeat.js",
  "type": "module",
  "scripts": {
    "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
    "build": "pnpm clean && tsc",
    "tick": "tsx src/heartbeat.ts",
    "inspect": "tsx src/inspect.ts",
    "test": "pnpm build && node --test dist/presenceTest.js"
  },
  "keywords": [
    "presence",
    "digital-life",
    "agent-runtime"
  ],
  "author": "",
  "license": "UNLICENSED",
  "packageManager": "pnpm@11.0.9",
  "devDependencies": {
    "@types/node": "^25.6.0",
    "tsx": "^4.21.0",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

Write this exact file:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "esnext",
    "types": ["node"],
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `.gitignore`**

Write this exact file:

```gitignore
node_modules/
dist/
*.log
.DS_Store
data/state.json
data/intents/*.json
data/journal/*.md
data/outbox/*.json
```

- [ ] **Step 5: Create README**

Write this exact file:

```markdown
# Presence

Presence is a minimal digital-life runtime. It can wake, sense a small authorized slice of the local world, write journal entries, and prepare outbox messages for manual review.

Current scope:

- deterministic `tick`
- read-only `inspect`
- git and intent-card senses
- journal/state/outbox persistence
- no model calls
- no scheduler
- no push delivery

## Commands

```bash
pnpm install
pnpm build
pnpm inspect
pnpm tick
pnpm test
```

## Layout

- `docs/`: mechanism and control notes
- `soul/`: stable identity layer
- `src/`: runtime code
- `data/`: local state, intents, journal, and outbox
```

- [ ] **Step 6: Add runtime directory placeholders**

Run:

```bash
touch /Users/luncer/Documents/presence/data/intents/.gitkeep /Users/luncer/Documents/presence/data/journal/.gitkeep /Users/luncer/Documents/presence/data/outbox/.gitkeep
```

Expected: command exits `0`.

### Task 2: Migrate Docs, Soul, and Runtime Code

**Files:**
- Create: `/Users/luncer/Documents/presence/docs/design.md`
- Create: `/Users/luncer/Documents/presence/docs/control.md`
- Create: `/Users/luncer/Documents/presence/soul/soul.md`
- Create: `/Users/luncer/Documents/presence/src/**`
- Modify: imports after moving `presenceState.ts` to `state.ts`

- [ ] **Step 1: Copy docs and soul**

Run:

```bash
cp /Users/luncer/Documents/my-claude-code/presence/design.md /Users/luncer/Documents/presence/docs/design.md
cp /Users/luncer/Documents/my-claude-code/presence/control.md /Users/luncer/Documents/presence/docs/control.md
cp /Users/luncer/Documents/my-claude-code/presence/soul.md /Users/luncer/Documents/presence/soul/soul.md
```

Expected: all three files exist in the new project.

- [ ] **Step 2: Copy runtime source files**

Run:

```bash
cp /Users/luncer/Documents/my-claude-code/src/presence/heartbeat.ts /Users/luncer/Documents/presence/src/heartbeat.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/inspect.ts /Users/luncer/Documents/presence/src/inspect.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/journal.ts /Users/luncer/Documents/presence/src/journal.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/paths.ts /Users/luncer/Documents/presence/src/paths.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/presenceState.ts /Users/luncer/Documents/presence/src/state.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/salience.ts /Users/luncer/Documents/presence/src/salience.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/types.ts /Users/luncer/Documents/presence/src/types.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/senses/gitSense.ts /Users/luncer/Documents/presence/src/senses/gitSense.ts
cp /Users/luncer/Documents/my-claude-code/src/presence/senses/intentSense.ts /Users/luncer/Documents/presence/src/senses/intentSense.ts
```

Expected: source files exist under `/Users/luncer/Documents/presence/src`.

- [ ] **Step 3: Update imports from `presenceState.js` to `state.js`**

In `/Users/luncer/Documents/presence/src/heartbeat.ts`, replace:

```ts
} from "./presenceState.js";
```

with:

```ts
} from "./state.js";
```

In `/Users/luncer/Documents/presence/src/inspect.ts`, replace:

```ts
import { loadPresenceState } from "./presenceState.js";
```

with:

```ts
import { loadPresenceState } from "./state.js";
```

- [ ] **Step 4: Update runtime paths to `data/`**

In `/Users/luncer/Documents/presence/src/paths.ts`, replace the file with:

```ts
import path from "node:path";

export interface PresencePaths {
  root: string;
  stateFile: string;
  intentsDir: string;
  journalDir: string;
  outboxDir: string;
}

export function getPresencePaths(projectRoot: string): PresencePaths {
  const root = path.join(projectRoot, "data");
  return {
    root,
    stateFile: path.join(root, "state.json"),
    intentsDir: path.join(root, "intents"),
    journalDir: path.join(root, "journal"),
    outboxDir: path.join(root, "outbox"),
  };
}
```

- [ ] **Step 5: Seed ignored local state**

Write `/Users/luncer/Documents/presence/data/state.json`:

```json
{
  "lastTickAt": null,
  "lastSeenCommitHash": null,
  "handledIntentIds": []
}
```

Expected: file exists locally and is ignored by git.

### Task 3: Add Deterministic Regression Test

**Files:**
- Create: `/Users/luncer/Documents/presence/src/presenceTest.ts`

- [ ] **Step 1: Create test file**

Write `/Users/luncer/Documents/presence/src/presenceTest.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import os from "node:os";
import path from "node:path";
import { tickPresence } from "./heartbeat.js";

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "presence-test-"));
  await fs.mkdir(path.join(root, "data", "intents"), { recursive: true });
  return root;
}

async function listOutbox(root: string): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(root, "data", "outbox"));
    return files.filter((file) => file.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

test("tick without intents writes journal and no outbox", async () => {
  const root = await makeRoot();
  await tickPresence(root);

  const journalFiles = await fs.readdir(path.join(root, "data", "journal"));
  const outboxFiles = await listOutbox(root);
  const state = JSON.parse(
    await fs.readFile(path.join(root, "data", "state.json"), "utf8"),
  ) as { lastTickAt: string | null; handledIntentIds: string[] };

  assert.equal(journalFiles.length, 1);
  assert.equal(outboxFiles.length, 0);
  assert.ok(state.lastTickAt);
  assert.deepEqual(state.handledIntentIds, []);
});

test("due intent creates one outbox entry and is not duplicated", async () => {
  const root = await makeRoot();
  await fs.writeFile(
    path.join(root, "data", "intents", "drink-water.json"),
    JSON.stringify(
      {
        id: "drink-water",
        dueAt: "2000-01-01T00:00:00Z",
        text: "早上了。喝水。",
        status: "active",
      },
      null,
      2,
    ),
  );

  await tickPresence(root);
  await tickPresence(root);

  const outboxFiles = await listOutbox(root);
  const state = JSON.parse(
    await fs.readFile(path.join(root, "data", "state.json"), "utf8"),
  ) as { handledIntentIds: string[] };

  assert.equal(outboxFiles.length, 1);
  assert.deepEqual(state.handledIntentIds, ["drink-water"]);
});
```

- [ ] **Step 2: Run test before cleanup**

Run:

```bash
cd /Users/luncer/Documents/presence
pnpm install
pnpm test
```

Expected: build passes and both node tests pass.

### Task 4: Verify New Project Commands

**Files:**
- Read: `/Users/luncer/Documents/presence/data/state.json`
- Read: `/Users/luncer/Documents/presence/data/journal/*.md`
- Read: `/Users/luncer/Documents/presence/data/outbox/*.json`

- [ ] **Step 1: Build the new project**

Run:

```bash
cd /Users/luncer/Documents/presence
pnpm build
```

Expected: TypeScript emits `dist/` with no errors.

- [ ] **Step 2: Run read-only inspect**

Run:

```bash
cd /Users/luncer/Documents/presence
pnpm inspect
```

Expected output includes:

```text
Presence Inspect
State
Senses
Intents
Journal
Outbox
Next tick
```

Expected side effect: no new journal or outbox files are created.

- [ ] **Step 3: Run tick**

Run:

```bash
cd /Users/luncer/Documents/presence
pnpm tick
```

Expected output includes:

```text
Presence tick:
Journal:
Outbox:
```

Expected side effect: `data/state.json` and one `data/journal/YYYY-MM-DD.md` file exist.

### Task 5: Clean Up Host Project

**Files:**
- Delete: `/Users/luncer/Documents/my-claude-code/src/presence/**`
- Delete: `/Users/luncer/Documents/my-claude-code/presence/**`
- Modify: `/Users/luncer/Documents/my-claude-code/package.json`
- Modify: `/Users/luncer/Documents/my-claude-code/.gitignore`

- [ ] **Step 1: Remove old Presence source and data from host**

Run:

```bash
rm -rf /Users/luncer/Documents/my-claude-code/src/presence /Users/luncer/Documents/my-claude-code/presence
```

Expected: both paths no longer exist.

- [ ] **Step 2: Remove host scripts**

In `/Users/luncer/Documents/my-claude-code/package.json`, remove these two lines:

```json
"presence:tick": "tsx src/presence/heartbeat.ts",
"presence:inspect": "tsx src/presence/inspect.ts",
```

Expected: `pnpm build` in `my-claude-code` still works.

- [ ] **Step 3: Remove host Presence ignore rules**

In `/Users/luncer/Documents/my-claude-code/.gitignore`, remove:

```gitignore
presence/state.json
presence/intents/*.json
presence/journal/*.md
presence/outbox/*.json
```

Expected: no `presence/` references remain in host `.gitignore`.

- [ ] **Step 4: Verify host project still builds**

Run:

```bash
cd /Users/luncer/Documents/my-claude-code
pnpm build
```

Expected: TypeScript build passes.

### Task 6: Git Verification and Commits

**Files:**
- Read: `/Users/luncer/Documents/presence`
- Read: `/Users/luncer/Documents/my-claude-code`

- [ ] **Step 1: Initialize git in Presence if needed**

Run:

```bash
cd /Users/luncer/Documents/presence
git rev-parse --is-inside-work-tree || git init
```

Expected: Presence is a git repository.

- [ ] **Step 2: Confirm Presence git visibility**

Run:

```bash
cd /Users/luncer/Documents/presence
git status --short --ignored data
```

Expected:

- source, docs, soul, package files are visible as untracked or tracked files
- `data/state.json`, `data/journal/*.md`, and `data/outbox/*.json` are ignored
- `.gitkeep` placeholders remain visible

- [ ] **Step 3: Commit Presence project**

Run:

```bash
cd /Users/luncer/Documents/presence
git add .gitignore README.md package.json tsconfig.json docs soul src data/intents/.gitkeep data/journal/.gitkeep data/outbox/.gitkeep
git commit -m "feat: create standalone presence runtime"
```

Expected: commit succeeds.

- [ ] **Step 4: Commit host cleanup**

Run:

```bash
cd /Users/luncer/Documents/my-claude-code
git add .gitignore package.json docs/superpowers/plans/2026-05-19-presence-independent-project.md
git add -u src/presence presence
git commit -m "refactor: split presence into standalone project"
```

Expected: host commit includes only the plan, removal of old Presence files, package script cleanup, and `.gitignore` cleanup.
