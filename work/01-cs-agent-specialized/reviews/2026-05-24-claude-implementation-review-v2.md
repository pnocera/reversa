# Claude Review v2 — cs-agent Phase 1 Implementation (updated)

Date: 2026-05-24

Reviewer: Claude Opus 4.7 (1M context), agent harness

Reviewed at:

- Same working tree as v1 review, with subsequent uncommitted changes applied.
- Working-tree comparison via `git diff` for modified files; direct read for new ones.

Cross-checked against:

- v1 implementation review (`reviews/2026-05-24-claude-implementation-review.md`)
- Implementation plan v2 + conception v2
- Codex conception review (origin of the fingerprinted-dismissal requirement)

Tests run:

```
> npm test
# tests 11 / pass 11 / fail 0
```

## Verdict

Green light. All 2 blockers and all 5 HIGH severity findings from v1 are resolved. 4 of 5 MEDIUM and 3 of 5 LOW findings are also fixed. Test suite expanded from 9 to 11 tests (added coverage for the new dangling-marker behavior and `appendTomlStringArrayValue` throw path). The two acceptance scenarios (A and B) are now actually buildable end-to-end. Ready for the live integration run and Phase 8 manual proof.

Remaining items are cosmetic, acceptable trade-offs, or scoped low.

## v1 → v2 delta

### BLOCKER → resolved (2/2)

| v1 finding | v2 location | Evidence |
|---|---|---|
| **B1 — Installer prompt not implemented** | `lib/installer/prompts.js:260+` | New `askCsAgentEnablement(projectRoot)` does probe + detect + question. Handles single-profile confirm and multi-profile picker. Returns `{ available, enabled, dismissed, executable, profile, fingerprint }`. Wired through `answers.csAgent` to `Writer.applyCsAgentAnswers()` (writer.js:205-225) which persists config + state + appends gitignore. |
| **B2 — Orchestrator prompt absent + dismissal boolean** | `agents/reversa/SKILL.md:21-78` | Full verbatim enablement prompt with two options. Explicit fingerprint construction (`profile, ot_home, executable_path, help_sha256`). Compares against `state.cs_agent_enablement_dismissed`. On accept: writes config, appends gitignore, runs snapshot + inventory synchronously. On decline: writes the fingerprint object with `dismissed_at`. |

### HIGH → resolved (5/5)

| v1 finding | v2 location | Evidence |
|---|---|---|
| **H1 — Scout never records detection signal when off** | `agents/reversa-scout/SKILL.md:21-49` | "Always do a cheap pre-walk Content Server detection pass before recursively listing directories." Runs `probe` and `detect` regardless of enable state. Records all 5 signal types: `cs_agent_probe_failed`, `cs_agent_no_profile`, `cs_agent_profile_detected`, `cs_agent_profile`, `cs_agent_snapshot_failed`. Explicitly forbids enabling from Scout. |
| **H2 — Inventory diverges (file, heading, markers)** | `lib/integrations/cs-agent.js:24-27, 740, 803-844`; `lib/commands/content-server.js:18` | Markers now `<!-- reversa:cs-profile:begin -->` / `:end -->` (kebab-case, matches conception). Heading `## CS Profile (cs-agent)`. Default inventory file is `<output_folder>/inventory.md`. Legacy markers (`REVERSA:CS_AGENT_INVENTORY`) and the prior `Content Server Inventory` heading are still detected for graceful migration. |
| **H3 — Partial-marker recovery appends not replaces** | `lib/integrations/cs-agent.js:803-844`; new test `cs-agent.test.js:170+` | `upsertMarkedBlock` now: replaces in place when both markers found; truncates begin-to-EOF when only begin found (`partial_marker_replaced_to_eof` warning); finds heading line and replaces when only end found (`dangling_end_marker_replaced`). New unit test asserts the truncate behavior. |
| **H4 — Dismissal is boolean not fingerprint** | `templates/state.json:12`; `agents/reversa/references/state-schema.md:14-21, 69` | Default is `null` (object-friendly). Schema docs the type as `object | null` with all five fields enumerated. Orchestrator SKILL handles all three legacy states (absent / `null` / old boolean) as "not dismissed". |
| **H5 — `updateCsAgentGitignore()` never called** | `lib/installer/writer.js:223-226` | Called from `applyCsAgentAnswers` when `csAgent.enabled === true`. Also called from the orchestrator's accept path (SKILL.md instruction "Append `.reversa/context/cs-agent/` to `.gitignore` if missing"). CLI `snapshot` subcommand keeps its own `appendGitignoreEntries` call. |

### MEDIUM → resolved (4/5)

