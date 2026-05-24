# Conception — Reversa × cs-agent integration (Phase 1, v2)

> Design document for the phase-1 beachhead defined in [../03-proposal.md](../03-proposal.md). One product increment: **Reversa recognizes a cs-agent profile (e.g. CS253) and writes a CS-aware section into `inventory.md` from cached cs-agent evidence**.
>
> **v2 — applied codex review** (`../reviews/2026-05-24-codex-conception-review.md`, 2026-05-24). Key changes from v1:
> - Skills no longer call the JS adapter directly. A **CLI surface** `reversa content-server <subcommand>` mediates every call. The Markdown skill shells the CLI; the CLI calls `lib/integrations/cs-agent.js`. Wired in `bin/reversa.js` as part of phase 1, not deferred.
> - Profile detection has its own API path. `detectProfile()` is profile-less and explicitly allowed; `runReadOnly()` keeps its strict `--profile <name>` requirement. Multi-profile detection asks rather than silently picking the first.
> - The acceptance flow distinguishes **installer-enabled first run** (fast) from **orchestrator-detected migration** (two-run: detect+ask, then fast). The v1 doc promised both implicitly; v2 names them.
> - Snapshots use **`_meta.json` as commit marker**. Readers ignore files not referenced by a fresh, valid `_meta.json`. Per-file atomic rename remains; coherent-set guarantee comes from the marker.
> - Inventory section is rendered as an **idempotent block between stable markers**, replaced on every run. No more "append-only".
> - Dismissal of the enable prompt is **fingerprinted** (profile + ot_home + executable + help signature) instead of a bare boolean. Re-asks when the fingerprint changes.
> - `_meta.json` records executable **path + mtime + size + help signature** so stale-binary diagnosis is explicit.
> - The audit log moves to `.reversa/context/cs-agent/adapter.log` with a documented size cap and uninstall behavior.
> - `CSWORKS_ROOT` env fallback removed. Executable resolution is explicit: `config.user.toml → config.toml → caller dir → PATH`.
>
> Companion docs in this folder:
> - [01-adapter-api.md](01-adapter-api.md) — adapter + CLI wrapper contract
> - [02-skill-stubs.md](02-skill-stubs.md) — drop-in markdown for `reversa-content-server`, Scout / orchestrator / installer patches, and CLI command registration
> - [03-phase-1-acceptance.md](03-phase-1-acceptance.md) — acceptance criteria + sample artifact

---

## 1. Purpose

Make Reversa's first encounter with an OpenText Content Server source tree fast, correct, and citable, by delegating structural discovery to cs-agent instead of re-walking 34,171 files with generic AST guesses.

The deliverable is one new section in `_reversa_sdd/inventory.md` named `## CS Profile (cs-agent)` populated with real CSGraph counts. It is rendered between stable markers and replaced idempotently on every run.

## 2. In scope (phase 1)

| In | Out |
|---|---|
| Detect cs-agent + initialized profile via a **CLI surface** | Run `cs-agent init` from Reversa (human-only) |
| New CLI subcommand tree under `npx @pnocera/reversa content-server` (`probe`, `detect`, `snapshot`, `doctor`, `inventory`) | Generic JS module imports from Markdown skills |
| Profile-less `detectProfile()` for first-run discovery | `runReadOnly()` calls without `--profile` |
| Read-only calls (when profile known): `help`, `profile info`, `graph status`, `docs categories` | Any side-effecting cs-agent command |
| Cache the three snapshots under `.reversa/context/cs-agent/` with `_meta.json` as commit marker | Generate per-module dossiers, ERD, permissions, state machines, route catalog, override map, dispatch map |
| Pre-Scout enablement check; skip Scout's deep `srcmodules/` walk when enabled | Modify Archaeologist / Detective / Architect / Forward / Coding agents |
| Render `## CS Profile (cs-agent)` idempotent block in `inventory.md` | Generate any other spec file from cs-agent data |
| `config.toml` + `config.user.toml` schema for `[integrations.cs_agent]` | MCP transport for cs-agent |
| **Installer prompt** during fresh `install` when probe succeeds (preferred enablement path) | Auto-enabling persistent config from Scout |
| **Orchestrator migration prompt** for already-installed projects, with fingerprinted dismissal | Re-asking on every session |
| Workflow / side-effect bucket and HUMAN_ONLY emit-only path documented but **not implemented** in phase 1 | Side-effect calls (`dev`, `csui`, `build`, `lint`, `test`) — not exposed |
| Failure-mode handling (clear messages, fail closed, fall back to generic Reversa flow) | Retries, circuit breakers, queueing |

