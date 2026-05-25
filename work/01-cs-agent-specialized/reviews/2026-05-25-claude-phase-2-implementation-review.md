# Claude Review — Phase 2 (Adapter Trust Boundary) Implementation

Date: 2026-05-25

Reviewer: Claude Opus 4.7 (1M context), agent harness

Scope:

- **Phase 2 only** — `lib/integrations/cs-agent.js` as the single cs-agent spawn site.
- Companion: `lib/integrations/__tests__/cs-agent.test.js` and `lib/integrations/__tests__/fixtures/`.
- The previous broad implementation reviews (`*-implementation-review.md` and `*-implementation-review-v2.md`) covered the whole feature; this review zooms into Phase 2 line-by-line against the plan §"Phase 2 - Adapter Trust Boundary" (plan lines 149-248).

Tests run:

```
> npm test
# tests 23 / pass 23 / fail 0
```

## Verdict

Phase 2 is done and exceeds the plan in test coverage and defensive design. Every required export is present, every implementation detail listed in the plan is honored, all 10 plan-required test coverage items have at least one corresponding test, both exit criteria pass.

Phase 2 introduced four sound improvements that were not in the plan and one minor scope addition (extra env-var resolution path). No regressions. Recommend accepting Phase 2 as-shipped.

## Plan compliance — line by line

### Required exports (plan §"Exports", lines 153-164)

| Plan item | Status | Location |
|---|---|---|
| `ADAPTER_VERSION = "0.1.0"` | ✅ | `cs-agent.js:17` |
| `AdapterError` | ✅ | `cs-agent.js:42` |
| `resolveExecutable` | ✅ | `cs-agent.js:62` |
| `probe` | ✅ | `cs-agent.js:110` |
| `detectProfile` | ✅ | `cs-agent.js:147` |
| `runReadOnly` | ✅ | `cs-agent.js:191` |
| `collectSnapshot` | ✅ | `cs-agent.js:266` |
| `validateSnapshotMeta` | ✅ | `cs-agent.js:371` |
| `renderInventorySection` | ✅ | `cs-agent.js:437` |
| `isReadOnlyAllowed` | ✅ | `cs-agent.js:187` |

Plus the test-only surface `__test = { setRunCmd, resetRunCmd }` at `cs-agent.js:51`. Public API is otherwise free of spawn-injection knobs, matching the plan's invariant.

### `resolveExecutable` (plan lines 168-171)

| Plan | Status |
|---|---|
| Resolution order: configured path, caller/package directory, PATH | ✅ Honored, with one extension (see §"Bonus / out-of-plan items" below). |
| Ignore `CSWORKS_ROOT` | ✅ Confirmed by test `resolveExecutable honors configured aliases and ignores CSWORKS_ROOT` (cs-agent.test.js:82-93) which sets `process.env.CSWORKS_ROOT` and asserts the resolved path comes from `configured`. |
| If PATH is used, expose that fact to the CLI for a "pin this in config.user.toml" hint | ✅ Returns `{ source: 'PATH', hint: 'Resolved cs-agent from PATH. Pin integrations.cs_agent.executable for repeatable runs.' }` at cs-agent.js:96-103. |

### `probe(executable)` (plan lines 173-178)

| Plan | Status |
|---|---|
| Spawn `help --json` | ✅ cs-agent.js:117 — `executeJson(resolved.path, ['help', '--json'], …)` |
| Parse exactly one JSON envelope | ✅ `parseSingleJson` (cs-agent.js:572) rejects `}{` patterns with `multi_envelope`. Tested at cs-agent.test.js:121-125. |
| Compute SHA-256 over raw stdout | ✅ cs-agent.js:124 — `sha256(rawStdout)` using `crypto.createHash('sha256')`. |
| Capture executable trust: path, mtime ISO, size bytes, help signature | ✅ `executableTrust` (cs-agent.js:607-618) returns all four. Note: snake_case (`size_bytes`, `mtime_ms`, `mtime_iso`) and camelCase variants both included. |
| Cache per executable path within the Node process | ✅ `probeCache` (cs-agent.js:40, 114-115, 143). Cache key includes path + size + mtime so a swapped binary invalidates automatically — a defensive improvement over the plan. |

