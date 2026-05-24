# Phase 1 acceptance criteria (v2)

> **v2 — applied codex review** (`../reviews/2026-05-24-codex-conception-review.md`, 2026-05-24). Key changes from v1:
> - Headline outcome **distinguishes scenario A (installer-enabled fast first run) from scenario B (orchestrator-detected two-run migration)**. Each has its own time gate.
> - Added gates for the **CLI surface** (`bin/reversa.js` lists `content-server`; `detectProfile()` works profile-less; multi-profile is surfaced not auto-picked).
> - Replaced the v1 "no partial files remain" gate with "**no snapshot consumed unless `_meta.json` commit marker validates**".
> - Replaced the v1 character-level inventory diff with **semantic assertions** (required fields present, values match cache, idempotent on rerun).
> - Added an explicit **idempotency gate**: running the inventory writer twice leaves exactly one CS Profile section.
> - Added a **fingerprinted dismissal** gate: changing the fingerprint causes the orchestrator to re-ask.
> - Audit log path updated to `.reversa/context/cs-agent/adapter.log` with rotation gate.

---

## 1. What phase 1 is being graded on

Two observable outcomes, one per enablement scenario. Both must pass.

### Scenario A — installer-enabled (preferred path)

> Running `npx @pnocera/reversa install` on a project hosted on a machine where cs-agent is reachable and at least one profile is initialized: the installer probes, asks the user, persists config, and the very first `/reversa` produces the `## CS Profile (cs-agent)` block in `_reversa_sdd/inventory.md` under 60 seconds of Scout time.

### Scenario B — orchestrator-detected migration

> Running `/reversa` on a project where Reversa is already installed but `[integrations.cs_agent].enabled = false` and cs-agent has since become reachable: the first run detects + asks. On acceptance, the orchestrator collects the snapshot and writes the inventory block synchronously. The second `/reversa` run uses the fast path (under 60 seconds of Scout time, no deep walk under `srcdir`).

Both scenarios end in the same state: `[integrations.cs_agent].enabled = true`, snapshot cached, inventory block rendered, deep walk under `srcdir` skipped on subsequent runs.

---

## 2. Hard gates (must all pass on `E:\CS253`)

### G1 — Executable resolution (no env fallback)

```
node -e "import('./lib/integrations/cs-agent.js').then(m => m.resolveExecutable({ configured: 'F:\\\\smoke\\\\CS253\\\\cs-agent.exe' }).then(console.log))"
```

Expected: `F:\smoke\CS253\cs-agent.exe`.

Negative test: with `configured` omitted and PATH not containing cs-agent, throws `AdapterError` with `code === "executable_not_found"`. `CSWORKS_ROOT` env variable, if set, is **ignored** (removed in v2 — see [00-conception.md](00-conception.md) §6).

### G2 — Probe captures executable trust

`probe(executable)` against `F:\smoke\CS253\cs-agent.exe` returns:

```json
{
  "ok": true,
  "helpSignatureSha256": "<64-hex>",
  "commandCount": <int>,
  "topics": ["init", "build", "code", "csdoc", "csui", "dev", "docs", "edit", "graph", "lint", "mcp", "module", "profile", "runs", "source", "test", "xlate"],
  "executableTrust": {
    "path": "F:\\smoke\\CS253\\cs-agent.exe",
    "mtimeIso": "<ISO-8601>",
    "sizeBytes": <int>,
    "helpSignatureSha256": "<same as top-level>"
  }
}
```

`commandCount >= 100`, topics includes `graph`, `profile`, `docs`. (Exact counts may shift across cs-agent versions; the test asserts shape and logs the actual values for drift tracking.)

### G3 — Allowlist refuses unlisted commands without spawn

```
runReadOnly("dev", "checkout", { profile: "CS253", executable, args: ["ptexchange"] })
```

Throws `AdapterError` with `code === "unclassified_command"` AND `child_process.spawn` is never called. Verified by stubbed spawn in unit tests.

