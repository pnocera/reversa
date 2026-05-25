# Phase 3 (CLI Surface) — Implementation Review

Date: 2026-05-25
Reviewer: Claude (Opus 4.7), Reversa agent harness
Scope: `bin/reversa.js`, `lib/commands/content-server.js`, `lib/commands/__tests__/content-server.test.js`, and the Phase 3-relevant exit-code/error surface of `lib/integrations/cs-agent.js`.

## 1. Verdict

**PHASE 3 NOT APPROVED**

The CLI surface, help, JSON envelope shape, `--quiet`, `--ttl-days`, programmatic helpers, and adapter isolation are all correct. One **medium-severity defect** in exit-code mapping must be fixed before Phase 4: most generic adapter failures (`spawn_failed`, `timeout`, `command_failed`, `profile_mismatch`, `invalid_json`, `multi_envelope`, `unclassified_command`, `invalid_flag_override`, `unknown_action`) currently exit with code `5`, but the plan reserves `5` for "inventory render blocked" and assigns `3` to "other adapter error".

## 2. Findings (ordered by severity)

### M1 — Default exit code is 5; should be 3 for generic adapter errors
**File:** `lib/commands/content-server.js:330-345`

```js
function exitCodeFor(err) {
  switch (err.code) {
    case 'executable_not_found':       return 2;
    case 'profile_required':
    case 'cs_agent_not_enabled':       return 3;
    case 'snapshot_partial':           return 4;
    case 'inventory_render_blocked':
    case 'snapshot_invalid':           return 5;
    default:                           return 5;  // ← wrong
  }
}
```

The plan (`work/01-cs-agent-specialized/implementation/01-implementation-plan.md:278-284`) defines:

- `2` executable not found
- `3` other adapter error
- `4` snapshot partial
- `5` inventory render blocked

Adapter codes that flow through `content-server` and currently fall into the default branch:

| Source (cs-agent.js line) | Code | Today | Plan |
|---|---|---|---|
| `217` | `unclassified_command` | 5 | 3 |
| `526` | `timeout` | 5 | 3 |
| `531` | `spawn_failed` | 5 | 3 |
| `540` | `command_failed` | 5 | 3 |
| `552, 557` | `profile_mismatch` | 5 | 3 |
| `575, 583` | `invalid_json` | 5 | 3 |
| `578` | `multi_envelope` | 5 | 3 |
| `679, 689` | `invalid_flag_override` | 5 | 3 |
| CLI `30` | `unknown_action` | 5 (explicit at line 34) | 3 (CLI usage) |

Also note `snapshot_invalid` is in the switch but is never thrown anywhere in the adapter — harmless, but the dead case can be removed once the default is fixed.

**Why this matters for Phase 4:** Phase 4 wiring (Scout signals and orchestrator prompts) keys off exit codes. A `spawn_failed` from probe will be misclassified as "inventory render blocked", which will produce wrong skill signals (`cs_agent_inventory_failed` instead of `cs_agent_probe_failed`).

**Tests prove the gap:** `lib/commands/__tests__/content-server.test.js` only exercises 4 (`snapshot_partial`) and 5 (`inventory_render_blocked` via missing snapshot dir). There is no negative test for any of the other adapter-error codes, so the regression slipped through.

### L1 — `--allow-disabled` bypass is broader than the plan
**File:** `lib/commands/content-server.js:228-238`

```js
function ensureEnabledOrExplicit(context, flags, action) {
  if (context.csAgent.enabled === true) return;
  if (flags.allow_disabled) return;                         // ← unconditional bypass
  if (action === 'snapshot' && flags.executable && flags.profile && flags.out_dir) return;
  if (action === 'inventory' && flags.snapshot_dir && (flags.inventory_path || flags.print)) return;
  ...
}
```

The plan's wording is "explicit CLI flags make the operation **test-only against a temp path**" (implementation plan line 275). The two action-specific branches enforce that intent; `--allow-disabled` is an undocumented escape hatch that doesn't require a temp path at all. A user (or installer) could call `snapshot --allow-disabled` against the live `.reversa/context/cs-agent/` without enabling the integration. Recommend either (a) deleting the flag and relying on the action-specific explicit-flag checks, or (b) requiring `--allow-disabled` to be paired with an explicit `--out-dir`/`--snapshot-dir`.

Not a Phase-3 blocker on its own (no test in Phase 3 scope requires this), but worth resolving before installer integration in Phase 5 because the installer programmatic path goes through these same checks.

### L2 — `--ttl-days` and `--timeout`/`--allow-disabled` are not in the Phase 3 plan surface
**Files:** `lib/commands/content-server.js:457-490` (help), `269-272` (plan)

The plan lists `[--ttl-days <int>]` only for `snapshot`. The implementation correctly accepts it on `snapshot` *and* extends it to `inventory` and `doctor`, and also adds `--timeout` and `--allow-disabled`. Behavior is sensible and well-documented in subcommand help, but these are extensions beyond the spec. No correctness issue — flagged only so the docs in Phase 4 (`docs/cli.md` etc.) reflect the actual surface, not the plan's smaller surface.