## 3. Component map

```
┌─────────────────────────────────────────────────────────────────────┐
│  Markdown skills (read by the AI agent)                              │
│                                                                      │
│  ┌────────────────┐  ┌─────────────────────────────────────┐         │
│  │  reversa       │  │  reversa-content-server             │         │
│  │  (orchestrator)│──▶  (shared contract; references CLI) │         │
│  │  + migration   │  │  + doctor command (shells CLI)     │         │
│  │    prompt      │  └──────────────────┬──────────────────┘         │
│  └────────┬───────┘                     │                            │
│           │                             │                            │
│           ▼                             ▼                            │
│  ┌────────────────┐                                                  │
│  │  reversa-scout │── shells CLI for probe/detect/snapshot/inventory │
│  │  (patched)     │                                                  │
│  └────────┬───────┘                                                  │
└───────────┼──────────────────────────────────────────────────────────┘
            │                                                          
            ▼  (skills call CLI; never import JS)                      
┌─────────────────────────────────────────────────────────────────────┐
│  CLI surface — bin/reversa.js                                        │
│                                                                      │
│  reversa content-server probe                                        │
│  reversa content-server detect                                       │
│  reversa content-server snapshot                                     │
│  reversa content-server inventory  [--write | --print]               │
│  reversa content-server doctor                                       │
│                                                                      │
│  lib/commands/content-server.js  (one file, dispatches subcommands)  │
└────────────────────┬────────────────────────────────────────────────┘
                     │  (in-process)
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  lib/integrations/cs-agent.js   (the trust boundary)                 │
│                                                                      │
│  resolveExecutable()   probe()   detectProfile()   runReadOnly(...)  │
│  collectSnapshot()     renderInventorySection()                      │
│                                                                      │
│  - Read-only allowlist (hard-coded, fail-closed)                     │
│  - --profile <name> required on every runReadOnly call               │
│  - detectProfile is the only profile-less path; whitelisted          │
│  - --json contract, timeout, single envelope parse                   │
│  - Executable trust evidence captured into _meta.json                │
└────────────────────┬────────────────────────────────────────────────┘
                     │  spawn
                     ▼
           ┌─────────────────────┐
           │   cs-agent.exe      │
           │   (external tool)   │
           └─────────────────────┘

State on disk:
  templates/config.toml             [integrations.cs_agent] block (default off)
  templates/config.user.toml        machine-local override
  .reversa/state.json               cs_agent_enablement_dismissed (fingerprint object)
  .reversa/context/cs-agent/
    profile-info.json               cached `cs-agent profile info --json`
    graph-status.json               cached `cs-agent graph status --json`
    docs-categories.json            cached `cs-agent docs categories --json`
    _meta.json                      commit marker: timestamps, profile,
                                    executable trust evidence (path/mtime/size/sha),
                                    snapshot_files manifest
    adapter.log                     one line per adapter call
  _reversa_sdd/inventory.md         `<!-- reversa:cs-profile:begin -->` … `:end -->` block
```

## 4. Component responsibilities

