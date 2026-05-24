# Adapter + CLI API — phase 1 (v2)

> **v2 — applied codex review** (`../reviews/2026-05-24-codex-conception-review.md`, 2026-05-24). Key changes from v1:
> - Added an explicit **CLI surface** (`lib/commands/content-server.js` + registration in `bin/reversa.js`). Markdown skills shell the CLI; the CLI calls the JS adapter.
> - Added **`detectProfile()`** as the one allowed profile-less call. `runReadOnly()` still requires `--profile` — the distinction is enforced at the JS API layer.
> - **Removed `CSWORKS_ROOT` env fallback** from `resolveExecutable()`. Resolution is now `config.user.toml → config.toml → caller-dir → PATH`.
> - **`probe()` now captures executable trust evidence** (path, mtime, size, help signature). This evidence flows into `_meta.json` and into doctor output.
> - **`collectSnapshot()` writes `_meta.json` last as a commit marker**. Snapshot readers MUST validate `_meta.json` before consuming the data files.
> - New helper `renderInventorySection({ snapshotDir })` that the CLI uses to write the idempotent block.
> - **Audit log moved** from `.reversa/cs-agent.log` to `.reversa/context/cs-agent/adapter.log` with a 5 MB rotation cap and explicit uninstall handling.

This document covers **two layers**:

1. **`lib/integrations/cs-agent.js`** — the JS adapter. The trust boundary. Not imported by Markdown skills.
2. **`lib/commands/content-server.js`** + `bin/reversa.js` registration — the CLI surface. The contract skills consume.

Both layers ship in phase 1.

---

## A. JS adapter — `lib/integrations/cs-agent.js`

### A.1 Module shape

ES module (matches the rest of `lib/`, which is `"type": "module"`):

```js
// lib/integrations/cs-agent.js

export {
  resolveExecutable,
  probe,
  detectProfile,        // NEW in v2 — the one profile-less path
  runReadOnly,
  collectSnapshot,
  renderInventorySection, // NEW in v2 — used by `content-server inventory --write`
  validateSnapshotMeta, // NEW in v2 — readers call this before consuming
  isReadOnlyAllowed,
  AdapterError,
  ADAPTER_VERSION,
};
```

No default export. No re-export of `child_process` or `fs`. The CLI imports this; Markdown skills do not.

### A.2 Configuration inputs

The adapter is pure with respect to configuration files — the caller (CLI) reads TOML and passes resolved values.

| Source | Value | Required for |
|---|---|---|
| `config.user.toml` `[integrations.cs_agent].executable` (or `config.toml` fallback) | Absolute path to `cs-agent.exe` | `resolveExecutable` |
| `config.toml` `[integrations.cs_agent].profile` | cs-agent profile name (e.g. `CS253`) | `runReadOnly`, `collectSnapshot` (NOT `detectProfile` or `probe`) |
| `config.toml` `[integrations.cs_agent].snapshot_ttl_days` | Integer days | `validateSnapshotMeta` (when caller wants staleness check) |

### A.3 Public API

#### `resolveExecutable(opts)`

```ts
resolveExecutable(opts: {
  configured?: string;   // from config.user.toml or config.toml
}): Promise<string>      // absolute path
                         // throws AdapterError('executable_not_found')
```

Resolution order (`CSWORKS_ROOT` removed in v2):

1. `opts.configured` if provided and exists on disk.
2. `path.join(<dir of caller's process>, "cs-agent.exe")` — covers Reversa running from inside the cs-agent package folder.
3. PATH lookup (`where` on Windows, `which` elsewhere).

If the chosen candidate came from PATH (not configured), the function still returns the path but also signals via `process.env.REVERSA_CS_AGENT_RESOLVED_FROM = "PATH"` so the CLI can print an "inferred from PATH; pin in config.user.toml" hint. The adapter itself does not print.

#### `probe(executable)`

```ts
probe(executable: string): Promise<{
  ok: true,
  helpSignatureSha256: string,
  commandCount: number,
  topics: string[],
  executableTrust: {
    path: string,
    mtimeIso: string,
    sizeBytes: number,
    helpSignatureSha256: string,
  },
}>
// throws AdapterError on any failure
```

