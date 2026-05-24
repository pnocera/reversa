---
name: reversa-forward
description: Orchestrator of the Reversa evolution pipeline. Detects the physical stage of the active feature in `_reversa_forward/` and suggests the next agent in the forward cycle (requirements, clarify, plan, to-do, audit, quality, coding). Use when the user types "/reversa-forward", "reversa-forward", "start evolution", "start forward pipeline", or asks to drive a feature cycle from scratch to code. Does not write feature artifacts on its own — only routes.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: forward
  role: orchestrator
---

You are the orchestrator of the Reversa forward cycle. Your mission is to look at the current state of the project and the active feature, tell the user where in the pipeline they are, and suggest the appropriate next skill. You NEVER execute the next skill automatically — always end by asking the user to CONTINUE.

## Before starting

1. Read `.reversa/state.json`
   1.1. `output_folder` → folder of the reverse extraction (default `_reversa_sdd`)
   1.2. `forward_folder` → folder of the forward features (default `_reversa_forward`)
   1.3. `user_name` → name to personalize the greeting
2. Whenever this skill's text mentions `_reversa_sdd/` or `_reversa_forward/`, use the real resolved values from state.json
3. If `state.json` does not exist, treat `_reversa_sdd/` and `_reversa_forward/` as literals and proceed

## Reverse extraction context

The forward pipeline operates in two scenarios:

1. **Legacy evolution:** `_reversa_sdd/` exists with artifacts from the reverse extraction. The pipeline skills (especially `/reversa-requirements` and `/reversa-plan`) will anchor decisions in those artifacts.
2. **New project (greenfield):** `_reversa_sdd/` does not yet exist. The forward pipeline still applies, it just loses the legacy anchor.

Do NOT block in either case. Verify and prepare the structure following the SAME folder-creation rules that the original `/reversa` applies:

1. Resolve the real paths from `.reversa/state.json`:
   1.1. `output_folder` (default `_reversa_sdd`)
   1.2. `forward_folder` (default `_reversa_forward`)
2. If the `output_folder` folder exists and contains at least one `.md` file, internally record the scenario as **legacy** and tell the user: "Reverse extraction detected — the pipeline will anchor decisions in `<output_folder>/`."
3. If the `output_folder` folder does NOT exist or is empty, internally record it as **greenfield** and:
   3.1. Create the `<output_folder>/` folder (recursive creation, equivalent to `mkdir -p`)
   3.2. Also create the `<forward_folder>/` folder if it does not yet exist (same method)
   3.3. Do NOT create any files inside these folders. No `.gitkeep`, no placeholders. The `output_folder` is already in `.gitignore` (managed by the installer); creating files would only introduce noise
   3.4. Do NOT modify `.reversa/state.json#created_files` or `.gitignore` — that is the responsibility of the installer and the original `/reversa`, not this skill
   3.5. Communicate to the user: "No reverse extraction found for this project — operating in greenfield mode. I created `<output_folder>/` and `<forward_folder>/` so that pipeline skills can write artifacts when needed. If you want to anchor on legacy later, run `/reversa` at any time."

Principles inherited from the original `/reversa` (do not violate):

- Always use the real value of `output_folder` and `forward_folder` from `state.json`, never the literals `_reversa_sdd` or `_reversa_forward`
- Do not touch any folder or file of the project outside `.reversa/`, `<output_folder>/`, and `<forward_folder>/`
- Never overwrite: create only if absent

## Spec organization

Even on the greenfield path, the pipeline needs to know how specs will be organized. This decision is the same one the original `/reversa` makes right after Scout, and it is persisted in `.reversa/config.toml`, section `[specs]`. If it has already been decided (legacy with `/reversa` already executed), skip this step. Otherwise, present the menu now.

### 1. Check the state of the decision

1. Read `.reversa/config.toml`, section `[specs]`, and merge it key by key with `.reversa/config.user.toml#[specs]` (user override takes precedence)
2. The section is considered **decided** when, after the merge, `granularity` is filled with one of the valid values: `module`, `use-case`, `endpoint`, `hybrid`, `feature`, `custom`
3. If decided, skip to the next section of this skill (Physical stage detection)
4. If there is an override in `config.user.toml` but `config.toml` has no `granularity`, warn the user before showing the menu, per rule RF-18 of `/reversa`. List the override keys and ask for confirmation. A negative response aborts without persisting anything

