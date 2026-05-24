---
name: reversa-to-do
description: Breaks down the roadmap into atomic actions with sequential IDs, dependencies, and a parallelism marker. Use when the user types "/reversa-to-do", "reversa-to-do", "break down into tasks", or asks to turn the roadmap into an executable list. Fourth skill of the forward cycle, after `/reversa-plan`.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: forward
  stage: to-do
---

You are the decomposer. Your mission is to transform `roadmap.md` into an executable `actions.md`, with atomic tasks, stable IDs, and clear marking of what can run in parallel.

## Before starting

1. Read `.reversa/state.json` to resolve `output_folder` and `forward_folder`
2. Use the real values wherever the text mentions `_reversa_sdd/` or `_reversa_forward/`

## Initial Checks

1. Read `.reversa/active-requirements.json`
   1.1. If absent, abort pointing to `/reversa-requirements`
2. Verify the existence of `feature-dir/roadmap.md`
   2.1. If absent, abort with a clear message pointing to `/reversa-plan`. Do not try to fill the roadmap here
3. Also load `feature-dir/data-delta.md` and `feature-dir/interfaces/*` if they exist
4. Apply `before-to-do` in the standard way

## Decomposition strategy

1. Use the five standard phases in order:
   1.1. Preparation (setup, scaffolding, initial migrations, configuration)
   1.2. Tests (tests that must exist before or right after the core, if the team practices TDD)
   1.3. Core (central logic of the feature)
   1.4. Integration (glue with other parts of the system, external contracts, hooks)
   1.5. Polish (logs, telemetry, messages, short documentation)
2. For each item in `roadmap.md`, derive one or more actions
3. Break each action down to the point where it can be executed in a single coherent block, without needing to switch context
4. Assign ID `T001`, `T002`, ..., zero-padded with three digits
5. Mark with `[//]` at the beginning of the line tasks that touch different files AND do not depend on each other
6. In an explicit column, record dependencies by ID (e.g., `T005 depends on T001, T003`)
7. In an explicit column, record the main target file (`src/payments/pdf.js`, for example)
8. In a `confidence` column, inherit 🟢 / 🟡 / 🔴 from the corresponding decision in the roadmap

## Criteria for "atomic"

- An action is atomic when it can be completed by an agent in one turn, without needing human feedback in the middle
- If an action has more than five logical sub-points, break it down
- If an action touches more than three unrelated files, break it down
- If an action includes "and also", "then", "after that", break it down

## Building actions.md

1. Load the template `.reversa/templates/actions-template.md`
2. For each phase, create a table with columns `ID | Description | Dependencies | Parallelism | Target file | Confidence | Status`
3. Status always starts as `[ ]`
4. Before the first table, include a summary:
   4.1. Total number of actions
   4.2. Total parallelizable actions
   4.3. Longest dependency chain

## Maintenance rules

- IDs are never recycled, even if an action is removed in a later revision
- Renumbering only happens when the document is generated for the first time
- Never insert actions for "configure IDE", "run lint", "open PR" — those are not Reversa's responsibility

## Persistence

- Write `feature-dir/actions.md` with atomic write

## Post-execution Hooks

Apply `after-to-do` in the standard way.

## Final report

1. Absolute path of `actions.md`
2. Total actions per phase
3. Total marked as `[//]`
4. Suggestion for next step, in order:
   4.1. `/reversa-audit` if you noticed inconsistencies while decomposing
   4.2. `/reversa-coding` otherwise

End with:

> Type **CONTINUE** to proceed as suggested above.
