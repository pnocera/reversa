# Phase 3 Re-Review (post r1 fixes)

## 1. Verdict

**PHASE 3 APPROVED**

All r1 blockers are addressed and the implementation now matches the plan's exit-code matrix, guardrails, and test-coverage requirements.

## 2. Findings

### Blockers / High / Medium

None.

### Low (non-blocking, optional follow-ups)

- **`lib/commands/content-server.js:184-186`** — The `default` branch in `runAction` is unreachable because dispatch at `:28-37` rejects unknown actions before calling `runAction`. Dead code; safe to remove or keep as defense-in-depth.
- **`lib/commands/content-server.js:354-358`** — In `--json` mode, error envelopes go to stdout via `console.log`. Successful envelopes also go to stdout, so a single stream is consistent with "exactly one envelope," but emitting errors to stderr is a common convention. Not required by the plan.
- **`lib/commands/content-server.js:189-216`** — `parseArgs` treats any token starting with `--` as a flag, so a chained `--inventory-path --print` would set `inventory_path = true` instead of capturing a path. No regression and not exercised in scope, but worth noting if more string-valued flags appear.
- **`lib/commands/content-server.js:430-499`** — Inventory subcommand help lists `--allow-disabled` but not `--executable`, even though `inventory()` will use `flags.executable` for drift probing at `:271-284`. Consistent with the plan's subcommand surface (plan does not list `--executable` for inventory), but the asymmetry between code and help may confuse users.
- **`lib/commands/content-server.js:286-295`** — `resolveTtlHours` silently drops non-integer flag values via `intFlag`. Not required to validate per plan; flagging for future hardening.

## 3. Required fixes before Phase 4

None. Phase 3 can proceed to Phase 4 as-is.

## 4. Tests inspected and recommendations

### Inspected (`lib/commands/__tests__/content-server.test.js`)

- `detect returns profiles and executable trust` (:64) — covers detect envelope + argv ordering.
- `snapshot can run in explicit test mode without enabled config` (:84) — covers explicit-flag bypass path in `ensureEnabledOrExplicit`.
- `CLI snapshot accepts --ttl-days and quiet suppresses success output` (:104) — covers `--quiet` + ttl propagation.
- `inventory writes a marked block from an explicit snapshot directory` (:129) — covers idempotent block render.
- `snapshot requires enabled config unless explicit flags are present` (:155) — covers gating.
- `subcommand help documents action-specific flags` (:164) — covers help surface.
- `CLI maps snapshot partial failures to exit code 4` (:172) — exit code 4.
- `CLI maps inventory render blocking to exit code 5` (:206) — exit code 5.
- `CLI maps generic adapter failures and unknown actions to exit code 3` (:221) — both `spawn_failed` (default branch in `exitCodeFor`) and `unknown_action` map to 3 via the unified `exitCodeFor` path at `content-server.js:35` and `:46`.
- `CLI rejects broad allow-disabled and conflicting inventory modes` (:247) — exercises `ensureEnabledOrExplicit` with `--allow-disabled` lacking `--out-dir`, and `--write` + `--print` conflict.

Coverage matches the plan's Phase 3 test list (help, JSON envelope, exit codes, config-disabled, programmatic envelopes). Plan G15 (`snapshot refuses when enabled false unless an explicit temp/test path mode is used`) is satisfied by tests at `:84` and `:155` plus the new `:247` allow-disabled assertion.

### Recommended (not blocking Phase 4)

- A test that `--print` produces no file writes and includes the block on stdout (currently covered only indirectly through the adapter unit tests).
- A test asserting `process.exitCode === 2` when `executable_not_found` is thrown (exit code 2 path in `exitCodeFor` is the only adapter-error code that has no direct CLI test; the unit-level adapter test covers throwing it, but CLI mapping is untested).
- A test that exercising `doctor` without `enabled` and without `--allow-disabled --snapshot-dir` returns exit 3, mirroring the snapshot/inventory cases.

These are quality-of-coverage suggestions; they do not gate Phase 4.