### `detectProfile(executable)` (plan lines 180-185)

| Plan | Status |
|---|---|
| The only profile-less profile command | ✅ Spawns `profile info --json` without `--profile` (cs-agent.js:150). `runReadOnly` separately throws `profile_required` if a non-detect caller forgets the flag (cs-agent.js:210-211). Tested by `detectProfile is the profile-less registry aggregation path` (cs-agent.test.js:180-218). |
| Aggregate active and registry profiles | ✅ Builds a `Map` keyed by profile name, seeded with active (cs-agent.js:160-164), then walks the registry (cs-agent.js:166-176). De-duplicates via `profiles.has(name)`. |
| For registry entries not already loaded, call `profile info --json --profile <name>` | ✅ Line 169. The test asserts the exact argv pattern: `['profile', 'info', '--json', '--profile', 'OTHER']`. |
| Return all profiles; never choose one | ✅ Returns the full `profiles` array; the test asserts both profiles are present in order. |

### `runReadOnly(topic, command, opts)` (plan lines 187-194)

| Plan | Status |
|---|---|
| Reject empty profile with `profile_required` before spawn | ✅ cs-agent.js:210-212. Test `read-only runner rejects empty profile before spawning` asserts `calls.length === 0`. |
| Enforce `READ_ONLY_ENABLED = { profile: info, graph: status, docs: categories }` | ✅ `READ_ONLY_COMMANDS = new Set(['profile info', 'graph status', 'docs categories'])` (cs-agent.js:33-37); `isReadOnlyAllowed` (cs-agent.js:187); `runReadOnly` checks at line 216-221. |
| Build exact argv `[topic, command, ...args, "--json", "--profile", profile, ...flags]` | ✅ cs-agent.js:223-231. Test `read-only runner allows only classified commands and pins profile/json flags` asserts exactly `['graph', 'status', '--json', '--profile', 'CS253']` (cs-agent.test.js:144). |
| Use `spawn` with no shell | ✅ `defaultRunCmd` (cs-agent.js:489): `shell: false`, `stdio: ['ignore', 'pipe', 'pipe']`, `windowsHide: true`. |
| Enforce timeouts and typed errors | ✅ Default `DEFAULT_TIMEOUT_MS = 30_000` (cs-agent.js:22). Timer kills the child and throws `AdapterError('timeout', …)` at cs-agent.js:526. |
| Verify `envelope.ok === true` and `envelope.profile === profile` | ✅ `executeJson` checks `envelope.ok === false` at cs-agent.js:539 (throws `command_failed`). Profile mismatch checks at cs-agent.js:546-561 throw `profile_mismatch`. Tested by `read-only runner rejects profile mismatch` (cs-agent.test.js:220-237). |
| Append the audit log line for success and failure | ✅ `try/finally` block (cs-agent.js:233-263) ensures audit is appended on both paths. The `audit = { ok: true \| false, … }` shape captures both. |

### `collectSnapshot(opts)` (plan lines 196-203)

| Plan | Status |
|---|---|
| Create `.staging-<uuid>` under `.reversa/context/cs-agent/` | ✅ cs-agent.js:281 — `join(snapshotDir, '.staging-${randomUUID()}')`. |
| Run `probe`, `profile info`, `graph status`, `docs categories` sequentially | ✅ cs-agent.js:287-318. Sequential `await`s; each tracked in `successes[]`. |
| Write three snapshot files inside staging | ✅ cs-agent.js:320-322. |
| Build `_meta.json` with adapter version, profile, collected_at, snapshot file manifest, observed schema version, TTL, and executable trust | ✅ cs-agent.js:330-346. All seven fields present: `adapter_version`, `created_at` + `collected_at`, `profile`, `executable_path`, `executable_source`, `executable_trust`, `schema_version_observed`, `files` + `snapshot_files`, `snapshot_ttl_days`. |
| Publish data files first, then `_meta.json` last as the commit marker | ✅ cs-agent.js:350-352 iterates `[...Object.values(SNAPSHOT_FILES), '_meta.json']` — `_meta.json` is intentionally last. |
| Do not publish anything when a call fails before commit | ✅ Failures stay in the staging directory; commit phase is reached only after all four data calls succeed. Catch block at cs-agent.js:359-368 throws `snapshot_partial` with `{ successes, failure }` details when any prior call succeeded. Tested by `collectSnapshot refuses partial snapshots and leaves no commit marker` (cs-agent.test.js:273-308) — explicitly asserts `_meta.json` and `profile-info.json` do NOT exist after partial failure. |
| Clean staging best-effort | ✅ cs-agent.js:353, 360 — `rmSync(stagingDir, { recursive: true, force: true })` on both success and failure paths. |

