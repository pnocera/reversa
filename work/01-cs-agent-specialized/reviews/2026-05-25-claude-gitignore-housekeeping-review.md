# Claude Review - Gitignore housekeeping review

## Verdict

GO_STATUS: GO

## Findings

- [low] .gitignore:9 - `specs/` rule appears dead: the directory does not exist anywhere in the worktree and no tracked file would land there based on current code. Harmless, but it has been carried forward without a referent. Confirm whether a planned `specs/` workflow still exists; if not, remove the line to keep the file honest.
- [low] .gitignore (root) - `.codegraph/` is not addressed at the root, yet the directory is present and untracked (`?? .codegraph/`). The nested `.codegraph/.gitignore` correctly screens the SQLite database (`*.db`, `*.db-wal`, `*.db-shm`, `cache/`, `.dirty`), so only `.codegraph/config.json` and the nested ignore file would be added if someone runs `git add .codegraph/`. This is a valid pattern (commit a bootstrap, ignore local data), but the intent is not codified. Decide explicitly: either (a) commit `.codegraph/.gitignore` + `.codegraph/config.json` as a shared bootstrap and leave the root ignore alone, or (b) add `.codegraph/` to the root `.gitignore` so the per-machine index never leaks. Today a future contributor could `git add .codegraph` by accident and would not know which outcome was wanted.

## Required Fixes

- None

## Verification Notes

- Added rules behave as intended:
  - `.codex/` — directory exists locally (`reviewr/`, `skills/`); `git check-ignore -v .codex/` resolves to `.gitignore:10:.codex/`. Correctly ignored, no tracked files under `.codex/` would be affected (`git ls-files` shows none).
  - `work/**/*.git-context.md` — matches `work/01-cs-agent-specialized/reviews/2026-05-25-claude-gitignore-housekeeping-review.git-context.md` (the auto-generated context file for this very review). No `*.git-context.md` files are tracked anywhere (`git ls-files | rg git-context.md` empty), so this rule is purely forward-looking and does not orphan existing artifacts. The peer review markdown (`2026-05-25-claude-phase-2-implementation-review.md`) is correctly left visible as untracked.
- Pre-existing rules sanity-checked:
  - `node_modules/`, `.env`, `*.log`, `dist/`, `site/`, `.npm-cache/`, `.tmp-mkdocs-site/` are the expected JS/MkDocs build-and-secret hygiene set; no tracked files conflict (`git ls-files` filter returns nothing).
  - `.claude/` — directory not present in the worktree currently; rule is anticipatory but standard practice for projects that may grow a local Claude config. No action needed.
- Nested `.codegraph/.gitignore` reviewed and is internally consistent (covers `*.db`, `*.db-wal`, `*.db-shm`, `cache/`, `*.log`, `.dirty`). The current large SQLite WAL (`codegraph.db-wal`, ~4 MB) would not be staged accidentally.
- The diff is unstaged; the recommended next step is `git add .gitignore` and commit the two-line addition independently of the rest of the dirty tree.