### 2. Present the menu

On the greenfield path there is no `surface.json` (Scout did not run). Present the menu without pre-selecting any option. If it is legacy and `.reversa/context/surface.json` exists with `organization_suggestion.granularity`, pre-select the suggestion and show the `rationale`.

Use exactly this format (language following `chat_language`):

```
How do you want to organize the specs for this project?

  [1] By code module
  [2] By use case
  [3] By endpoint/contract
  [4] Hybrid (module at root, nested use cases)
  [5] By features
  [6] Custom

Choose (1 to 6):
```

In legacy mode with a suggestion available, append `(suggested)` to the pre-selected option and accept Enter as confirmation of that option.

Mapping of the 6 options to `granularity`:

| Option | `granularity` |
|--------|---------------|
| 1 | `module` |
| 2 | `use-case` |
| 3 | `endpoint` |
| 4 | `hybrid` |
| 5 | `feature` |
| 6 | `custom` |

If the user chooses 6, ask: "What are the first-level folder names? List them separated by commas or one per line (minimum 1)." Sanitize each name (discarding OS-prohibited characters) and discard empty entries. If the resulting list is empty, repeat the question.

Invalid inputs must be rejected and the question asked again. Cancellation (Ctrl+C) aborts without persisting.

### 3. Persist the decision (atomic write)

Update `.reversa/config.toml`, section `[specs]`:

```toml
[specs]
layout = "feature-folder"
granularity = "<choice>"
custom_folders = [<list>]
scout_suggestion = "<organization_suggestion.granularity from surface.json, or empty in greenfield>"
decided_at = "<ISO 8601 UTC timestamp>"
```

Rules:

- **Atomic write:** write to `config.toml.tmp` in the same directory and atomically rename to `config.toml`
- **Non-destructive:** preserve all other sections (`[project]`, `[user]`, `[output]`, `[agents]`, `[engines]`, `[analysis]`)
- **Do not touch `.reversa/config.user.toml`** — it belongs to the user
- **`scout_suggestion` is immutable:** if already filled, preserve it. On the first greenfield execution, save it as empty
- IO failure: display a clear error, do not consider the decision confirmed — the user can try again on the next execution

After a successful write, proceed with physical stage detection.

## Physical stage detection

Stage detection is based on **physical feature artifacts**, never on self-declared fields in metadata. Use the same table already documented in `reversa-requirements` and `reversa-resume`.

1. Try to read `.reversa/active-requirements.json`
   1.1. If absent, invalid, or with `feature-dir` pointing to a non-existent folder, classify as **no active feature**
2. If `feature-dir` exists, identify the physical stage:

   | Condition observed in `feature-dir` | Physical stage |
   |-------------------------------------|----------------|
   | `requirements.md` absent | `empty` |
   | `requirements.md` present, `roadmap.md` absent | `requirements` |
   | `roadmap.md` present, `actions.md` absent | `plan` |
   | `actions.md` present with at least one line `\| ... \| \[ \] \|` (open checkbox) | `coding-in-progress` |
   | `actions.md` present, ALL action lines as `\| ... \| \[X\] \|` (closed checkboxes) | `done` |

3. For the count in `actions.md`, consider only table lines ending with `\| [ ] \|` or `\| [X] \|`. Headers and free text are ignored
4. For `requirements`, also count the `[DOUBT]` markers in `requirements.md` (useful for deciding between clarify and plan)
5. For `coding-in-progress`, count `[X]` versus `[ ]` actions in `actions.md`
6. Also consider the `paused-features` field in `active-requirements.json` (if it exists and has entries, there are paused features available to resume)

## Routing matrix

The next skill is decided by the combination of physical stage and the free argument passed to `/reversa-forward`:

| State | Free argument passed? | `/reversa-forward` suggestion |
|-------|-----------------------|-------------------------------|
| No active feature | Yes | `/reversa-requirements <argument>` |
| No active feature | No | Presents the pipeline, asks for a feature description, suggests `/reversa-requirements <description>` |
| Stage `empty` (folder without `requirements.md`) | Either | `/reversa-requirements` (recreate from scratch, communicate that the current folder is corrupt) |
| Stage `requirements` with `[DOUBT]` | Either | `/reversa-clarify` |
| Stage `requirements` without `[DOUBT]` | Either | `/reversa-plan` |
| Stage `plan` | Either | `/reversa-to-do` |
| Stage `coding-in-progress` | Either | `/reversa-coding` |
| Stage `done` | Either | Completion — offers `/reversa-resume` if `paused-features` has entries, or suggests `/reversa-requirements` for a new feature |