### `validateSnapshotMeta(metaPath, opts)` (plan lines 205-209)

| Plan | Status |
|---|---|
| Synchronous file-system guard | ✅ No `await`. Returns synchronously. |
| Return `{ ok, meta, problems, stale, executableDrift }` | ✅ cs-agent.js:428-434 returns exactly that shape. |
| Invalid or missing marker means "do not consume" | ✅ Missing `_meta.json` → `problems: ['missing_meta']`, `ok: false` (cs-agent.js:376-384). Invalid JSON → `problems: ['invalid_meta_json']` (cs-agent.js:386-396). Missing data files → `problems.push('missing_<filename>')` (cs-agent.js:398-410). |
| Stale snapshots are readable but flagged | ✅ TTL precedence (cs-agent.js:412-415): `options.ttlHours ?? snapshotTtlDays*24 ?? meta.snapshot_ttl_days*24 ?? DEFAULT_TTL_HOURS (168h = 7 days)`. Stale check at cs-agent.js:418-420. `stale: true` does NOT make `ok: false` — readable-but-flagged. |

### `renderInventorySection(opts)` (plan lines 211-217)

| Plan | Status |
|---|---|
| Validate snapshot marker first | ✅ cs-agent.js:445-454 calls `validateSnapshotMeta`, throws `inventory_render_blocked` on `!ok`. |
| Read `profile-info.json`, `graph-status.json`, and `_meta.json` | ✅ cs-agent.js:456-459. |
| Render the markered block exactly once | ✅ `renderInventoryBlock` (cs-agent.js:771-) emits the kebab-case markers; `upsertMarkedBlock` (cs-agent.js:803-844) replaces in place. |
| `write` mode replaces from begin marker to end marker, or begin marker to EOF if the end marker is missing | ✅ Both paths covered. Begin+end → replace (cs-agent.js:813); begin-only → `partial_marker_replaced_to_eof` warning + truncate (cs-agent.js:820-826). Tested by `renderInventorySection truncates from a dangling begin marker to EOF` (cs-agent.test.js:400-429). |
| `print` mode returns the block without touching `inventory.md` | ✅ cs-agent.js:467-470. The `mode` option is now respected: `mode === 'print'` returns `{ written: false, action: 'printed' }`. Tested by `renderInventorySection can print a stale snapshot block without writing inventory` (cs-agent.test.js:343-376). |
| Include stale callout when applicable | ✅ `renderInventoryBlock` emits a "snapshot is older than the configured freshness window" warning when `validation.stale === true`. The print-mode test asserts the callout is present in `result.block`. |

### Audit log (plan lines 219-222)

| Plan | Status |
|---|---|
| Path default: `.reversa/context/cs-agent/adapter.log` | ✅ cs-agent.js:752. |
| No JSON payloads, no stdout capture | ✅ `formatAuditEntry` (cs-agent.js:767-778) emits tab-separated key=value text. No `JSON.stringify` for the entry, no stdout fields, no command output. Format: `<iso>\tok\tprofile=…\tcode=…\tduration_ms=…\targv=…[\tfailure=…]`. |
| Rotate when appending would exceed 5 MB; drop oldest roughly 25 percent on line boundaries | ✅ cs-agent.js:756-760. Check is `current.size + newLine.size > 5MB` (size-aware, more accurate than checking just `current.size`). Drops the oldest 25% by line count. Tested by `audit log rotates before append would exceed the limit` (cs-agent.test.js:431-449) — seeds 45,000 × 120-byte lines and asserts post-call size < 5 MB while still containing the new entry. |

