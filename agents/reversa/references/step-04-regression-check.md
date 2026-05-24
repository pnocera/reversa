# Step 4, Semantic regression check

> This step only runs on **re-extractions**, that is, when a reversa pipeline is executed on a project that has already gone through at least one `/reversa-coding` cycle. In projects without `_reversa_forward/` or without `regression-watch.md`, this step is silently skipped.

## Why it exists

Reversa is not just a one-shot extraction tool. Every `/reversa-coding` leaves in `_reversa_forward/<feature>/regression-watch.md` a list of rules that must continue to hold true in the next extraction. The reversa pipeline, when re-run, has the duty to check those rules against the current code and report regressions. This is Reversa's competitive differentiator over purely forward frameworks.

## When to run

After the **last agent in the plan** completes, before the final "extraction complete" message. The trigger is position (last item in `.reversa/plan.md`), not agent name, because the last agent varies depending on the optionals selected at install (Reviewer may be absent, for example). Perform the checks in order:

1. Check whether `_reversa_forward/` exists at the project root. If it does not exist, end this step silently.
2. List all subfolders of `_reversa_forward/` that contain `regression-watch.md`.
3. If the list is empty, end.
4. Otherwise, proceed with the procedure below, one feature at a time.

## Procedure per feature

For each `_reversa_forward/<feature>/regression-watch.md`:

1. Load the file. Identify the main watch items table (columns `ID | Origin | Expected rule after change | Verification type | Violation signal`).
2. For each watch item in the main table (not the archived ones):
   2.1. Identify the `Verification type`, possible values: `presence`, `absence`, `wording`, `confidence`.
   2.2. Apply the corresponding check against the newly generated artifacts in `_reversa_sdd/`:
        - `presence`: the rule must be present in `_reversa_sdd/domain.md` (or in the file pointed to by the Origin column) with the same semantic essence.
        - `absence`: the original rule must NO longer appear in the SDD.
        - `wording`: the text was deliberately changed; verify whether the new version matches the expectation.
        - `confidence`: the rule is still present, but the confidence (🟢, 🟡, 🔴) must be equal to or higher than expected.
   2.3. Assign a verdict:
        - 🟢 **green** — the expectation matched fully.
        - 🟡 **yellow** — there is semantic equivalence but the text differs, or the evidence is partial. Default verdict when there is ambiguity. Awaits human judgment.
        - 🔴 **red** — the expectation did NOT match. A previously confirmed rule has become a violated rule.
3. After evaluating all watch items, update the `## Re-extraction history` section of the same `regression-watch.md` by adding a dated block:

```
### Re-extraction YYYY-MM-DD HH:MM

| ID | Verdict | Note |
|----|---------|------|
| W001 | 🟢 green | rule preserved in _reversa_sdd/domain.md#rule-X |
| W005 | 🔴 red | rule removed from current code; unintended change |
| W010 | 🟡 yellow | semantically equivalent but literally differs; awaits judgment |
```

4. Do NOT alter the main watch items table. Do NOT recycle IDs. Do NOT move watch items to "Archived" automatically.

5. For each watch item with three consecutive green verdicts in the history, and provided that `setup.json#watch.archive-after` allows it, move the item from the main table to the `## Archived` section at the end of the file. Keep the original ID.

## Writing policy

- Atomic write (tempfile plus rename) to `regression-watch.md`.
- Never rewrite or delete entries from the re-extraction history.
- The new re-extraction block always goes at the top of the `## Re-extraction history` section (descending order).

## Report to the user

After going through all features, present:

1. Total features checked
2. Total watch items checked
3. Breakdown by verdict: green, yellow, red
4. Detailed list of red items (ID, feature, rule, reason for divergence)
5. Detailed list of yellow items that require human judgment

If there is at least one red, present a highlighted warning:

> 🔴 **Warning** — **N semantic regressions** were detected in previously coded features. Review before proceeding.

If `setup.json#watch.block-on-red` is `true`, suggest that the user **not** proceed with new `/reversa-requirements` until each red item has been triaged. Reversa only alerts; it never automatically blocks the user's flow.

## Special case, no `_reversa_sdd/`

If during the procedure `_reversa_sdd/` does not contain the expected files (because the re-extraction was partial or the documentation level was reduced), record a 🟡 yellow verdict with the note `evidence absent, _reversa_sdd/<file> was not generated in this extraction` and continue.

## Known gap

Semantic equivalence between the expected rule and the extracted rule is a subjective assessment. When in doubt, prefer a yellow verdict. A red verdict should be reserved for cases where the rule simply disappeared or was explicitly contradicted.
