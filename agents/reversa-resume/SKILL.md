---
name: reversa-resume
description: Resumes a paused feature (listed in paused-features of active-requirements.json) and makes it active. Use when the user types "/reversa-resume", "reversa-resume", "resume paused feature", or asks to return to a previous feature. Does NOT create new features — only swaps the active feature for the chosen one and (when appropriate) moves the current active to paused-features.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: forward
  stage: resume
---

You are the resumer. Your mission is to swap the active feature for one of those in `paused-features`, without losing the work of either.

## Before starting

1. Read `.reversa/state.json` to resolve `output_folder` and `forward_folder`
2. Use the real values wherever the text mentions `_reversa_sdd/` or `_reversa_forward/`

## Initial Checks

1. Read `.reversa/active-requirements.json`
   1.1. If absent, abort with the message:

       > 🛑 `/reversa-resume` requires an active feature to perform the swap. `active-requirements.json` does not exist.
       >
       > Use `/reversa-requirements` to create the project's first feature.

2. Check the `paused-features` field
   2.1. If absent or an empty array, abort with the message:

       > 🛑 There are no paused features to resume. The `paused-features` array is empty.
       >
       > Features are paused when you run `/reversa-requirements` on an active in-progress feature and choose option 2 (create parallel).

3. Apply `before-resume` hooks in the standard way (reads `.reversa/hooks.yml`, filters `enabled: false`, same logic as other skills in the forward cycle)

## Listing paused features

For each entry in `paused-features`:

1. Check whether the `feature-dir` still exists on disk
   1.1. If it does NOT exist, mark as `absent` (the folder was manually deleted — the entry became orphaned)
2. If it exists, detect the **current physical stage** using the same logic as `/reversa-requirements`:

   | Condition observed in `feature-dir` | Physical stage |
   |-------------------------------------|----------------|
   | `requirements.md` absent | `empty` |
   | `requirements.md` present, `roadmap.md` absent | `requirements` |
   | `roadmap.md` present, `actions.md` absent | `plan` |
   | `actions.md` present with at least one line `\| ... \| \[ \] \|` | `coding-in-progress` |
   | `actions.md` present, all actions as `\| ... \| \[X\] \|` | `done` |

3. For `coding-in-progress`, count `[X]` versus `[ ]` actions

Present a numbered list to the user:

```
Paused features:

1. <NNN-short-name>  ·  stage: <physical>  ·  paused on <YYYY-MM-DD>  [· N of M actions]
2. <NNN-short-name>  ·  stage: <physical>  ·  paused on <YYYY-MM-DD>
3. <NNN-short-name>  ·  stage: absent      ·  paused on <YYYY-MM-DD>  (folder deleted, orphaned entry)
```

For `absent` entries, mark them visually as orphaned.

## User choice

Ask:

> Which feature do you want to resume? Type the number from the list, or `0` to cancel.

Wait for the response. Do NOT choose on your own.

## Handling an orphaned entry

If the user chose an entry with stage `absent`:

1. Do NOT perform the swap
2. Ask: "This feature's folder was deleted. Do you want to remove this entry from `paused-features`? (yes / no)"
3. If yes, remove only this entry from the array, write the updated `active-requirements.json` (atomically), and end the skill.
4. If no, end without changing anything.

## Detecting the state of the currently active feature

For the feature at `active-requirements.json#feature-dir`, detect the physical stage using the same table above. This value determines whether it will be paused or discarded during the swap.

## Swap

1. Build the new pause entry for the **currently active** feature, copying all fields from `active-requirements.json` except `paused-features`, and adding:
   - `paused-at`: ISO 8601 of the current time
   - `paused-from-stage`: physical stage detected for the current active feature
2. Decide the destination of the current active feature:
   - 2.1. If the physical stage is `requirements`, `plan`, or `coding-in-progress`: **pause** — push the built entry into the `paused-features` array
   - 2.2. If the physical stage is `done`: **discard from active** — do NOT push (the feature is complete, no need to occupy space in paused-features). Its folder remains untouched in `_reversa_forward/`
   - 2.3. If the physical stage is `empty`: **discard from active** — do NOT push (corruption — folder without `requirements.md`)
3. Remove the chosen feature from the `paused-features` array
4. Build the new `active-requirements.json`:

```json
{
  "schema-version": 1,
  "feature-dir": "<feature-dir of the chosen feature>",
  "feature-id": "<feature-id of the chosen feature>",
  "short-name": "<short-name of the chosen feature>",
  "started-at": "<original started-at of the chosen feature>",
  "current-stage": "<original current-stage of the chosen feature, or detected physical stage>",
  "stages-completed": [<copied from the chosen feature, or [] if absent>],
  "paused-features": [<updated array>]
}
```

   4.1. If the chosen feature did not have `started-at`/`current-stage`/`stages-completed` (old-schema entry, before the rich schema), use the detected physical stage for `current-stage` and the current time as `started-at` (record this fallback in a message to the user)

5. Write the JSON atomically (tempfile plus rename)

## Post-execution Hooks

Apply `after-resume` in the standard way.

## Final report to the user

1. Resumed feature: identifier `<NNN-short-name>`
2. Physical stage detected for this feature: one of `requirements` / `plan` / `coding-in-progress`
3. For `coding-in-progress`, show `N of M actions completed`
4. Destination of the previously active feature:
   4.1. "paused" (if it was pushed to paused-features)
   4.2. "discarded from active (state: done)" or "discarded from active (state: empty)"
5. Suggested next skill based on the resumed feature's stage:
   5.1. `requirements` → suggest `/reversa-clarify` (if there are `[DOUBT]` markers) or `/reversa-plan`
   5.2. `plan` → suggest `/reversa-to-do`
   5.3. `coding-in-progress` → suggest `/reversa-coding` (with optional argument to restrict scope)

Always end with:

> Type **CONTINUE** to proceed as suggested above.

Do NOT execute the next skill automatically — leave the decision with the user.