Calls `cs-agent help --json` once. Parses the single envelope. Computes SHA-256 of the raw stdout (cached per executable path for the Node process). The `executableTrust` block captures the path, mtime, size, and the help signature — this is what `_meta.json` will record.

`probe()` is **profile-less by design**: `help --json` is a profile-agnostic command and the adapter exempts it from the `--profile` requirement.

#### `detectProfile(executable)` — NEW in v2

```ts
detectProfile(executable: string): Promise<{
  ok: true,
  active: string | null,
  profiles: Array<{
    name: string,
    ot_home: string,
    workdir: string,
    schema_version: number,
    path_checks_green: boolean,
    raw: object,           // full profile-info envelope for the active profile only
  }>,
}>
// throws AdapterError on any failure
```

The **only** runReadOnly-style call that is allowed to omit `--profile`. Internally:

- Calls `cs-agent profile info --json` (no `--profile`). This returns active profile data plus the registry list.
- Walks the registry. For each entry, calls `cs-agent profile info --json --profile <name>` and aggregates the result. (Skips the active one if already loaded.)
- Returns the aggregated list plus the active name.

This is the only mechanism to discover what profiles exist before any is selected. Calling `runReadOnly` profile-less is a hard error (`unclassified_command`).

If the registry has zero profiles: returns `{ ok: true, active: null, profiles: [] }`. Caller decides how to surface (typically: tell user to run `cs-agent init`).

If the registry has 2+ profiles: returns all of them. Caller decides how to disambiguate (typically: ask the user). The adapter does NOT silently pick the first.

#### `runReadOnly(topic, command, opts)`

```ts
runReadOnly(
  topic: string,
  command: string,
  opts: {
    profile: string,             // REQUIRED; throws if empty/missing
    executable: string,          // REQUIRED
    args?: string[],
    flags?: Record<string,string|boolean>,
    timeoutMs?: number,
    logPath?: string,            // default .reversa/context/cs-agent/adapter.log
  }
): Promise<unknown>              // envelope's `data` field
```

Same behavior as v1 with one change: the adapter validates `opts.profile` is a non-empty string before doing anything. Missing profile → `AdapterError('profile_required')` without spawning.

The allowlist enforcement, single-envelope parsing, timeout, and `profile_mismatch` check are unchanged from v1.

#### `collectSnapshot(opts)`

```ts
collectSnapshot(opts: {
  executable: string,
  profile: string,
  outDir: string,        // absolute path to .reversa/context/cs-agent/
  snapshotTtlDays?: number,   // default 7; written into _meta.json
  timeoutMs?: { profile?: number, graph?: number, docs?: number },
  logPath?: string,
}): Promise<{
  ok: true,
  metaPath: string,
  snapshotFiles: { profileInfo: string, graphStatus: string, docsCategories: string },
  collectedAt: string,
  executableTrust: { path: string, mtimeIso: string, sizeBytes: number, helpSignatureSha256: string },
}>
// throws AdapterError on partial failure
```

Updated semantics (v2):

1. Create staging dir `outDir/.staging-<uuid>/`.
2. Call `probe(executable)` (cached) to capture executable trust.
3. Call the three read-only endpoints sequentially. Each result is written to a tempfile in staging, then renamed to its final name within staging.
4. If any call fails: throw `AdapterError('snapshot_partial', { successes: [...], failure: {...} })`. Do NOT publish anything.
5. Build `_meta.json` with full provenance:

   ```json
   {
     "adapter_version": "0.1.0",
     "profile": "CS253",
     "collected_at": "2026-05-24T08:01:12.345Z",
     "snapshot_files": {
       "profile_info": "profile-info.json",
       "graph_status": "graph-status.json",
       "docs_categories": "docs-categories.json"
     },
     "schema_version_observed": 3,
     "snapshot_ttl_days": 7,
     "executable_trust": {
       "path": "F:\\smoke\\CS253\\cs-agent.exe",
       "mtime_iso": "2026-05-20T10:00:00.000Z",
       "size_bytes": 87654321,
       "help_signature_sha256": "abc123…"
     }
   }
   ```