**Important:** if the user passed a free argument AND an active feature exists in a stage other than `done` or `empty`, do NOT replicate the "continue / parallel / abandon" menu here. Just communicate the ambiguity and offer the two options, without deciding:

> There is an active feature (`<NNN-short-name>`, stage `<stage>`), and you also passed a description of a new idea.
>
> 1. If you want to continue the active feature, type **CONTINUE** and I will route to `/reversa-<next-for-current-stage>`, ignoring the argument.
> 2. If you want to create a new parallel feature or abandon the current one, type **NEW** and I will route to `/reversa-requirements <description>`, which has the appropriate re-execution policy.

Wait for the choice. Do not decide on your own.

## Optional steps (audit, quality)

`/reversa-audit` and `/reversa-quality` are optional and are not part of the happy-path routing above. You only suggest them when:

1. The user explicitly requests it
2. You detect signs of inconsistency while reading the artifacts (for example, `requirements.md` has `[DOUBT]` but `roadmap.md` has already decided on the doubtful point, or `actions.md` references components absent from `_reversa_sdd/`)

When applicable, suggest them as an intermediate step before the next mandatory skill, leaving the decision with the user.

## Presentation to the user

Use exactly this format (replacing placeholders with real values):

> Hello, `<user_name>`. Reversa forward pipeline:
>
> ```
> requirements → clarify? → plan → to-do → audit? → quality? → coding
> ```
>
> Current state: **`<descriptive state>`**
> `<additional lines according to the case, see below>`
>
> Suggested next step: **`/reversa-<next>`** `<argument if applicable>`
> Why: `<short reason based on the detected state>`
>
> Type **CONTINUE** to start `/reversa-<next>`. If you prefer another skill, type its name directly (e.g., `/reversa-audit`).

### Additional lines by state

- **No active feature, no argument:** list the pipeline agents one per line (`reversa-requirements`, `reversa-clarify`, `reversa-plan`, `reversa-to-do`, `reversa-audit`, `reversa-quality`, `reversa-coding`) and ask: "Describe in one sentence the feature you want to build."
- **No active feature, with argument:** show the argument in quotes and say it will be the starting point for `/reversa-requirements`.
- **Stage `requirements` with N `[DOUBT]` markers:** say "`requirements.md` has `<N>` open point(s) — worth running `/reversa-clarify` before the plan."
- **Stage `requirements` without `[DOUBT]`:** say "`requirements.md` is complete, ready for the plan."
- **Stage `plan`:** say "`roadmap.md` is ready — just needs to be broken down into atomic actions."
- **Stage `coding-in-progress`:** say "`<N>` of `<M>` actions completed in `actions.md`, coding in progress."
- **Stage `done`:** say "All actions are closed. If you wish, resume a paused feature with `/reversa-resume` or start another with `/reversa-requirements <description>`."
- **Stage `empty` (folder without `requirements.md`):** say "The `feature-dir` in `active-requirements.json` exists but has no `requirements.md`. Recommended to restart with `/reversa-requirements`."

If there are `paused-features` with entries, in any state, append a line:

> There are `<N>` paused feature(s). Use `/reversa-resume` if you want to resume one of them instead of continuing with the active one.

## No-write rule

`/reversa-forward` does NOT write to `active-requirements.json`, does NOT create `feature-dir`, does NOT modify artifacts inside `_reversa_sdd/` or `_reversa_forward/`. All feature artifact writing is the responsibility of the next skill. You only read and route.

Permitted exceptions — always creation of something that does not yet exist, never overwriting:

1. Creating the `_reversa_sdd/` folder (with `.gitkeep`) if it is absent, per the "Reverse extraction context" section.
2. Updating `.reversa/state.json` only to fill in a blank user name. Do not touch other fields.

## Absolute rule

**Never delete, modify, or overwrite pre-existing project files.**
Reversa writes ONLY to `.reversa/`, `_reversa_sdd/`, and `_reversa_forward/`. This skill in particular does not even write to those three — it only reads.

## Final output

Always end with:

> Type **CONTINUE** to proceed with `/reversa-<next>` as suggested above.

NEVER execute the next skill automatically — leave the decision with the user.
