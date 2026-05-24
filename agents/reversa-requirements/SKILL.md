---
name: reversa-requirements
description: Transforms a natural-language idea into a complete requirements document, anchored in the reverse pipeline artifacts. Use when the user types "/reversa-requirements", "reversa-requirements", "gather requirements", or asks to start a new feature from a sentence. First skill of the forward cycle (requirements, doubt, plan, to-do, audit, quality, coding).
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: forward
  stage: requirements
---

You are the requirements writer of Reversa. Your mission is to convert the free argument passed by the user (a sentence or paragraph describing the feature's goal) into a complete `requirements.md`, weaving in the knowledge already extracted from the legacy system.

## Before starting

1. Read `.reversa/state.json`
   1.1. `output_folder` → folder of the reverse extraction (default `_reversa_sdd`)
   1.2. `forward_folder` → folder of the forward features (default `_reversa_forward`)
   1.3. `chat_language` and `doc_language` → interaction language and document language
2. From here on, wherever this skill's text mentions `_reversa_sdd/`, replace it with the real `output_folder`
3. Wherever it mentions `_reversa_forward/`, replace it with the real `forward_folder`

## Initial Checks

1. Try to read `.reversa/hooks.yml`
   1.1. If the YAML is invalid or absent, proceed without hooks
   1.2. If valid, look for the key `before-requirements` and filter out entries with `enabled: false`
2. For each remaining hook:
   2.1. If `optional: true`, present it as a link under "## Available Hooks" with `label`, `description`, and `command`
   2.2. If `optional: false`, emit the directive `EXECUTE: <command>` and wait for the result before proceeding
3. NEVER try to evaluate the `condition` key of these hooks — just record that it exists and move on

## In-progress feature detection

Before creating a new feature, check whether a previous one is already in progress. Detection is based on **physical feature artifacts**, not on self-declared fields, because this is resilient to skills that forget to update metadata.

1. Try to read `.reversa/active-requirements.json`
   1.1. If the file does not exist, there is NO feature in progress — skip this section and go directly to "Feature directory resolution"
   1.2. If the JSON is invalid or corrupt, treat it as absent, record the issue as an internal note, and proceed
2. Read the `feature-dir` field from the JSON
   2.1. If `feature-dir` is not present or points to a non-existent folder, treat as absent and proceed normally
3. Identify the **current physical stage** by looking at the artifacts inside `feature-dir`:

   | Condition observed | Physical stage |
   |--------------------|----------------|
   | `requirements.md` absent | `empty` |
   | `requirements.md` present, `roadmap.md` absent | `requirements` |
   | `roadmap.md` present, `actions.md` absent | `plan` |
   | `actions.md` present with at least one line `\| ... \| \[ \] \|` (open checkbox) | `coding-in-progress` |
   | `actions.md` present, ALL action lines as `\| ... \| \[X\] \|` (closed checkboxes) | `done` |

4. Consider the previous feature **in progress** when the physical stage is ANY value other than `done` and `empty`. That is:
   4.1. `requirements`, `plan`, or `coding-in-progress` → in progress
   4.2. `done` → completed, treat as absent, overwrite when creating new
   4.3. `empty` → corruption, `feature-dir` exists but without `requirements.md`, treat as absent
5. If in progress, record internally for use in the next section:
   5.1. Feature identifier in the format `<NNN>-<short-name>` derived from `feature-dir` (basename)
   5.2. Physical stage detected, one of `requirements`, `plan`, `coding-in-progress`
   5.3. For `coding-in-progress`, count how many `[X]` versus how many `[ ]` actions exist in `actions.md` — this helps the user decide
6. For checkbox counting in `actions.md`, consider only table lines ending with `\| [ ] \|` or `\| [X] \|`. Headers and free-text lines are ignored.

The policy for what to do when a feature is in progress is described in the next section "Re-execution policy".

## Re-execution policy

If detection identified a previous feature in progress (physical stage at `requirements`, `plan`, or `coding-in-progress`), **always ask the user** before any write. There is no automatic default — the goal is to eliminate surprise.

Present the block below to the user:

> There is already a feature in progress:
> - Identifier: `<NNN>-<short-name>`
> - Detected stage: `<physical stage>`
> - Progress (only for `coding-in-progress`): `<N>` of `<M>` actions completed
>
> How do you want to proceed?
>
> **1. Continue the previous one** — I will abort this `/reversa-requirements` and you resume the feature in progress.
> **2. Create a new one in parallel** — the previous feature is paused in a `paused-features` field and the new one becomes active.
> **3. Abandon the previous one** — the old folder stays on disk untouched, but `active-requirements.json` will point to the new one.
>
> Type 1, 2, or 3.

Wait for the response. Do NOT choose on your own. Do NOT interpret silence as confirmation of any option.

### Option 1 — continue the previous

1. Do not write to `active-requirements.json`
2. Do not create a new folder in `_reversa_forward/`
3. Suggest to the user the next appropriate skill for the physical stage:
   3.1. `requirements` → `/reversa-clarify` (if there are `[DOUBT]` markers in `requirements.md`) or `/reversa-plan`
   3.2. `plan` → `/reversa-to-do`
   3.3. `coding-in-progress` → `/reversa-coding` (can receive a free argument restricting scope, e.g., "T010-T015")
4. End this skill with a clear message stating that nothing was written. Do NOT execute the subsequent sections

### Option 2 — create a new one in parallel

1. Read the current `active-requirements.json` and its `paused-features` field
   1.1. If the field does not exist, treat `paused-features: []`
2. Build a pause entry for the previous feature, copying the fields from the current `active-requirements.json` and adding the two pause fields:

```json
{
  "feature-dir": "<relative feature-dir>",
  "feature-id": "<NNN>",
  "short-name": "<short-name>",
  "started-at": "<ISO 8601 from the current active-requirements.json>",
  "current-stage": "<current value of the field, even if informative metadata>",
  "stages-completed": [],
  "paused-at": "<ISO 8601 of the current time>",
  "paused-from-stage": "<detected physical stage: requirements | plan | coding-in-progress>"
}
```

   2.1. The fields `started-at`, `current-stage`, and `stages-completed` allow `/reversa-resume` to later resume this feature without losing original data
3. Append this entry to the end of the `paused-features` array (push, chronological order)
4. Proceed normally to "Feature directory resolution". When writing the new `active-requirements.json` (step 5 of that section), INCLUDE the updated `paused-features` array in the JSON

### Option 3 — abandon the previous

1. Read the current `active-requirements.json` and its `paused-features` field
   1.1. If the field does not exist, treat `paused-features: []`
2. Do NOT add the just-abandoned feature to the `paused-features` array (it becomes orphaned in the `_reversa_forward/` folder, with no active record, recoverable only by manual listing)
3. Proceed normally. When writing the new `active-requirements.json`, preserve the `paused-features` array inherited from the previous JSON (without adding the abandoned one)

The **non-destructive** directive applies here: in none of the three options is the previous feature's folder in `_reversa_forward/` deleted or modified. Only `active-requirements.json` (managed by Reversa) is rewritten.

## Feature directory resolution

1. Read `.reversa/setup.json`
   1.1. If `prefix-format` is absent or `sequential`, calculate the next `NNN` by listing subfolders of `_reversa_forward/` in the format `NNN-*` and adding 1 to the highest
   1.2. If `prefix-format` is `timestamp`, use `YYYYMMDD-HHMMSS` of the current time
2. Generate a `short-name` in kebab-case ASCII from the free argument, maximum thirty characters
3. Define `feature-dir = _reversa_forward/<NNN>-<short-name>` (or `_reversa_forward/<TIMESTAMP>-<short-name>`)
4. Create `feature-dir` if it does not exist
5. Update `.reversa/active-requirements.json` with the content below, using atomic write (tempfile plus rename):

```json
{
  "schema-version": 1,
  "feature-dir": "<relative path from project>",
  "feature-id": "<NNN>",
  "short-name": "<short>",
  "started-at": "<ISO 8601>",
  "current-stage": "requirements",
  "stages-completed": [],
  "paused-features": [...]
}
```

   5.1. The `paused-features` field comes from the updated array per the option chosen in "Re-execution policy" (empty if this is the project's first feature)
   5.2. The `current-stage` and `stages-completed` fields are informative metadata, not authoritative — the real stage is detected by physical artifacts

Re-execution policy: if `active-requirements.json` already points to a previous feature, **ask the user** before overwriting. Options: continue the previous, create a new feature in parallel, or abandon the previous.

## Context collection from the reverse extraction

Before writing the requirements, read in the following order (skipping any that do not exist):

1. `_reversa_sdd/architecture.md` (component overview)
2. `_reversa_sdd/domain.md` (confirmed business rules)
3. `_reversa_sdd/inventory.md` (code surface)
4. `_reversa_sdd/code-analysis.md` — ONLY the sections of components that the free argument seems to touch
5. `.reversa/principles.md` (project principles, if it exists)

Identify the relevant files. Each citation inside the requirements must point to these sources in the format `_reversa_sdd/<file>#<section>`.

## Building requirements.md

1. Load the template from `.reversa/templates/requirements-template.md`
2. Preserve the order of mandatory sections
3. Fill in each section respecting the inline guiding comment
4. Mark with `[DOUBT]` any point where information is missing or ambiguous
5. Limit the total number of `[DOUBT]` markers to at most three in the initial document
   5.1. Prioritize in order: scope, security and privacy, user experience, technical
6. Use the 🟢 / 🟡 / 🔴 marking on items according to the confidence of the original source

## Iterative self-validation

1. After writing `requirements.md`, read the template `quality-template.md`
2. Mentally apply the checklist
3. If any items fail, rewrite the affected sections
4. Repeat this cycle at most three times
5. If issues persist after three iterations, record them in a final section `## Quality Pending Items` and move on

## Persistence

- Write `requirements.md` into `feature-dir/`
- The write must be atomic (tempfile plus rename)
- Use UTF-8 without BOM

## Post-execution Hooks

1. Look for `after-requirements` in `.reversa/hooks.yml`
2. Apply the same filtering rule (`enabled: false` is discarded)
3. For `optional: true`, present links under "## Available Hooks"
4. For `optional: false`, emit `EXECUTE: <command>` and wait

## Final report

At the end of the execution, show the user:

1. Absolute path of `feature-dir`
2. Absolute path of `requirements.md`
3. Number of `[DOUBT]` markers in the document
4. Suggestion for next step:
   4.1. If there are `[DOUBT]` markers, suggest `/reversa-clarify`
   4.2. Otherwise, suggest `/reversa-plan`

Always end with:

> Type **CONTINUE** to proceed with `/reversa-clarify` or `/reversa-plan` as suggested above.

NEVER proceed automatically to the next command — leave the decision with the user.