6. **Commit phase** — atomic publish in this exact order:

   a. Move each of the three data files from staging to `outDir/`.

   b. Last: move `_meta.json` from staging to `outDir/`. This is the commit marker. If the process dies between step (a) and step (b), readers will see no `_meta.json` (or the stale previous one) and refuse to consume.

7. Remove the staging directory.

If a previous `_meta.json` exists in `outDir/`, it is overwritten in step (b). Readers reading mid-write would see either the old `_meta.json` (referencing old files that are now overwritten — handled by step (a) preserving file names, content fresh) or the new `_meta.json` (referencing files that now exist with new content). Either way, the marker is the truth.

#### `validateSnapshotMeta(metaPath, opts)` — NEW in v2

```ts
validateSnapshotMeta(metaPath: string, opts?: {
  snapshotTtlDays?: number,
  currentHelpSignatureSha256?: string,   // pass to detect executable drift since collection
}): {
  ok: boolean,
  meta?: object,
  problems: Array<{
    code: string,        // "missing_meta", "unparseable", "missing_data_file", "stale", "executable_drift"
    detail: string,
  }>,
  stale: boolean,
  executableDrift: boolean,
}
// synchronous; pure file-system check
```

The canonical reader-side guard. Used by:

- `renderInventorySection` (refuses to render when validation fails).
- Scout (decides whether to skip the deep walk).
- Doctor command (reports drift).

#### `renderInventorySection(opts)` — NEW in v2

```ts
renderInventorySection(opts: {
  snapshotDir: string,         // .reversa/context/cs-agent/
  inventoryPath: string,       // _reversa_sdd/inventory.md (or absolute)
  mode: "write" | "print",
  snapshotTtlDays?: number,
  logPath?: string,
}): Promise<{
  ok: true,
  action: "appended" | "replaced" | "printed",
  inventoryPath?: string,      // only when mode === "write"
  bytesWritten?: number,
  stale: boolean,
}>
// throws AdapterError if snapshot invalid
```

Reads snapshots via `validateSnapshotMeta`. Refuses if invalid. Computes the markered block:

```markdown
<!-- reversa:cs-profile:begin -->
## CS Profile (cs-agent)
…
<!-- reversa:cs-profile:end -->
```

Mode `write`:

- Reads existing `inventoryPath`. If it contains a `<!-- reversa:cs-profile:begin -->`…`<!-- reversa:cs-profile:end -->` block (even partial — match the begin marker and replace through the next end marker, or to EOF if missing), replace it. Otherwise append at end.
- Atomic write (tempfile + rename).
- Returns `action: "appended" | "replaced"`.

Mode `print`:

- Writes the block to stdout (via return value). Inventory file is not touched.
- Returns `action: "printed"`.

If the snapshot is stale (older than `snapshotTtlDays`), the rendered block has a leading callout:

```markdown
> ⚠️ This section is based on a snapshot from `<collected_at>` (`<N>` days old). Run `reversa content-server snapshot` to refresh.
```

#### `isReadOnlyAllowed(topic, command)`

Unchanged from v1. Pure predicate.

#### `AdapterError`

```ts
class AdapterError extends Error {
  code: string;             // see table in §A.5
  details?: object;
  cause?: Error;
}
```

#### `ADAPTER_VERSION`

```ts
const ADAPTER_VERSION = "0.1.0";
```

Recorded in `_meta.json` so future readers know which adapter wrote the snapshot.

### A.4 Read-only allowlist (phase 1)

```js
const READ_ONLY_ENABLED = Object.freeze({
  profile: new Set(["info"]),
  graph:   new Set(["status"]),
  docs:    new Set(["categories"]),
});

// detectProfile() is the only call allowed to invoke `profile info` without --profile;
// it is handled by a separate code path, not by isReadOnlyAllowed().
```

