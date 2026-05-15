---
name: code-review
description: Systematic checklist for reviewing code diffs and pull requests.
---

# Code Review Workflow

## Step 1: Read the diff first

```bash
git diff main...HEAD              # PR-style: changes on this branch
git diff <commit>                 # since a specific commit
git log --oneline main..HEAD      # commit narrative
```

Never review a single file in isolation — context matters.

## Step 2: Map the surface area

For each touched file, identify:
- Public exports / API changes (breaking?)
- Tests added or updated
- Config / schema changes (migration needed?)

## Step 3: Quality checklist

- [ ] **Tests**: New behavior has at least one test. Bug fixes include a regression test.
- [ ] **Error paths**: Failure modes are handled, not just the happy path.
- [ ] **Input validation**: Untrusted inputs are validated at the boundary.
- [ ] **Naming**: Symbols read clearly without needing the diff for context.
- [ ] **Comments**: Explain *why*, not *what*. No commented-out code.
- [ ] **Coupling**: Change doesn't leak through unrelated modules.
- [ ] **Performance**: No obvious O(n²) where O(n) suffices on hot paths.

## Step 4: Verify before approving

```bash
pnpm install && pnpm build && pnpm test
```

Reading code is not enough — run it.

## Output format

Reply with:
1. One-sentence summary of what the diff does.
2. Numbered list of concrete issues, each with `file:line` references.
3. Severity tag per issue: 🔴 blocker / 🟡 should-fix / 🟢 nit.