### L3 — `--write` and `--print` mutual exclusivity is not enforced
**File:** `lib/commands/content-server.js:111-133`

Plan spec is `[--write | --print]`. The implementation accepts both flags simultaneously; `flags.print` wins (`inventoryPath: flags.print ? undefined : inventoryPath`). Recommend an early `if (flags.write && flags.print) throw ...` so the user gets a clear error rather than the silent "print wins" behavior. Not a Phase 3 blocker.

### I1 — Confirmed clean
The following items were inspected and are correct:

- `bin/reversa.js:21` registers `content-server`; `bin/reversa.js:40` lists it in top-level help.
- `bin/reversa.js:62` dispatches via `mod.default(args)`, matching the existing module contract (no special `run` alias).
- Bare `reversa content-server` and `reversa content-server --help` both print top-level help (`parseArgs` leaves action null when the first arg starts with `-`; `printHelp(null)` is called from `content-server.js:23`).
- `reversa content-server <action> --help` reaches `printActionHelp` for all five subcommands (verified by the `subcommand help documents action-specific flags` test).
- `--json` emits exactly one envelope (`console.log(JSON.stringify(envelope))`, `content-server.js:349`), and JSON mode suppresses the human-mode branches entirely.
- `--quiet` suppresses success output only — errors still go to stderr (`content-server.js:353-358`). Tested in `CLI snapshot accepts --ttl-days and quiet suppresses success output`.
- `--ttl-days 3` is correctly persisted to `_meta.json` as `snapshot_ttl_days: 3` (test asserts this).
- Programmatic helpers (`probe`, `detect`, `snapshot`, `inventory`, `doctor`) are exported and return envelope-shaped objects (`{ ok, action, data }`); they are independently importable by the installer.
- No direct cs-agent spawn outside the adapter — `lib/commands/content-server.js` only imports from `lib/integrations/cs-agent.js` and `lib/utils/reversa-config.js`. `git diff --check` clean; previous Phase 2 review confirmed `spawn(` / `spawnSync(` only appear in `cs-agent.js`.
- Disabled-config behavior is correct in both the inline check (`snapshot requires enabled config unless explicit flags are present` test) and via explicit test-mode (`snapshot can run in explicit test mode without enabled config` test).

## 3. Required fixes before Phase 4

1. **(M1)** Change `exitCodeFor` default from `5` to `3`, and remove the dead `snapshot_invalid` case. Add a regression test that asserts a generic adapter failure (e.g. stubbed `spawn_failed` from `probe`, or a `multi_envelope` parse failure) maps to exit code `3`. Also re-evaluate the inline `process.exitCode = 5` for `unknown_action` at `content-server.js:34` — it should probably be `3` (or `1` for "CLI usage error", if you want to split that out from adapter errors).

Recommended (not blocking):

2. **(L1)** Either remove `--allow-disabled` or require it to be paired with an explicit out-dir/snapshot-dir to preserve the plan's "test-only against a temp path" invariant. Important to settle before Phase 5 installer hookup.
3. **(L2)** When you write the Phase 4 documentation patches, document the actual flag surface, not the plan's smaller one.
4. **(L3)** Reject `--write --print` combined with a clear error.

## 4. Tests inspected and recommended additions

**Inspected (all passing per the user-supplied `npm test` and `node --test lib/commands/__tests__/content-server.test.js` runs):**

- `detect returns profiles and executable trust`
- `snapshot can run in explicit test mode without enabled config`
- `CLI snapshot accepts --ttl-days and quiet suppresses success output`
- `inventory writes a marked block from an explicit snapshot directory`
- `snapshot requires enabled config unless explicit flags are present`
- `subcommand help documents action-specific flags`
- `CLI maps snapshot partial failures to exit code 4`
- `CLI maps inventory render blocking to exit code 5`

**Recommend adding before Phase 4:**

1. Exit-code regression for `executable_not_found` → `2` (e.g. `probe({ executable: 'C:\\does\\not\\exist.exe' })` via the CLI, asserting `process.exitCode === 2`).
2. Exit-code regression for a generic adapter failure → `3` (e.g. inject a `spawn_failed` via the runner stub on `probe`, assert `process.exitCode === 3`). This test will fail today and is what proves M1 is fixed.
3. Top-level help discoverability: `node bin/reversa.js --help` includes `content-server`; `node bin/reversa.js content-server` (no args) prints the actions list. Currently only covered manually.
4. JSON envelope shape: a single test that parses the stdout of a `--json` run and asserts exactly one envelope with the `{ ok, action, data? | error? }` shape (no stray cs-agent stdout, no second JSON object).
5. `--write` + `--print` mutual exclusivity, once L3 is decided.