Phase-2-reserved entries are defined as comments only (not in `READ_ONLY_ENABLED`) so they remain visible to reviewers without becoming live affordances:

```js
// Phase 2+ candidates (must be added to READ_ONLY_ENABLED with explicit review):
//   graph: search, module, subclasses, extension-points, kinds, callers
//   docs:  search, concept, cross-ref
//   code:  status
```

Adding a new read-only command in phase 2 requires editing `READ_ONLY_ENABLED` and the test asserting its contents. Two-touch is intentional.

### A.5 Error codes (v2 additions in **bold**)

| `error.code` | When | Caller (CLI) should |
|---|---|---|
| `executable_not_found` | None of the resolution candidates exist | Skip; tell user to set `executable` in `config.user.toml`. |
| **`profile_required`** | `runReadOnly` called with empty/missing profile | Bug — surface loudly. |
| `unclassified_command` | Caller passed a topic/command outside the allowlist | Bug — surface loudly. |
| `spawn_failed` | `child_process.spawn` itself failed | Surface; possible permissions or antivirus issue. |
| `timeout` | Command exceeded `timeoutMs` | Surface; for snapshot collection, fall back. |
| `empty_stdout` | cs-agent exited 0 but printed nothing | Surface; do not retry. |
| `multi_envelope` | > 1 top-level JSON envelope on stdout | Bug in cs-agent or wrong binary. Surface. |
| `cs_agent_error` | Envelope had `ok: false` | Map `details.failureCode` to friendly message. Common: `PROFILE_NOT_FOUND`. |
| `profile_mismatch` | Returned envelope's `profile` differs from request | Bug. Surface. |
| `exit_nonzero` | Process exited non-zero without parseable envelope | Surface stderr. |
| `snapshot_partial` | `collectSnapshot` succeeded on some calls but not others | Discard partials; fall back. |
| **`snapshot_meta_missing`** | Reader called `validateSnapshotMeta` on a path with no `_meta.json` | Treat as no snapshot. |
| **`snapshot_meta_invalid`** | `_meta.json` parseable but malformed | Treat as no snapshot; warn user about possible corruption. |
| **`snapshot_data_missing`** | `_meta.snapshot_files` references files that don't exist next to it | Treat as no snapshot; suggest re-snapshot. |
| **`inventory_render_blocked`** | `renderInventorySection` called when validation failed | Skip write; surface the underlying validation problem. |

### A.6 Profile passthrough rules (v2)

1. `runReadOnly` requires non-empty `opts.profile`. Asserted before spawn.
2. `detectProfile` is the only profile-less path. It is the sole way to discover the registry without already knowing a name.
3. `probe` is profile-agnostic (`help --json`). Treated separately from both.
4. cs-agent's `profile` field in the returned envelope is verified against the request (for `runReadOnly`). Mismatch → `profile_mismatch`.
5. The adapter never calls `cs-agent profile set`. Reversa never mutates cs-agent's active profile.

### A.7 Audit log — `.reversa/context/cs-agent/adapter.log` (v2 location)

Every adapter call appends one line. Format unchanged from v1:

```
2026-05-24T08:01:12.345Z  ok    profile info     profile=CS253  duration_ms=412
2026-05-24T08:01:13.901Z  ok    graph status     profile=CS253  duration_ms=2876
2026-05-24T08:01:14.122Z  fail  docs categories  profile=CS253  duration_ms=104   code=cs_agent_error  failure=PROFILE_NOT_FOUND
```

Tabs between columns; no JSON payloads.

**Retention** (new in v2): when the log exceeds 5 MB on append, the adapter truncates the file by dropping the oldest ~25 % of lines (keep header position, find a line boundary). No external rotation tools required.

**Uninstall handling**: `lib/commands/uninstall.js` removes the entire `.reversa/context/cs-agent/` directory, including the log. The integration leaves no orphan files.

**Privacy note**: the log contains profile name, command names, and durations. It does NOT contain command stdout (which can be large and contain absolute paths and code identifiers). Operators wanting to debug a failure rerun the command manually. Document that `.reversa/context/cs-agent/` is not meant to be committed; the installer adds it to `.gitignore`.

