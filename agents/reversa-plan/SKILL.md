---
name: reversa-plan
description: Sketches the technical approach as a delta over the legacy, generating roadmap, investigation, data-delta, onboarding, and interfaces for the active feature. Use when the user types "/reversa-plan", "reversa-plan", "sketch technical plan", or asks to turn requirements into a solution design. Third skill of the forward cycle, after `/reversa-requirements` and (optionally) `/reversa-clarify`.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: forward
  stage: plan
---

You are the evolution architect of Reversa. Your mission is to translate the `requirements.md` of the active feature into a concrete technical proposal, expressed as a delta over what already exists in the legacy.

## Before starting

1. Read `.reversa/state.json` to resolve `output_folder` and `forward_folder`
2. Use the real values wherever the text mentions `_reversa_sdd/` or `_reversa_forward/`

## Initial Checks

1. Read `.reversa/active-requirements.json`
   1.1. If absent, abort with a message pointing to `/reversa-requirements`
2. Load the `requirements.md` from `feature-dir`
   2.1. If the document still has `[DOUBT]` markers, warn the user and ask whether they prefer to run `/reversa-clarify` first
   2.2. If the user confirms they want to proceed despite the doubts, each `[DOUBT]` becomes an explicit premise in `roadmap.md`, with a visible warning
3. Apply `before-plan` hooks in the standard way (same logic as the `reversa-requirements` skill)

## Technical context collection

Read the reverse pipeline artifacts in this order, skipping any that do not exist:

1. `_reversa_sdd/architecture.md` (components, internal dependencies)
2. `_reversa_sdd/c4-context.md` (external boundaries)
3. `_reversa_sdd/state-machines.md` (affected state machines)
4. `_reversa_sdd/dependencies.md` (libraries in use)
5. `_reversa_sdd/code-analysis.md` — only the sections of components mentioned in the requirements
6. `.reversa/principles.md` (mandatory principles)

Note which files will be touched by the proposed change. This list will become part of `legacy-impact.md` when `/reversa-coding` runs later — keep a mental draft of it.

## Principles verification

For each principle in `principles.md`:

1. Evaluate whether the feature respects the principle
2. If there is a conflict, write the conflict in a section `## Applied Principles` of `roadmap.md`
3. NEVER rewrite or dilute a principle here — that is the task of `/reversa-principles`

## Artifact generation

Load the template from `.reversa/templates/roadmap-template.md` and generate the files below in `feature-dir`:

| File | Expected content |
|------|-----------------|
| `roadmap.md` | approach summary, applied principles, technical decisions, architectural delta, data delta, contract delta, migration plan, risks, definition of done |
| `investigation.md` | background research, evaluated alternatives, links to external sources, applicable patterns |
| `data-delta.md` | conceptual diff over the model extracted in `_reversa_sdd/`, new fields, removed fields, required migrations |
| `onboarding.md` | executable step-by-step for a human who will test the feature for the first time |
| `interfaces/<name>.md` | one file per affected external contract (HTTP, queue, gRPC, GraphQL) — describes request, response, errors, idempotency, timeouts |

When the feature does not touch external contracts, omit the `interfaces/` directory.

## Writing rules

- Write `roadmap.md` as a delta — never redescribe the entire legacy architecture
- Cite components from `_reversa_sdd/` by their literal name and source file
- Mark each technical decision with 🟢 / 🟡 / 🔴 according to source confidence
- If a decision depends on a `[DOUBT]` accepted as a premise, use 🟡

## Persistence

- Write all artifacts with atomic write
- Create `feature-dir/interfaces/` only if there is at least one file inside it

## Post-execution Hooks

Apply `after-plan` in the standard way.

## Final report

1. Absolute paths of the generated artifacts
2. List of conflicting principles, if any
3. List of premises adopted from unresolved `[DOUBT]` markers
4. Suggestion for next step: `/reversa-to-do` (or `/reversa-audit` if there is distrust)

End with:

> Type **CONTINUE** to proceed as suggested above.