| Component | Owns | Does not |
|---|---|---|
| `lib/integrations/cs-agent.js` | Executable resolution, JSON parsing, timeout, allowlist enforcement, profile passthrough, audit log, snapshot commit marker, executable trust evidence | Decide product policy, render markdown, register CLI commands, write spec files |
| `lib/commands/content-server.js` | CLI subcommand dispatch; argv parsing; calling `lib/integrations/cs-agent.js`; printing user-facing output; writing snapshot files and inventory block | Be importable as a JS library from skills; mutate cs-agent state |
| `bin/reversa.js` | Routes `reversa content-server …` to `lib/commands/content-server.js`; lists subcommands in `--help` | Anything domain-specific |
| `agents/reversa-content-server/SKILL.md` | Shared operating contract; constraints; safety bucket definitions; snapshot model; CLI command reference for the doctor command | Orchestrate a pipeline; generate spec files; import JS; replace `/reversa` |
| Scout patch | Detect signal via CLI (`content-server detect`); on enablement, call CLI (`content-server snapshot`, `content-server inventory --write`); record signals in `surface.json` | Decide whether to enable; import JS; modify any other spec file |
| Orchestrator patch | Migration prompt for already-installed projects; persist fingerprinted dismissal | Run cs-agent calls itself; bypass installer for new projects |
| Installer patch (`lib/installer/`) | **Preferred** enablement path: probe during install, ask user, write config; pre-Scout fast-path | Decide for the user; install or refresh cs-agent assets |

## 5. Key flows

### 5.1 Two-run vs one-run

Phase 1 supports two product flows. Both reach the same end state; the difference is how soon the user sees the fast inventory.

| Scenario | Path | First `/reversa` outcome |
|---|---|---|
| **A — fresh install on a host with cs-agent reachable** | Installer probes → asks → writes config → enabled before first Scout walk | Inventory CS Profile section appears in the first run, under 60 s of Scout time |
| **B — already-installed Reversa, project moved or cs-agent appeared later** | Scout records signal (cheap CLI detect) → orchestrator asks at first checkpoint → on yes, writes config → user reruns Scout | First run: detect + ask (no deep walk yet, see §5.5). Second run: fast inventory under 60 s |

Both flows pass the same final acceptance — only the **time-to-fast-inventory** differs (one run vs two).

### 5.2 First-run detection (cheap, pre-walk)

```
Scout starts its phase
  Scout invokes CLI:  reversa content-server detect --json --quiet
    CLI calls lib/integrations/cs-agent.js detectProfile(executable)
      adapter resolves executable (config.user → config → caller-dir → PATH)
      if not found: returns { ok: false, reason: "executable_not_found" } — Scout records cs_agent_probe_failed signal and continues with the standard walk
      if found: adapter calls `cs-agent help --json` (cached, profile-less, allowed)
      adapter calls `cs-agent profile info --json` (profile-less; detectProfile is the one path that's allowed to omit --profile) — surfaces the active + registry
    CLI returns JSON: { ok: true, profiles: [{ name, ot_home, workdir, schema_version, ... }], active: "<name>", executable_trust: { path, mtime, size, help_sha256 } }
  
  Scout receives the result. Two branches:
  
  BRANCH 1 — already enabled in config:
    Scout reads config[integrations.cs_agent].profile (must be set)
    Scout shells:  reversa content-server snapshot --profile <name> --json
      CLI calls collectSnapshot(); writes profile-info.json, graph-status.json, docs-categories.json, then _meta.json (commit marker) atomically
    Scout records signal cs_agent_profile (full payload) in surface.json.signals[]
    Scout skips the deep walk under profile.paths.srcdir (see §5.5)
    Scout shells:  reversa content-server inventory --write
      CLI reads cache; renders the idempotent block; replaces it in inventory.md
  
  BRANCH 2 — not enabled in config:
    Scout records signal cs_agent_profile_detected with the lightweight detect payload (no graph counts yet)
    Scout does NOT call snapshot
    Scout does NOT skip the deep walk (because config is still off and we lack permission to commit to the fast path)
    Orchestrator picks up the signal at first checkpoint (see §5.3)
```

**Key change from v1**: the detection probe is now cheap (single `profile info` call without graph status) and runs before any walk. It does NOT block the orchestrator prompt from happening, but it also does NOT skip the deep walk in scenario B. The fast path requires committed config — that's the design.

