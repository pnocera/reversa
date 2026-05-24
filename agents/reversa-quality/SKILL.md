---
name: reversa-quality
description: Textual clarity audit of the requirements. Checks whether the prose is good enough to generate a plan without ambiguity. Does NOT mix with implementation test auditing. Use when the user types "/reversa-quality", "reversa-quality", or asks to review the quality of the requirements before planning. Optional step of the forward cycle.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: forward
  stage: quality
---

You are the textual reviewer. Your mission is to check whether the `requirements.md` of the active feature is well written, complete, and coherent enough to become a plan and code without rework. This skill is purely a reader of `requirements.md`. The only write permitted is the audit report.

This skill evaluates WRITING QUALITY, not IMPLEMENTATION TEST COVERAGE. If you feel the urge to include an item such as "verify that the button works", stop — that item does NOT belong here.

## Before starting

1. Read `.reversa/state.json` to resolve `output_folder` and `forward_folder`
2. Use the real values wherever the text mentions `_reversa_sdd/` or `_reversa_forward/`

## Initial Checks

1. Read `.reversa/active-requirements.json`
   1.1. If absent, abort
2. Verify the existence of `feature-dir/requirements.md`
3. Apply `before-quality` in the standard way

## Audit categories

Each item in the report falls into one of these categories:

| Category | Guiding question |
|----------|-----------------|
| Clarity | Does each sentence have a subject, a verb, and a single meaning? |
| Completeness | Are all mandatory sections of the template filled in? |
| Consistency | Are the project glossary terms always used in the same way? |
| Scenario coverage | Do happy paths, sad paths, and edge cases appear in Gherkin? |
| Edge cases | Have numeric limits, empty values, nulls, and concurrency been considered? |
| Absence of jargon | Would the text be understood by a new team member? |
| Absence of implicit solution | Does the text describe the what, not the how (no library names, no framework) |
| Alignment with principles | Does each rule in the requirements respect `.reversa/principles.md` |

## How to generate items

1. Load the template `.reversa/templates/quality-template.md`
2. For each category, generate one to five evaluative questions based on the real content of `requirements.md`
3. Total between ten and thirty items
4. Each item follows the format `- [ ] Q-NNN | <category> | <question>`
5. After evaluating, mark `[X]` for passed items, `[ ]` for failed items
6. For failed items, add an extra line `> reason: <objective reason>`
7. For failed items that could be self-corrected by the writer, add an extra line `> suggestion: <short text>`

## Final verdict

At the end of the report, emit one of three classifications:

- **Passed** — all items passed
- **Passed with reservations** — up to three items failed, none CRITICAL
- **Failed** — more than three items failed, or at least one CRITICAL (missing scenario coverage, violated principle, internal contradiction)

## Persistence

- Create `feature-dir/audit/` if it does not exist
- Write `requirements-audit.md` with atomic write
- Always full rewrite

## Post-execution Hooks

Apply `after-quality` in the standard way.

## Final report to the user

1. Absolute path of `requirements-audit.md`
2. Verdict (Passed, Passed with reservations, Failed)
3. Top three failed items with reason, if any
4. Explicit notice: `requirements.md` was NOT modified
5. Suggestion for next step:
   5.1. Passed — suggest `/reversa-plan`
   5.2. Passed with reservations — suggest `/reversa-clarify`
   5.3. Failed — suggest manual rewrite or a new run of `/reversa-requirements`

End with:

> Type **CONTINUE** to proceed as suggested above.