Also verified: `runReadOnly("profile", "info", { profile: "" })` throws `AdapterError` with `code === "profile_required"` without spawning.

### G4 — `detectProfile()` works profile-less and lists the registry

```
detectProfile(executable)
```

Returns:

```json
{
  "ok": true,
  "active": "CS253",
  "profiles": [
    {
      "name": "CS253",
      "ot_home": "E:\\CS253",
      "workdir": "E:\\CS253_workdir",
      "schema_version": 3,
      "path_checks_green": true,
      "raw": { ... }
    }
  ]
}
```

If the test host has only CS253: `profiles.length === 1`. If multiple profiles exist: all are returned; `active` is the cs-agent active one. The function **does not auto-pick** when multiple exist — caller's responsibility (see G9, G10).

Negative test: `detectProfile` against a non-existent executable returns `AdapterError('executable_not_found')`.

### G5 — `runReadOnly("graph", "status")` returns real CS253 numbers

`runReadOnly("graph", "status", { profile: "CS253", executable, timeoutMs: 300000 })` returns:

- `status.schemaVersion >= 3`
- `status.nodeCount >= 100000` (live CS253: 940,729)
- `status.edgeCount >= 100000` (live CS253: 2,251,241)
- `status.countsByModule.length >= 50` (live CS253: 148)
- `status.nodesByKind` includes entries for `module`, `function`, `feature`, `script`, `object`, `route`, `ospace`

### G6 — `collectSnapshot` publishes via commit marker

After `collectSnapshot({ executable, profile: "CS253", outDir: "<tmp>/.reversa/context/cs-agent/" })`:

1. All four files exist next to each other: `profile-info.json`, `graph-status.json`, `docs-categories.json`, `_meta.json`.
2. `_meta.json` parses and contains: `adapter_version`, `profile === "CS253"`, `collected_at` (within last 5 minutes), `snapshot_files` referencing all three data files, `schema_version_observed`, `snapshot_ttl_days`, `executable_trust` with all four fields.
3. `validateSnapshotMeta(metaPath, { currentHelpSignatureSha256 })` returns `{ ok: true, stale: false, executableDrift: false, problems: [] }`.

Killing the process between snapshot data writes and `_meta.json` publish:

- Either `_meta.json` is absent (publish hadn't started) — `validateSnapshotMeta` returns `{ ok: false, problems: [{ code: "missing_meta" }] }`.
- Or `_meta.json` is the previous one — its `collected_at` does not match the in-flight session; if the previous data files were overwritten by the in-flight snapshot but `_meta.snapshot_files` still references them, the data is the **new** content under the **previous** marker. This is acceptable because (a) the file structure is the same shape regardless of session, (b) readers that validate freshness via `snapshot_ttl_days` and `executable_trust.help_signature_sha256` will catch real drift.

Hard requirement: **at no point is a partial commit marker visible**. Test by killing the process at every stage and asserting `validateSnapshotMeta` either succeeds fully or refuses fully — never half.

### G7 — `--profile` is always passed and verified

Spying on the spawned argv for `runReadOnly("profile", "info", { profile: "CS253", executable })` shows:

```
["profile", "info", "--json", "--profile", "CS253"]
```

In exact order. No caller-supplied overrides for `--json` or `--profile` are honored.

If the test mocks cs-agent to return `{ ok: true, profile: "OTHER", data: {} }`, the adapter throws `AdapterError('profile_mismatch', { expected: "CS253", actual: "OTHER" })` and does not return the data.

### G8 — Scout records the signal on detect success

After Scout runs in a test harness where the CLI `detect` succeeds:

`surface.json.signals[]` contains exactly one entry of type `cs_agent_profile_detected` (when config is off — Scout did detect-only) OR `cs_agent_profile` (when config is on — Scout did detect + snapshot). Both entries include the executable trust evidence.

Negative test: when detect returns `executable_not_found`, Scout records `cs_agent_probe_failed` and continues with a standard walk.

### G9 — Scout does NOT auto-enable

Across all G8 cases: `.reversa/config.toml` `[integrations.cs_agent].enabled` is whatever it was before Scout ran. Scout never wrote to `config.toml`, `config.user.toml`, or `state.json` for cs-agent purposes.

### G10 — Installer prompt path (Scenario A)

Fresh `npx @pnocera/reversa install` run on a machine where probe + detect succeed:

1. The installer presents the enablement prompt (single profile case OR multi-profile picker).
2. On accept: writes `[integrations.cs_agent] enabled = true, profile = "<name>", ot_home, workdir, snapshot_ttl_days = 7` to `config.toml`. Writes `[integrations.cs_agent] executable = "<path>"` to `config.user.toml`.
3. Subsequent `/reversa` immediately uses the fast path (G14).
4. On decline: writes a fingerprint object to `state.json` `cs_agent_enablement_dismissed`.

Negative test: when `detect` returns no profiles, the installer skips the prompt silently (no message about cs-agent at all).

### G11 — Orchestrator prompt path (Scenario B) with fingerprinted dismissal

In a session where Scout has recorded `cs_agent_profile_detected` and config is off:

- The orchestrator prompts verbatim per [02-skill-stubs.md](02-skill-stubs.md) §3.B.
- Multi-profile (G4): the orchestrator presents the picker first; persists chosen profile in the fingerprint.
- On `n`: writes `state.cs_agent_enablement_dismissed = { fingerprint: { profile, ot_home, executable_path, help_sha256 }, dismissed_at: <iso> }`.
- Re-running `/reversa` with the same fingerprint: orchestrator skips the prompt (matches dismissal).
- Re-running `/reversa` after changing the cs-agent executable (different `help_sha256`): orchestrator re-asks.
- Re-running `/reversa` after switching active profile in cs-agent (different `profile`): orchestrator re-asks.
- On `y`: writes config + runs `reversa content-server snapshot --profile <name>` + `reversa content-server inventory --write` synchronously. The user sees the new `## CS Profile (cs-agent)` block in `inventory.md` in this same session.

### G12 — Skip-deep-walk fires only when enabled AND snapshot succeeded

Two Scout runs on a fixture where `<workdir>/srcmodules/` contains > 1000 files:

- Run A: `enabled = false` → Scout's `surface.json.modules` contains many entries derived from the deep walk; the CS Profile section is not rendered.
- Run B: `enabled = true` AND snapshot succeeds → Scout's `surface.json.modules` contains exactly one stub `{ "module": "<srcmodules tree, cs-agent managed>", ..., "srcdir": "<abs path>" }`, the deep walk under that exact path was skipped, and the CS Profile section is rendered.
- Run C: `enabled = true` but snapshot fails (simulate by pointing config at a non-existent executable) → Scout falls back to the full walk; signals contain `cs_agent_snapshot_failed`; CS Profile section is NOT rendered.

### G13 — Inventory block is idempotent and semantically correct

Running `reversa content-server inventory --write` against a fixture inventory.md:

- First invocation: appends the block. `inventory.md` ends with `<!-- reversa:cs-profile:end -->`.
- Second invocation immediately after: replaces the block. `inventory.md` still has exactly **one** pair of `<!-- reversa:cs-profile:begin -->` and `<!-- reversa:cs-profile:end -->` markers, with **one** `## CS Profile (cs-agent)` heading inside.
- Third invocation after manually editing content **outside** the markers: the user's edits are preserved; the block inside the markers is refreshed.
- Fourth invocation after manually corrupting the begin marker only (delete the end marker): the writer replaces from the begin marker to EOF (defensive — but acceptable consequence is the user lost any post-block manual edits; document this).

Semantic assertions on the block content (replace v1's character-level diff):

- Section heading is exactly `## CS Profile (cs-agent)`.
- Contains lines for `Profile`, `ot_home`, `cs-agent workdir`, `CSGraph schema`, `Indexed`, `Extraction errors`.
- Numbers match the values in `.reversa/context/cs-agent/graph-status.json` exactly.
- Top-modules table has up to 10 rows, sorted by descending `count`, drawn from `graph_status.status.countsByModule`.
- Unresolved-references table has rows for each kind present in `graph_status.status.unresolvedRefsByKind`.
- Confidence-breakdown table maps the four cs-agent labels per [00-conception.md](00-conception.md) §6.
- Final `> Source:` line cites `_meta.collected_at`.
- If `_meta.collected_at` is older than `snapshot_ttl_days`, the block starts with the stale callout per [02-skill-stubs.md](02-skill-stubs.md) §2.B §C.

### G14 — Total Scout time on CS253 < 60 seconds (enabled path)

On a developer machine with cs-agent already initialized, scenario A first run and scenario B second run:

- Scout total duration from start to inventory rendered must be under 60 seconds.
- This bound includes detect probe, three snapshot calls (`graph status` observed ~3 s), JSON parse, `validateSnapshotMeta`, inventory render, atomic writes.

Phase 1 ships only if this stays under 60 s on the reference host. If a future cs-agent update inflates `graph status` past this, revisit the bound.

### G15 — CLI is discoverable

```
npx @pnocera/reversa --help
```

Output includes a line for `content-server` with a short summary.

```
npx @pnocera/reversa content-server --help
```

Output lists all five subcommands: `probe`, `detect`, `snapshot`, `inventory`, `doctor`. Each subcommand's own `--help` documents its flags.

### G16 — Fallback on adapter failure leaves Reversa working

- If `resolveExecutable` throws `executable_not_found` during Scout's detect: Scout completes its phase normally (deep walk, normal modules, normal inventory) and records `cs_agent_probe_failed`. The rest of `/reversa` proceeds unaffected.
- If `collectSnapshot` throws `snapshot_partial`: Scout drops the skip-deep-walk branch, records `cs_agent_snapshot_failed`, continues with the generic flow. CS Profile section is not rendered.
- If `validateSnapshotMeta` returns `{ ok: false, problems: [{ code: "missing_data_file" }] }`: `reversa content-server inventory --write` exits with code 5 and a clear message ("snapshot incomplete — run `reversa content-server snapshot` to refresh"). Scout treats this as a non-fatal warning and continues.

### G17 — Audit log is appended and rotated

After any successful CLI run, `.reversa/context/cs-agent/adapter.log` exists with one line per `runReadOnly` invocation in the format documented in [01-adapter-api.md](01-adapter-api.md) §A.7. Failed calls also produce log lines.

Rotation: feeding the adapter > 5 MB of log lines (simulated in unit tests) results in the oldest ~25 % being dropped. The file never exceeds ~6 MB after rotation cycles.

`lib/commands/uninstall.js` test: after uninstall, `.reversa/context/cs-agent/` no longer exists.

---

## 3. Soft gates (nice to have; don't block release)

| | Soft gate |
|---|---|
| S1 | Doctor command (`reversa content-server doctor`) prints the summary screen described in [02-skill-stubs.md](02-skill-stubs.md) §1 "Diagnostic command", including drift deltas against the previous snapshot. |
| S2 | When the help signature SHA changes between probe calls (test by swapping the cs-agent binary), the doctor command warns "executable changed since last snapshot — counts may be stale". |
| S3 | When `_meta.collected_at` is older than `snapshot_ttl_days`, the inventory block starts with the stale callout. |
| S4 | `reversa content-server detect --json` on a host with two profiles returns both, with the active one flagged. |
| S5 | `.gitignore` recommendation: installer can append `.reversa/context/cs-agent/` to the project's `.gitignore` when integration is enabled (opt-in). |

---

## 4. Sample artifact — passing CS Profile block on `E:\CS253`

Captured against live CS253 on 2026-05-24. The implementer should save the actual emitted block after their first successful end-to-end run as `proof/sample-inventory.md` for future regression baselining.

```markdown
<!-- reversa:cs-profile:begin -->
## CS Profile (cs-agent)

- Profile: `CS253`
- Content Server install (`ot_home`): `E:\CS253`
- cs-agent workdir: `E:\CS253_workdir`
- CSGraph schema: v3
- Indexed: 34,171 source files, 940,729 nodes, 2,251,241 edges, 24,227 support assets, across 148 modules
- Extraction errors: 82 files (cs-agent surfaced these — review with `cs-agent` directly if non-zero)

### Top modules (by node count)

| Module | Nodes |
|---|---|
| `xenggis` | 8,125 |
| `docviewer` | 4,914 |
| `csui` | 1,838 |
| `core` | 1,154 |
| `salesforceinterface` | 537 |
| `guienhancements` | 529 |
| `help` | 374 |
| `__platform__` | 357 |
| `otsapxecm` | 326 |
| `xecmpf` | 236 |

### Unresolved references (candidate gaps for human review)

| Kind | Count |
|---|---|
| `feature_call` | 480,631 |
| `uses_xlate` | 143,876 |
| `type` | 55,740 |
| `ambiguous_call` | 22,148 |
| `template` | 8,675 |
| `asset` | 40 |

### Confidence breakdown (cs-agent edge labels)

| cs-agent label | Reversa mapping | Count |
|---|---|---|
| `resolved` | 🟢 CONFIRMED | 2,058,117 |
| `intrinsic` | 🟢 CONFIRMED (built-in) | 65,944 |
| `multi_candidate` | 🟡 INFERRED (ambiguous) | 109,483 |
| `inferred` | 🟡 INFERRED | 17,697 |

> Source: `.reversa/context/cs-agent/graph-status.json` collected 2026-05-24T08:01:12Z. Refresh with `/reversa-content-server`.
<!-- reversa:cs-profile:end -->
```

If the snapshot is stale (older than `snapshot_ttl_days`), the block starts with:

```markdown
<!-- reversa:cs-profile:begin -->
> ⚠️ This section is based on a snapshot from `2026-05-15T08:00:00Z` (9 days old). Run `reversa content-server snapshot` to refresh.

## CS Profile (cs-agent)
…
```

---

## 5. Test plan

| Layer | What | Where | Gate(s) |
|---|---|---|---|
| Unit (adapter) | `lib/integrations/cs-agent.js` with stubbed `child_process.spawn` | `lib/integrations/__tests__/cs-agent.test.js` | G1 (resolution), G3 (allowlist + profile_required), G6 (commit-marker order), G7 (argv), G17 (log rotation) |
| Unit (CLI) | `lib/commands/content-server.js` argv parsing, subcommand dispatch, idempotent inventory writer | `lib/commands/__tests__/content-server.test.js` | G13 (inventory idempotency, semantic block content), G15 (help text), G17 (uninstall removes log) |
| Integration (live cs-agent) | Scripted test against `F:\smoke\CS253\cs-agent.exe`, gated by `RUN_CS_AGENT_TESTS=1` | `scripts/test-cs-agent-integration.mjs` | G2 (probe), G4 (detectProfile), G5 (graph status numbers), G6 (commit-marker happy path) |
| End-to-end (manual, recorded) | Scenarios A and B on `E:\CS253` | Manual run; transcript saved under `work/01-cs-agent-specialized/proof/` | G8–G14, G16, S1–S5 |

CI runs unit only. Integration and end-to-end are run by the maintainer pre-release; transcripts checked in alongside the conception so reviewers can audit the actual behavior.

---

## 6. What happens after phase 1 ships

Phase 1 is the gating event for everything downstream. The conception folder grows incrementally:

- A new subfolder per phase: `conception/phase-2-module-dossiers/`, `conception/phase-3-extensions/`, etc.
- Each downstream phase defines its own acceptance criteria using this document as the template.
- The first phase-2 conception writes itself only after phase 1 is in use against at least one real CS project for one week, and the maintainer collects feedback on the inventory block.

Until then, no new artifacts are generated from cs-agent data. The temptation to slide into "well, while we're here, let's add the extension-points file" is real — resist it. Phase 1 ships standalone or not at all.