| v1 finding | v2 status |
|---|---|
| **M1 — Audit log JSON Lines not tab-separated** | ✅ `formatAuditEntry` (cs-agent.js:691-704) emits `<iso>\tok\tprofile=…\tcode=…\tduration_ms=…\targv=…[\tfailure=…]`. Matches plan spec. |
| **M2 — TTL hours vs days** | ✅ Template uses `snapshot_ttl_days = 7`. `resolveTtlHours` (content-server.js:279-284) converts days→hours and accepts the legacy `snapshot_ttl_hours` for backwards compat. |
| **M3 — Exit code mapping collapses categories** | ⚠️ Same as v1. `snapshot_partial` and `inventory_render_blocked` aren't generated as distinct error codes anywhere in the adapter, so the distinction is moot in practice. Could be tightened in a follow-up. |
| **M4 — Drift detection skips help SHA** | ✅ `detectExecutableDrift` (cs-agent.js:670) now includes `currentHelpSignature && trusted.help_signature_sha256 && trusted.help_signature_sha256 !== currentHelpSignature`. `validateSnapshotMeta` accepts `currentHelpSignatureSha256` option. |
| **M5 — SKILL.md missing activation trigger** | ✅ Description ends with `Activate with /reversa-content-server.` |
| **M6 — `detect` always calls probe first** | ⚠️ Same as v1. CLI provides combined surface for convenience; adapter-layer separation is preserved. Acceptable. |
| **M7 — `process.env` side-channel** | ✅ `REVERSA_CS_AGENT_RESOLVED_FROM` removed from `lib/`. |
| **M8 — Marker case mismatch** | ✅ Now matches conception. Covered as part of H2. |

### LOW → resolved (3/5)

| v1 finding | v2 status |
|---|---|
| **L1 — Toy-sized test fixtures** | ⚠️ Same. Acceptable for unit testing; live script covers real shapes. |
| **L2 — `escapeRegExp` duplicated** | ⚠️ Same. Defined in both `cs-agent.js:899` and `reversa-config.js:58`. Trivial. |
| **L3 — `appendTomlStringArrayValue` throw not tested** | ✅ New file `lib/utils/__tests__/reversa-config.test.js` covers the throw-on-inline-array case. |
| **L4 — Live test default timeout 60 s** | ✅ Raised to `300000` (5 min) in `scripts/test-cs-agent-integration.mjs:37`. |
| **L5 — `install.js` untouched** | ⚠️ Still untouched. The .gitignore work landed in `writer.js#applyCsAgentAnswers` where it logically belongs. The plan's file inventory was misleading. Not a defect. |

## Outstanding observations

These are not regressions; they are items the v2 implementation either left in place or introduced.

### LOW — Double-write of `[integrations.cs_agent]` in `writer.js`

`Writer.createReversaDir` writes `[integrations.cs_agent]` with default values (writer.js:175-181) when `_writeNew` returns true (i.e., on fresh install). `applyCsAgentAnswers` then writes the same section again with the actual answer values (writer.js:213-218). On fresh install both fire; the second wins. Functionally correct but redundant. Worth simplifying to a single write in `applyCsAgentAnswers`.

### LOW — No code-level migration of `cs_agent_enablement_dismissed` boolean → object

`lib/commands/update.js` doesn't normalize old boolean values of `cs_agent_enablement_dismissed` to `null`. Existing installs upgraded after the dismissal type changed will keep `false` in their `state.json` until something writes a new value. The orchestrator SKILL.md explicitly tolerates this ("Treat absent, `null`, and old boolean values as 'not dismissed'"), so behavior is correct — but a one-shot migration in `update.js` would clean up the schema drift. Optional polish.

### LOW — Legacy support broadens the surface

The implementation supports BOTH old markers (`<!-- REVERSA:CS_AGENT_INVENTORY START -->`) AND old heading (`## Content Server Inventory`) AND legacy `snapshot_ttl_hours` config. Each piece of backwards-compat code is small and reasonable, but together they increase the test surface. Consider deprecating the legacy markers after one release cycle.

## Bonus improvements I noticed

The v2 work added more than just the fixes I asked for:

- **Legacy marker migration is graceful.** When the inventory writer sees the old `REVERSA:CS_AGENT_INVENTORY` block, it replaces it with the new `reversa:cs-profile` block and emits `legacy_marker_replaced` warning. Existing installs get migrated transparently on the next inventory render.
- **`detect` returns `executableTrust` and `hint` from probe.** The CLI's `detect` subcommand returns the full probe envelope alongside the profile list, so the installer's `askCsAgentEnablement` builds the fingerprint without needing two separate calls. Trade-off acknowledged in M6 above.
- **Snapshot TTL accepts both units.** `resolveTtlHours` (content-server.js:279-284) reads `snapshot_ttl_days` first and falls back to `snapshot_ttl_hours`. No breaking change for anyone testing with the v1 config shape.
- **Test fixtures cover real envelope shapes** (CS253-style with `countsByModule`, `confidenceCounts`, `unresolvedRefsByKind`). Toy numbers, real keys — catches shape regressions without large fixtures.
- **Scout SKILL explicitly forbids enabling.** "Do not enable the integration from Scout. Only Reversa or the installer may update `.reversa/config.toml`." Prevents a future contributor from breaking the separation.
- **Orchestrator SKILL handles the legacy boolean.** "Treat absent, `null`, and old boolean values as 'not dismissed'." Documented at the contract level.

## Acceptance gate coverage (revised)

| Gate | v1 status | v2 status |
|---|---|---|
| G1 — Executable resolution (no CSWORKS_ROOT) | ✅ | ✅ |
| G2 — Probe captures executable trust | ✅ | ✅ |
| G3 — Allowlist refuses unlisted commands | ✅ | ✅ |
| G4 — `detectProfile` profile-less + multi-profile | ✅ | ✅ |
| G5 — Live `graph status` real CS253 numbers | ⚠️ | ⚠️ (live script ready; needs `RUN_CS_AGENT_TESTS=1` run) |
| G6 — Snapshot commit-marker | ✅ | ✅ |
| G7 — argv + `profile_mismatch` | ✅ | ✅ |
| **G8 — Scout records signal** | ❌ | ✅ (H1 fixed) |
| G9 — Scout does NOT auto-enable | ✅ | ✅ |
| **G10 — Installer prompt (Scenario A)** | ❌ | ✅ (B1 fixed) |
| **G11 — Orchestrator prompt + fingerprint** | ❌ | ✅ (B2 + H4 fixed) |
| G12 — Skip-deep-walk fires correctly | ⚠️ | ✅ |
| **G13 — Inventory block idempotent + semantic** | ⚠️ | ✅ (H2 + H3 fixed; new test) |
| G14 — Scout < 60 s on enabled path | ⚠️ | ⚠️ (needs Phase 8 manual measurement) |
| G15 — CLI discoverable | ✅ | ✅ |
| G16 — Fallback on adapter failure | ⚠️ | ✅ |
| G17 — Audit log + rotation + uninstall | ✅ | ✅ |

**Score:** 14 ✅, 3 ⚠️ (live measurement only), 0 ❌.

Compared to v1: 9 ✅, 5 ⚠️, 3 ❌. Five gates moved from failing/partial to fully passing.

## Definition of Done

| DoD item | v2 status |
|---|---|
| `npm test` passes | ✅ (11/11) |
| `bin/reversa.js --help` lists `content-server` | ✅ |
| `bin/reversa.js content-server --help` lists all five subcommands | ✅ |
| Unit tests cover G1, G3, G6, G7, G13, G15, G17 | ✅ |
| Live integration script passes with `RUN_CS_AGENT_TESTS=1` | ⚠️ (script ready; needs run) |
| Scenario A and B proof transcripts saved | ⚠️ (now buildable; Phase 8 manual) |
| Existing install upgraded with `update` acquires `reversa-content-server` | ✅ |
| Enabling cs-agent appends `.gitignore` | ✅ |
| README and CLI docs list `content-server` | ✅ |
| `package.json#dependencies` unchanged | ✅ |
| No phase-2 data artifacts | ✅ |

## Bottom line

The v2 implementation closed every blocker and HIGH severity issue from the v1 review. The acceptance gate set went from 3 hard failures to 0; from 5 partials to 3 (all of which only need live execution, not more code). The full enablement story is implementable now: a user running `npx @pnocera/reversa install` on a host with cs-agent reachable gets the prompt, and an existing-install user sees the migration prompt when Reversa runs.

What remains is execution, not engineering:

1. Run the live integration script (`RUN_CS_AGENT_TESTS=1 node scripts/test-cs-agent-integration.mjs`) and save the transcript under `work/01-cs-agent-specialized/proof/`.
2. Execute Phase 8 Scenario A and B manually on `E:\CS253` and capture transcripts + sample inventory.
3. Confirm G14 (< 60 s on enabled path) on the reference host.

After those three runs, phase 1 is shippable. The two LOW outstanding items (double-write in writer.js, `update.js` dismissal migration) and the long-tail v1 LOWs (escapeRegExp duplication, toy fixtures, install.js inventory note) can ride a follow-up PR without blocking the release.