### Implementation note — runner injection (plan lines 237-243)

| Plan | Status |
|---|---|
| Wrap `child_process.spawn` behind one internal `_runCmd(executable, argv, opts)` | ✅ `defaultRunCmd` (cs-agent.js:486-521). `runCmdImpl` (cs-agent.js:39) is the swappable binding. `executeJson` (cs-agent.js:523) is the only caller. |
| Expose `__test = { setRunCmd(fn), resetRunCmd() }` | ✅ cs-agent.js:51-60. Tests use this in `test.afterEach` (cs-agent.test.js:75-80) plus `__test.setRunCmd(stubRunner(calls))` in each test. |
| Tests set the runner in `t.beforeEach` and reset it in `t.afterEach` | ✅ Implementation uses `setRunCmd` per-test and `resetRunCmd` in a shared `afterEach`. Per-test `beforeEach` would also work; the chosen pattern is equivalent. |
| Public adapter APIs do not accept spawn options | ✅ No public function exposes a `spawn` parameter. |
| Unit tests must not spawn the real cs-agent | ✅ Confirmed: every test injects a stub via `__test.setRunCmd`. The fake executable is just a placeholder file. |

### Exit criteria (plan lines 245-248)

| Plan | Status |
|---|---|
| `node --test lib/integrations/__tests__/cs-agent.test.js` passes | ✅ 15 tests in this file (cs-agent.test.js); full suite: 23/23. |
| No other file spawns `cs-agent.exe` | ✅ Verified with grep: `spawn(` and `spawnSync(` only appear in `lib/integrations/cs-agent.js` (line 489 `defaultRunCmd`, line 598 `findOnPath` for `where`/`which`). The CLI, the installer, the orchestrator skill, and `update.js` all route through the adapter. |

## Test coverage map

Plan §"Test coverage" lists 10 items. Each maps to at least one test:

| Plan test item | Test name(s) | File:line |
|---|---|---|
| Resolution order including "ignore `CSWORKS_ROOT`" | `resolveExecutable honors configured aliases and ignores CSWORKS_ROOT` | cs-agent.test.js:82-93 |
| Allowlist rejects `dev checkout` without spawning | `read-only runner rejects unclassified commands` (uses `init refresh`; equivalent — unclassified is unclassified) | cs-agent.test.js:168-178 |
| Empty profile rejects without spawning | `read-only runner rejects empty profile before spawning` (asserts `calls.length === 0`) | cs-agent.test.js:151-166 |
| Single-envelope parsing and multi-envelope failure | `probe accepts a direct executable path and rejects multiple JSON envelopes` | cs-agent.test.js:108-128 |
| `detectProfile` is the only profile-less path | `detectProfile is the profile-less registry aggregation path` (asserts argv[0]: no `--profile`; argv[1]: with `--profile OTHER`) | cs-agent.test.js:180-218 |
| Profile mismatch throws | `read-only runner rejects profile mismatch` | cs-agent.test.js:220-237 |
| Snapshot commit marker order and validation failure cases | `collectSnapshot writes snapshot data and validation accepts it`, `collectSnapshot refuses partial snapshots and leaves no commit marker` | cs-agent.test.js:239-308 |
| Inventory block append, replace, partial-marker recovery, stale callout | `renderInventorySection replaces an existing marked block`, `renderInventorySection can print a stale snapshot block without writing inventory`, `renderInventorySection creates the inventory parent directory`, `renderInventorySection truncates from a dangling begin marker to EOF` | cs-agent.test.js:310-429 |
| Partial-marker recovery prints a warning | Asserted as `result.warning === 'partial_marker_replaced_to_eof'` | cs-agent.test.js:422 |
| Log rotation | `audit log rotates before append would exceed the limit` | cs-agent.test.js:431-449 |

**Bonus tests** not strictly required by the plan but valuable:

- `resolveExecutable accepts CS_AGENT_EXE when no explicit path is provided` — covers the bonus env-var path.
- `probe accepts a direct executable path` — covers the convenience signature `probe(exe)` instead of `probe({ executable: exe })`.

## Bonus / out-of-plan items

These are improvements the implementation added beyond the plan. None of them violate the plan's invariants.

### B1 — Extra env-var resolution path

`resolveExecutable` checks `CS_AGENT_EXE` and `CS_AGENT_EXECUTABLE` after `configured` but before the packaged binary (cs-agent.js:75-89). The plan listed three resolution layers; the implementation adds a fourth between layers 1 and 2. Returns `source: 'env:CS_AGENT_EXE'` with the same "pin in config" hint. Used by `scripts/test-cs-agent-integration.mjs` to avoid hard-coding executable paths in tests.

**Note**: this is a UX win for tests and one-off invocations. It does NOT introduce a CSWORKS_ROOT-style implicit dependency on cs-agent's own env vars. The names are Reversa-specific. Worth documenting in the conception companion doc the next time it is updated.

### B2 — Dual-signature `runReadOnly`

Accepts both `runReadOnly({ topic, command, profile, executable, ... })` and `runReadOnly("topic", "command", { profile, executable, ... })` (cs-agent.js:191-194). The plan's signature was the latter; the former is the convenience addition. All public callers (CLI, snapshot collector) use the options-object form. The positional form is used in two tests.

### B3 — Cache-key-aware probe invalidation

`probeCache` key is `${path}:${size}:${mtime}` (cs-agent.js:114). The plan only said "cache per executable path"; the implementation invalidates the cache automatically when the binary is swapped. This is the only sane behavior given that probe captures the help signature, but it was not in the spec.

### B4 — Defensive snake_case + camelCase pairs

`probe` return value and `executableTrust` include both `help_signature_sha256` and `helpSignatureSha256` (cs-agent.js:134-140, 607-618). `validateSnapshotMeta` honors both `meta.collected_at` and `meta.created_at` (cs-agent.js:416). `detectExecutableDrift` reads both `size_bytes`/`sizeBytes`, `mtime_ms`/`mtime_iso`/`mtimeIso`, `help_signature_sha256`/`helpSignatureSha256` (cs-agent.js:737-741). Adds resilience for downstream consumers without breaking the canonical snake_case shape.

### B5 — Sub-second mtime tolerance

`detectExecutableDrift` compares `Math.trunc(trustedMtimeMs) !== Math.trunc(current.mtimeMs)` (cs-agent.js:745). Filters out sub-second precision noise that some filesystems exhibit on copy/rename. Plan was silent on this; the choice is defensible.

### B6 — Size-aware audit log rotation

`appendAuditLog` checks `current.size + newLine.size > AUDIT_MAX_BYTES` (cs-agent.js:756) rather than just `current.size > AUDIT_MAX_BYTES`. Matches the plan's "appending would exceed" phrasing exactly. The v2 review documented this as a refinement; included here for completeness.

## Outstanding items

None at Phase 2 scope.

The two items I noted in the v2 broad implementation review that remain in this code are:

- L2 (escapeRegExp duplicated in `cs-agent.js:899` and `reversa-config.js:58`) — trivial; out of Phase 2 scope.
- L1 (test fixtures use toy numbers) — acceptable; the fixtures cover the required shapes and the live integration script provides realistic CS253-scale coverage.

Neither blocks Phase 2 acceptance.

## Bottom line

Phase 2 is complete and high quality. The adapter:

- Exposes exactly the 10 required public APIs plus the test-only injection surface.
- Honors every implementation detail in the plan.
- Is the single spawn site for `cs-agent.exe`.
- Has 15 dedicated tests covering all 10 plan-required test coverage items plus 2 bonus tests, all passing.
- Adds 6 defensive improvements not required by the plan, none of which violate invariants.

Recommend accepting Phase 2 as-shipped and proceeding to the live integration validation and Phase 8 manual proof (already in progress per `work/01-cs-agent-specialized/proof/`).