### 5.3 Orchestrator migration prompt (scenario B only)

```
Orchestrator reaches first checkpoint after Scout's run
  Reads surface.json.signals[] — looks for cs_agent_profile_detected (BRANCH 2 marker)
  If absent: skip.
  Reads .reversa/config.toml — if [integrations.cs_agent].enabled = true: skip (BRANCH 1 will already have written inventory).
  Reads .reversa/state.json — if cs_agent_enablement_dismissed.fingerprint matches the current detection: skip.
    Fingerprint comparison: profile name + ot_home + executable path + help_sha256.
    Mismatch = re-ask (e.g., user installed a newer cs-agent, or moved the project).
  Asks the prompt verbatim (see 02-skill-stubs §3).

  On yes:
    Orchestrator writes config (profile, ot_home, workdir to config.toml; executable to config.user.toml).
    Orchestrator runs the snapshot + inventory rendering via CLI synchronously so the user sees the result in this session:
      reversa content-server snapshot --profile <name>
      reversa content-server inventory --write
    Orchestrator tells the user: "Done. Inventory updated. The CS Profile section is now in inventory.md."
  
  On no (or empty):
    Orchestrator writes the fingerprint to state.cs_agent_enablement_dismissed.
    Continues with the normal post-Scout flow.
```

### 5.4 Installer enablement prompt (scenario A, preferred)

```
npx @pnocera/reversa install
  Installer asks all standard questions (project name, languages, etc.)
  After project name is known but before Scout could run:
    Installer shells:  reversa content-server detect --json --quiet
      Same detectProfile path as Scout uses
    If detection succeeds:
      Installer asks the user (same prompt as orchestrator, slightly reworded for install context).
      On yes: writes config.toml + config.user.toml. Future `/reversa` is scenario A.
      On no: writes state.cs_agent_enablement_dismissed fingerprint. Future `/reversa` will not re-ask (until fingerprint changes).
    If detection fails or there's no cs-agent reachable: skip silently.
  Installer continues with the rest of install.
```

The installer is the recommended on-ramp because it avoids the deep-walk pain entirely on first `/reversa`.

### 5.5 Skip-deep-walk branch (scenario A on first run, scenario B on second run)

When `[integrations.cs_agent].enabled = true` AND snapshot collection has succeeded:

Scout reads `profile-info.json.profile.paths.srcdir` (typically `<workdir>/srcmodules/`). It then:

- **Skips** recursive walk of that exact directory.
- Records a single stub entry in `surface.json.modules`:

  ```json
  {
    "module": "<srcmodules tree, cs-agent managed>",
    "source": "cs-agent",
    "see": ".reversa/context/cs-agent/graph-status.json",
    "srcdir": "<absolute path from profile-info>"
  }
  ```

- Continues normal walk for everything outside `srcdir`. Root-level configs, scripts, tooling are not touched.

If snapshot collection fails (whether enabled or not), Scout records `cs_agent_snapshot_failed`, drops the skip, and falls back to a full walk under `srcdir`. The integration is "best-effort enabled" — broken cs-agent never blocks Reversa.

### 5.6 Snapshot collection (commit-marker semantics)

Three files plus a marker file, written under `.reversa/context/cs-agent/`:

```
collectSnapshot starts
  Creates staging directory:  .reversa/context/cs-agent/.staging-<sessionId>/
  Calls cs-agent profile info --json --profile <name>  →  staging/profile-info.json (tempfile + rename within staging)
  Calls cs-agent graph status --json --profile <name>  →  staging/graph-status.json
  Calls cs-agent docs categories --json --profile <name>  →  staging/docs-categories.json
  Computes executable_trust:
    { path, mtime_iso, size_bytes, help_signature_sha256 }
  Builds _meta.json with:
    { profile, collected_at, executable_trust, snapshot_files: { profile_info: "profile-info.json", ... }, schema_version_observed: <int>, adapter_version: "0.1.0", snapshot_ttl_days: <from config> }
  
  Atomic publish:
    For each of the three data files: move staging/<file> over .reversa/context/cs-agent/<file>  (rename across same fs = atomic on POSIX, near-atomic on Windows NTFS)
    Last: move staging/_meta.json over .reversa/context/cs-agent/_meta.json  ← this is the commit marker
  
  Removes staging directory.
```