### A.8 Caching policy

- `probe()` result and computed `helpSignatureSha256` cached in-process keyed by executable path.
- Snapshot files cached on disk (governed by `collectSnapshot` + `validateSnapshotMeta`).
- No in-memory cache of snapshot data. Each reader call goes to disk.

### A.9 Timeout defaults

| Call | Default | Why |
|---|---|---|
| `probe` (`help --json`) | 5 s | Should be instant. |
| `detectProfile` | 30 s | Walks the registry; slow if many profiles. |
| `runReadOnly("profile", "info")` | 10 s | Disk + registry, no compute. |
| `runReadOnly("graph", "status")` | 5 min | Observed ~3 s on CS253; larger profiles could be slow. |
| `runReadOnly("docs", "categories")` | 30 s | Reads CSDoc index. |
| `runReadOnly` default | 30 s | Mid-range. |

### A.10 What the adapter deliberately does NOT do

(Unchanged from v1, with additions.)

- Read/write TOML. CLI does that and passes resolved values.
- Mutate cs-agent state.
- Retry on failure.
- Translate cs-agent errors into success-with-degraded-data.
- Pretty-print for users.
- Schedule background work.
- Run as a long-lived process.
- **Register itself with the CLI** — the CLI imports it; the adapter is unaware of being CLI-fronted.
- **Render UI prose** like the inventory block headings — those live in `renderInventorySection` which is templated but pure-function; no console output.

---

## B. CLI surface — `lib/commands/content-server.js` + `bin/reversa.js`

### B.1 Subcommand tree

Registered in `bin/reversa.js` under the `content-server` namespace:

```
reversa content-server probe                 # one-shot probe; prints summary + JSON
reversa content-server detect                # one-shot detectProfile; prints registry summary
reversa content-server snapshot              # collect snapshot to .reversa/context/cs-agent/
reversa content-server inventory             # render the CS Profile section
reversa content-server doctor                # probe + snapshot + drift report
```

Each subcommand accepts `--json` for machine-readable output and `--quiet` for minimal stdout. Default output is human-readable.

### B.2 Subcommand contracts

#### `reversa content-server probe`

```
reversa content-server probe [--json] [--quiet] [--executable <path>]
```

Calls `resolveExecutable` (using `--executable` if given, else config), then `probe`.

Human output:

```
cs-agent: F:\smoke\CS253\cs-agent.exe (3.4 MB, mtime 2026-05-20T10:00:00Z)
  topics: init build code csdoc csui dev docs edit graph lint mcp module profile runs source test xlate
  commands: 113
  help signature: abc123…
  status: ok
```

`--json` returns the `probe()` result envelope including `executableTrust`.

Exit codes: 0 = ok, 2 = `executable_not_found`, 3 = other adapter error.

#### `reversa content-server detect`

```
reversa content-server detect [--json] [--quiet] [--executable <path>]
```

Calls `detectProfile`. Lists profiles:

```
cs-agent: F:\smoke\CS253\cs-agent.exe
  active profile: CS253
  profiles in registry:
    * CS253   ot_home=E:\CS253           workdir=E:\CS253_workdir            path_checks=green
      OTHER  ot_home=E:\OTHER           workdir=E:\OTHER_workdir            path_checks=green
```

If there are 2+ profiles and `--json` is not set, the human output includes the line `> Multiple profiles. Use --profile <name> on subsequent commands to pin.` The command itself never auto-picks.

#### `reversa content-server snapshot`

```
reversa content-server snapshot [--json] [--quiet]
  [--profile <name>]              # falls back to config[integrations.cs_agent].profile
  [--out-dir <path>]              # falls back to .reversa/context/cs-agent/
  [--executable <path>]
  [--ttl-days <int>]
```

Calls `collectSnapshot`. On success prints:

```
snapshot ok
  profile: CS253
  out:     <abs path>/.reversa/context/cs-agent/
  files:   profile-info.json (12 KB), graph-status.json (87 KB), docs-categories.json (4 KB)
  meta:    _meta.json (commit marker)
  trust:   executable mtime 2026-05-20T10:00:00Z, help_sha256 abc123…
```

