# Claude Review v2 — cs-agent Specialized Implementation Plan (updated)

Date: 2026-05-24

Reviewer: Claude Opus 4.7 (1M context), agent harness

Reviewed file:

- `work/01-cs-agent-specialized/implementation/01-implementation-plan.md` (updated after v1 review)

Cross-checked against:

- v1 review: `reviews/2026-05-24-claude-implementation-plan-review.md`
- Conception v2 (all four files)
- Repo state already inspected in v1

## Verdict

Green light. Every concrete finding from the v1 review (3 HIGH, 6 MEDIUM, 5 LOW) is addressed in the updated plan, most of them verbatim against the recommendation. The plan is ready to start implementation.

Two small LOW items remain (one test-coverage gap and a wording nit). Neither blocks coding; both can be fixed in flight or during code review.

## v1 → v2 delta (all 14 findings addressed)

### HIGH

| v1 finding | v2 location | Status |
|---|---|---|
| Update migration for `reversa-content-server` underspecified | New **Phase 4.5** (lines 360-385) with trigger, actions, no-op guard, and exit criteria. DoD line 573 covers it. | Resolved |
| `writer.js` config mutation should use upsert, not `.replace()` | Phase 5 lines 403-407 explicitly use `upsertTomlSection` with `insertAfter: "[analysis]"`, plus a warning against extending the `.replace()` chain. | Resolved |
| `.gitignore` should be mandatory | Phase 5 lines 409-413 require unconditional append regardless of `git_strategy`. DoD line 574. | Resolved |

### MEDIUM

| v1 finding | v2 location | Status |
|---|---|---|
| Spawn injection mechanism unspecified | Phase 2 lines 237-243 commit to internal `_runCmd` + `__test.setRunCmd/resetRunCmd` exports. | Resolved |
| TOML helper scope unclear | Phase 1 lines 109-112 commit to flat key=value only, edit-as-text, throw on unsupported multi-line. Plus a **bonus**: dedicated `appendTomlStringArrayValue` helper (lines 114-120) separates the multi-line `[agents].installed` case from the upsert. | Resolved + improved |
| Section placement unspecified | Phase 4 line 335 ("after `[analysis]` and before `[specs]`") and Phase 1 line 106 (`options.insertAfter`). | Resolved |
| Fixture location unspecified | Phase 6 line 465 ("Store fixtures under `lib/integrations/__tests__/fixtures/`"). | Resolved |
| Live script temp dir cleanup | Phase 7 lines 489-491 (unique dir, print path, delete on success unless `KEEP_CS_AGENT_TMP=1`, keep on failure). Exit criterion line 513. | Resolved |
| README/CLI docs left "conditional" | File plan adds `README.md`, `docs/cli.md`, `docs/cli.pt.md`, `docs/cli.es.md`. Phase 4 lines 345-349 turn them into definite patches. DoD line 575. | Resolved |

### LOW

| v1 finding | v2 location | Status |
|---|---|---|
| Commit sequence pairing | Sequence shrunk from 6 to 5 commits. New commit 3 explicitly groups skill/config/orchestrator wording (line 549). Note at line 553 explains why. | Resolved |
| Partial-marker recovery should warn | Phase 2 line 234 + Phase 6 line 473 (test fixture for the warning path). | Resolved |
| `default` vs `run` alias | Phase 3 lines 257, 289 drop `run`. `bin/reversa.js` dispatches via existing `mod.default(args)` pattern. | Resolved |
| `package.json#dependencies` guard | Phase 0 lines 75, 91. Repo constraints line 30. DoD line 576. | Resolved |
| `cs_agent_enablement_dismissed` template default | Phase 4 lines 337-338 picks `null` and requires all three state shapes (absent / `null` / object) be handled. Phase 6 line 472 adds the fixture variants. | Resolved |

### Bonus improvements that weren't in my v1 list

- **New repo constraint** (line 28): explicitly documents that installed agents live in both `state.json#agents` and `config.toml [agents].installed` and that migrations must keep them coherent. This is exactly the rule that the Phase 4.5 migration needs.
- **Verification-only help check** (line 67): replaces the v1 ambiguous "if it has a list" with a concrete instruction to verify `reversa-agents-help/SKILL.md` lists slash commands not CLI commands and skip if so. Removes a maybe-task.
- **Definition of Done** grew from 7 items to 11, each falsifiable.

## Remaining findings

### LOW — `appendTomlStringArrayValue` throw path not in test coverage

Phase 1 line 120 says the helper throws and leaves the file untouched if the array is malformed or inline. Phase 1 test coverage (lines 132-142) covers the happy path (line 141) and the upsert throw case (line 140) but does not cover the `appendTomlStringArrayValue` throw case.

**Recommendation:** add to Phase 1 test coverage:

> Malformed or inline `[agents].installed` array → `appendTomlStringArrayValue` throws and leaves the file unchanged.

Phase 4.5's migration depends on this helper succeeding on the current well-formed `[agents].installed`, but if a user has hand-edited their config to use an inline array, we want the failure to be loud rather than silent corruption.

### LOW — Phase 5 backward-reference to Phase 4 should mention Phase 4.5

Phase 5 line 425 says "Install the new core skill as described in Phase 4." Since the migration moved into a new Phase 4.5 between v1 and v2, this reference should read "as described in Phase 4 and Phase 4.5" to be unambiguous. Pure wording nit.

## Things still well-handled

- Phase ordering (preflight → utilities → adapter → CLI → templates+skills → migration → installer/lifecycle → unit tests → live → manual) remains correct.
- Trust boundary discipline is preserved: skills shell the CLI, CLI calls the adapter, adapter is the only thing that spawns `cs-agent.exe`.
- The `detectProfile` / `runReadOnly` split (the one profile-less path vs every other call must pin `--profile`) is now reflected end-to-end across spec, phase 2 implementation, and phase 6 tests.
- All 17 hard gates from `03-phase-1-acceptance.md` map cleanly to phases (already verified in v1; the v2 changes didn't shuffle any).
- Risks section (lines 555-563) now explicitly includes the v1 findings: TOML upsert, state/config/manifest coherence, `.gitignore` machine-local content. Future contributors get the warning up front.
- DoD line 573 covers the migration with a falsifiable test: `state.json`, `config.toml`, and manifest all reflect the new skill; second `update` is a no-op.

## Bottom line

The plan addresses every concrete finding from v1 and is ready for implementation. Suggest folding the two LOW items into the first PR (the test addition for `appendTomlStringArrayValue` throw path, and the Phase 5 wording fix to reference Phase 4.5), but neither blocks getting started. Once the implementer ships the suggested commit sequence and the live integration script passes against CS253, all 17 hard gates should fall out.

No further conception or planning rounds needed before code starts.