**Reader rule** — anyone consuming the snapshots (Scout's inventory renderer, the doctor command, phase-2 module dossiers later) MUST:

1. Read `_meta.json` first. If absent or unparseable: treat as no snapshot.
2. Validate `_meta.snapshot_files` references files that actually exist next to `_meta.json`.
3. Validate `_meta.collected_at` is within `snapshot_ttl_days` (configurable). If older: still readable but flagged stale.
4. Validate `_meta.executable_trust.help_signature_sha256` matches the current adapter probe (if probing). If mismatched: warn — cs-agent updated since collection.

If validation fails, the snapshot is **not consumed**. Scout falls back; inventory is not regenerated.

This replaces the v1 "atomic rename" promise with a stronger coherent-set guarantee. Per-file atomic rename remains as the in-staging mechanism but is no longer the contract.

### 5.7 Inventory section rendering (idempotent)

The CS Profile section lives between stable HTML-comment markers:

```markdown
<!-- reversa:cs-profile:begin -->
## CS Profile (cs-agent)

… generated content …
<!-- reversa:cs-profile:end -->
```

The CLI `reversa content-server inventory --write` performs:

1. Read `_reversa_sdd/inventory.md` if it exists, else use an empty string.
2. Read the cached snapshot files via the commit-marker validation in §5.6. On failure: refuse to write; tell the user to refresh snapshots.
3. Compute the new block from snapshot data.
4. If existing inventory.md contains a `<!-- reversa:cs-profile:begin -->`…`<!-- reversa:cs-profile:end -->` pair: replace its content (including the markers, defensive against partial corruption).
5. Otherwise: append the block at the end of inventory.md (with a leading blank line if file doesn't end in one).
6. Write inventory.md atomically (tempfile + rename in the same directory).

Running this command twice in a row leaves exactly one CS Profile section. Running it after an external editor change preserves the user's edits outside the markers and refreshes the block content.

### 5.8 Optional `/reversa-content-server` doctor command (in skill)

When invoked from a Reversa session, the skill shells:

```
reversa content-server doctor
```

The CLI:

1. Verifies `[integrations.cs_agent].enabled = true`. If not: tells the user how to enable (orchestrator prompt re-trigger via `--force` or manual edit) and exits.
2. Calls `probe()` (computes new help signature).
3. Compares against cached `_meta.executable_trust.help_signature_sha256`. Warns if changed.
4. Calls `collectSnapshot()` (refresh).
5. Compares new graph counts against the just-replaced ones (read pre-overwrite into memory before rename). Reports drift.
6. Prints a one-screen summary to stdout (skill relays to chat).

The doctor command does NOT touch `_reversa_sdd/inventory.md`. To regenerate the section, the user runs `reversa content-server inventory --write` separately, or just reruns `/reversa`.

## 6. Design decisions (v2 additions in **bold**)

| Decision | Rationale |
|---|---|
| Adapter is **one** trust boundary, no other module shells `cs-agent.exe`. | Safety review and audit log work only with a single chokepoint. |
| Read-only allowlist is **hard-coded** in source, not derived from `help --json`. | A generic gateway makes "is this safe to call autonomously?" impossible to answer. cs-agent can add new commands; fail closed. |
| **`runReadOnly` always passes `--profile <name>`; `detectProfile` is the one explicit profile-less path.** | Splits "is the profile known yet?" from "do the work" cleanly. The active-profile leak that worried us in v1 is impossible in v2 because non-detection calls assert their profile. |
| **Skills call the CLI, never import JS.** | A Markdown skill cannot reliably import JS across engines. The CLI surface gives every engine the same affordance and is testable in isolation. |
| **CLI tree is shipped in phase 1, not deferred.** | Without it, scenario A (installer enablement) is impossible. v1 deferred the CLI and that broke the under-60-second promise. |
| **Two product flows (A and B) acknowledged.** | The v1 doc promised both implicitly; v2 names them. Acceptance gates each separately. |
| **Snapshots use `_meta.json` as commit marker.** | Per-file atomic rename does not prevent a coherent-set failure. The marker rule makes "did we successfully snapshot?" a single boolean. |
| **`_meta.json` carries executable trust (path/mtime/size/help_sha).** | Stale-binary diagnosis is now explicit. The doctor command and snapshot consumers can detect that the snapshot was taken with a different cs-agent than is now on disk. |
| **Inventory section is an idempotent block between stable HTML-comment markers.** | Reruns must not duplicate. Users editing inventory.md outside the block are preserved. |
| **Dismissal is a fingerprint object, not a boolean.** | A user who declines because cs-agent points to a stale binary or wrong profile should be re-asked when that changes. |
| `CSWORKS_ROOT` env fallback removed. Executable resolution: `config.user.toml → config.toml → caller dir → PATH`. | `CSWORKS_ROOT` is cs-agent's own concept and ambiguous for Reversa. Explicit configuration is clearer and matches how `config.user.toml` is meant to be used. |
| Snapshots are cached on disk, not live each call. | Predictable cost, offline-friendly, lets later phases reason about drift. |
| **Audit log lives at `.reversa/context/cs-agent/adapter.log` with a 5 MB size cap; uninstall removes it.** | Colocated with snapshots, easier to ship/unship as a unit. Size cap prevents unbounded growth on long-lived projects. |
| Snapshots failure → fall back to generic Reversa, do not abort. | A broken cs-agent install must not block analyzing a legacy Reversa already handled fine. |
| Inventory section is the only spec output in phase 1. | Lock v2 scope. Anything richer requires its own conception. |
| `[integrations.cs_agent]` not `[cs_agent]`. | Reserves namespace for future adapters (`[integrations.n8n]`, etc.). |
| Confidence mapping (cs-agent → Reversa) collapses 4 buckets to 3 with `🟡(N)` for `multi_candidate`. | The original cs-agent label survives in structured output; Reversa UX stays simple. Not exercised in phase 1 (inventory section reports aggregates only); documented for phase 2. |

## 7. Data ownership

| Datum | Owner | Read by | Phase 1? |
|---|---|---|---|
| `cs-agent.exe` location | `config.user.toml` (machine-local) | CLI / adapter | Yes |
| Profile name (`CS253`) | `config.toml` | CLI / adapter | Yes |
| `ot_home`, `workdir` | `config.toml` (populated by installer or orchestrator on enable) | Prompts, inventory section | Yes |
| `snapshot_ttl_days` | `config.toml` | CLI / readers | Yes |
| `enabled` flag | `config.toml` | Installer, orchestrator, Scout | Yes |
| Snapshot data | `.reversa/context/cs-agent/{profile-info,graph-status,docs-categories}.json` | Scout, doctor, future phase-2 consumers | Yes |
| Snapshot commit marker | `.reversa/context/cs-agent/_meta.json` | All readers (validation gate) | Yes |
| Executable trust evidence | inside `_meta.json` (`executable_trust`) | Doctor command, snapshot readers | Yes |
| `cs_agent_enablement_dismissed` fingerprint | `state.json` (object with profile, ot_home, executable, help_sha256, dismissed_at) | Orchestrator (re-ask logic) | Yes |
| Audit log | `.reversa/context/cs-agent/adapter.log` (rotated at 5 MB) | Operators | Yes |
| CSGraph itself, source tree, build artifacts | cs-agent's `E:\CS253_workdir\` | Reversa reads via adapter | Yes (read-only) |
| `_reversa_sdd/inventory.md` (the markered block) | CLI `inventory --write` | User | Yes |
| `_reversa_sdd/inventory.md` (content outside the block) | Other Reversa code (Scout's standard output) + the user | The user | Untouched by this integration |

Reversa never edits any file under `E:\CS253\` or `E:\CS253_workdir\`. Read-only access only.

## 8. Testing strategy

### Unit (Node)

- `lib/integrations/cs-agent.js` — resolution order, allowlist enforcement, single-envelope parser, timeout, `detectProfile` vs `runReadOnly` distinction (profile-less only via the first), commit-marker write order, executable-trust capture.
- `lib/commands/content-server.js` — argv parsing, subcommand dispatch, exit codes, JSON output shape, idempotent inventory writer (markered block replacement).

Mock `child_process.spawn`. No real cs-agent in unit tests.

### Integration (host with CS253)

A scripted test against the real cs-agent on the local machine, gated by `RUN_CS_AGENT_TESTS=1`:

- `reversa content-server probe` returns ok and the expected topic list.
- `reversa content-server detect` returns the CS253 profile in the registry.
- `reversa content-server snapshot --profile CS253` writes four files and `_meta.json` validates per §5.6.
- `reversa content-server inventory --write` updates the block; running it again is a no-op diff.
- Killing the process mid-snapshot leaves no usable snapshot: `_meta.json` is either absent or references files that exist.

### End-to-end (manual, recorded)

On `E:\CS253`, run the two flows and capture:

- **Scenario A** — fresh install, accept the installer prompt, first `/reversa` produces the inventory section.
- **Scenario B** — already-installed project, first `/reversa` detects + asks; second `/reversa` produces the inventory.

Both captures saved under `work/01-cs-agent-specialized/proof/`.

### CLI help test

`npx @pnocera/reversa --help` and `npx @pnocera/reversa content-server --help` both list the `content-server` command tree. The subcommands appear in `bin/reversa.js` registry. (Hard gate G15 in acceptance.)

## 9. Acceptance gate

Phase 1 ships when all hard gates in [03-phase-1-acceptance.md](03-phase-1-acceptance.md) §2 pass on `E:\CS253`. No other measure.

## 10. Open questions (non-blockers for phase 1)

| Question | Defer-to |
|---|---|
| When does Reversa detect that cs-agent's index has been refreshed since the last snapshot, beyond the help-signature SHA and the snapshot_ttl_days? | Phase 2 (module dossiers depend on a freshness signal beyond aggregate counts). |
| Should snapshots be committed (shared across the team) or .gitignored (per-machine)? | Decide before phase 2; phase 1 default is .gitignored under `.reversa/context/`. The adapter log is also .gitignored. |
| In CI where no human typed the prompt, how does enablement happen? | Document that CI installs must set `[integrations.cs_agent].enabled = true` and `profile = "<name>"` in committed `config.toml`, plus `executable` in env (or skip the integration). The installer's interactive prompt does not run in CI. |
| Multi-profile hosts: how does the user pick when `detect` returns 2+? | Phase 1: the installer/orchestrator surfaces all candidates and asks the user to choose. No silent picking. |
| `snapshot_ttl_days` default? | 7. Revisit after phase 1 is in use. |
| Audit log retention strategy beyond the 5 MB cap? | Cap → drop the oldest 25 % when crossed. Document; do not require fancier rotation in phase 1. |

## 11. Phase 2+ deferrals (short index — kept so future contributors can find them)

Not in this conception. Tracked in [../03-proposal.md](../03-proposal.md) §6 and gated on phase 1 shipping.

- Module dossiers (`_reversa_sdd/cs-modules/<module>.md`) — phase 2
- `extensions.md`, `route-catalog.md`, `dispatch-map.md`, `override-map.md` — phase 3, each behind a proof command
- `erd-complete.md`, `permissions.md`, `state-machines.md` from CSGraph — phase 3, higher risk, heuristic validation required
- Forward / Coding wiring through `dev checkout/build/handoff` and `csui` workflows — phase 4
- MCP transport via `cs-agent mcp serve` — phase 5, optional
- Workflow side-effect bucket in the adapter — added when phase 4 starts; not in phase 1 source
- Java decompile and Java code intel — phase 3 or later
- OUnit live test integration — phase 4