Exit codes: 0 = ok, 4 = `snapshot_partial` (partial = failure), other adapter codes → 3.

#### `reversa content-server inventory`

```
reversa content-server inventory [--json] [--quiet]
  [--write | --print]                       # default --write
  [--inventory-path <path>]                 # default _reversa_sdd/inventory.md from config[output].folder
  [--snapshot-dir <path>]
```

Calls `renderInventorySection`. With `--write` (default), updates the markered block idempotently. With `--print`, writes the block to stdout.

Exit codes: 0 = ok, 5 = `inventory_render_blocked` (snapshot invalid), 3 = other adapter error.

#### `reversa content-server doctor`

```
reversa content-server doctor [--json] [--quiet]
```

Composite: probe → snapshot → diff against previous snapshot (read into memory before overwrite). Prints the one-screen summary described in [00-conception.md](00-conception.md) §5.8. Does not touch `inventory.md`.

Exit codes: 0 = ok (including warnings), 3 on hard adapter failure.

### B.3 Help integration

`bin/reversa.js` (current entry point) needs:

```js
// existing top-level help string gets a new line:
//   content-server  Manage the cs-agent integration (probe, detect, snapshot, inventory, doctor)

// existing command dispatcher gets:
case 'content-server':
  await import('../lib/commands/content-server.js').then(m => m.run(restArgs));
  break;
```

And `reversa content-server --help` prints:

```
Usage: reversa content-server <subcommand> [options]

Subcommands:
  probe        Probe cs-agent executable; show topics and help signature
  detect       List cs-agent profiles available on this host
  snapshot     Collect read-only snapshots into .reversa/context/cs-agent/
  inventory    Render the CS Profile section into inventory.md
  doctor       Refresh snapshots and report drift

Run `reversa content-server <subcommand> --help` for subcommand options.
```

### B.4 CLI invariants

- Every subcommand validates config before calling the adapter (refuses if `[integrations.cs_agent].enabled = false` for `snapshot`/`inventory`/`doctor`; `probe` and `detect` work without enablement so the installer/orchestrator can use them).
- Every subcommand pins `--profile` from config when not given on the command line. If config has no profile and the command needs one: refuse with a helpful message ("Run `reversa content-server detect` and set `[integrations.cs_agent].profile` in `config.toml`.").
- Every subcommand catches `AdapterError`, maps to a human-readable message + appropriate exit code.
- `--json` mode emits one envelope: `{ ok, action, data?, error? }`. No mixed output.
- No subcommand mutates `config.toml`, `config.user.toml`, or `state.json` (config-writing is the installer's and orchestrator's responsibility).

### B.5 What the CLI deliberately does NOT do

- Re-implement adapter logic (the CLI is thin — argv parsing, config reading, output formatting).
- Expose any cs-agent command outside the read-only allowlist via flags or escapes.
- Auto-enable the integration.
- Background-refresh snapshots (no daemon).
- Output cs-agent stdout directly (each command's output is summarized; `--json` returns adapter-cleaned envelopes).

---

## C. Phase 2+ surface (documented to show why phase 1 is enough)

The adapter and CLI shapes above explicitly accommodate phase 2 without further design churn:

- New read-only commands: add to `READ_ONLY_ENABLED`, add CLI subcommand (e.g. `reversa content-server module <name>`), reuse `runReadOnly`.
- Workflow side-effect commands: a new exported function `runWorkflowSideEffect(topic, command, opts)` enforces explicit `opts.userAuthorized: true`, separate denylist, more aggressive logging. Not in phase 1 source.
- HUMAN_ONLY commands: never get a JS function. The CLI may grow a `reversa content-server install-help` that prints copy-pasteable command lines for the user. Not in phase 1.
- MCP transport: a parallel `runReadOnlyMcp` could be added when `[integrations.cs_agent].mcp_command` is configured. Not in phase 1.

None of these require breaking changes to the v2 surface.
