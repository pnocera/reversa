---
name: reversa-clarify
description: Generates up to five targeted questions to resolve ambiguous points in the requirements and integrates the answers back into the document. Use when the user types "/reversa-clarify", "reversa-clarify", "clarify doubts", or asks to resolve open points in the requirements before planning. Optional step of the forward cycle, between `/reversa-requirements` and `/reversa-plan`.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: forward
  stage: clarify
---

You are the clarifier. Your mission is to discover what is still unknown before the plan and return the answers to the `requirements.md` of the active feature.

## Before starting

1. Read `.reversa/state.json` to resolve `output_folder` (reverse extraction) and `forward_folder` (forward features)
2. Whenever this skill's text mentions `_reversa_sdd/` or `_reversa_forward/`, use the real values from state.json

## Initial Checks

1. Read `.reversa/active-requirements.json`
   1.1. If the file does not exist, abort with a clear message pointing the user to `/reversa-requirements`
2. Load the `requirements.md` from the `feature-dir` indicated
3. Apply the standard hook rule `before-clarify` read from `.reversa/hooks.yml` (same logic as the `reversa-requirements` skill)

## Question generation

1. Examine `requirements.md` looking for:
   1.1. Explicit `[DOUBT]` markers
   1.2. Vague phrases ("probably", "maybe", "if possible", "some")
   1.3. Open-ended terms without definition (numeric limits, user profiles, expected formats)
   1.4. Obvious coverage gaps (missing negative scenario, implicit edge case)
2. Cross-reference with the internal taxonomy below to select candidates
3. Select at most five questions, ranked by impact on the plan
4. Each question must be either multiple choice or a short answer — never open-ended without options

### Prioritization taxonomy

1. Functional scope and behavior
2. Domain model and data
3. Interaction flow and experience
4. Non-functional attributes (performance, security, observability)
5. Integrations and external dependencies
6. Permissions and authentication
7. Data persistence and migration
8. Audit, logging, and telemetry
9. Internationalization and localization
10. Failures and recovery
11. Compatibility with the legacy mapped in `_reversa_sdd/`

## Presentation to the user

Present the questions in this format:

```
1. <question>
   a) <option>
   b) <option>
   c) <option>
   d) <option>
   e) Free response

2. ...
```

If a question is a short answer, omit the options block and use the format `Expected response: <hint of value type>`.

Wait for the user to answer. If they answer only some, proceed with only the answered ones.

## Integration into requirements.md

1. Locate or create the section `## Clarifications`
2. Inside it, create or update `### Session YYYY-MM-DD`
3. For each answered question:
   3.1. Add an item in the format `- **Q:** <question>` plus `**A:** <answer>`
   3.2. Locate the passage in the requirements where the doubt lived
   3.3. Rewrite the passage in-place, removing the corresponding `[DOUBT]`
4. Update the `## Gaps` section by removing resolved entries and keeping unresolved ones

## Persistence

- Write the modified `requirements.md` atomically
- The `## Clarifications` section must appear immediately before `## Gaps`

## Post-execution Hooks

Apply the standard rule for `after-clarify` (same logic as the `reversa-requirements` skill).

## Final report

1. Absolute path of `requirements.md`
2. Number of doubts resolved in this session
3. Number of `[DOUBT]` markers remaining
4. Suggestion for next step:
   4.1. If there are still `[DOUBT]` markers, suggest a new run of `/reversa-clarify`
   4.2. If all are resolved, suggest `/reversa-plan`

End with:

> Type **CONTINUE** to proceed as suggested above.
