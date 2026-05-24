# Proposal — Making Reversa cs-agent-aware (v2)

> Companion to [02-findings.md](02-findings.md). Concrete plan to integrate cs-agent into Reversa **without** forking the `/reversa` pipeline.
>
> **Revised** after review. The earlier v1 proposed a full alternate orchestrator (`reversa-cs`) with a phase-1 promise of a "full spec set in minutes." That was too ambitious: it risked forking `/reversa` checkpoint/resume behavior, over-promised artifacts that need proof-command validation first, and would have auto-flipped persistent config without asking. v2 shrinks the first deliverable to a single, defensible product increment.

## TL;DR (v2)

The first product increment is exactly this:

> **Reversa recognizes CS253 and generates a CS-aware `inventory.md` from cs-agent evidence.**

That's it. No spec suite generation, no competing orchestrator, no Forward integration, no permission/state-machine/ERD synthesis. Those are all on the backlog behind explicit proof-command validation.

To get there we need:

1. A **safe CLI adapter** at `lib/integrations/cs-agent.js` with a hard-coded denylist and explicit `--profile` passthrough.
2. A new config section `[integrations.cs_agent]` (machine-local overrides in `config.user.toml`).
3. A **shared operating-contract skill** `agents/reversa-content-server/SKILL.md` — a contract document other Reversa skills consume, not a competing orchestrator.
4. **Scout-only patches**: detect cs-agent, skip the deep `srcmodules/` walk, cache `profile info` + `graph status` + `docs categories`, record the signal.
5. An **`inventory.md` section** that surfaces the cached cs-agent evidence.

That is the entire phase 1. Everything else stacks on top, gated by proof.

---

## 1. Safe CLI adapter — `lib/integrations/cs-agent.js`

This is the single trust boundary between Reversa and cs-agent. **No other Reversa module shells `cs-agent.exe` directly.**

### Responsibilities

- **Resolve executable** in this order: `config.user.toml → config.toml → CSWORKS_ROOT/cs-agent.exe → PATH`. Fail clean if none.
- **Probe availability** with a one-time cached `cs-agent help --json` to validate the help tree shape and version.
- **Run** one command per call, always with:
  - `--json`
  - explicit `--profile <name>` (never rely on active profile after install-time detection — the active profile can change out from under us)
  - bounded timeout (default 30s for queries, 5 min for graph snapshots, configurable)
- **Parse one JSON envelope** off stdout; surface `failureCodes` from the help tree as typed errors.
- **Hard-coded safety classification** — every call goes through one of three explicit functions:

```
runReadOnly(cmd, args, opts)        // graph status, graph module, graph search, graph callers,
                                    // graph subclasses, graph extension-points, graph kinds,
                                    // docs search, docs concept, docs cross-ref,
                                    // code status, code search, code node, code explore,
                                    // code java jars, lint source, test probe,
                                    // profile info, runs, help

runWorkflowSideEffect(cmd, args, opts)  // dev checkout, dev new, dev status, dev build, dev handoff,
                                        // csui new, csui status, csui preview, csui build,
                                        // csui handoff, csui confirm-deployed, csui style ...,
                                        // module new, edit, xlate, build run, build diagnostics,
                                        // code java decompile (capped --concurrency 1 by default),
                                        // source export

// HUMAN_ONLY (never callable from agent code)
//   init, init refresh, csdoc install, csdoc rebuild, csui install,
//   code index csui, code index java
```

The three buckets are **enumerated explicitly in source code**, not derived. Any cs-agent command not in the table refuses to run with an "unclassified — require explicit allowlist" error. New cs-agent commands fail closed by default.

`runWorkflowSideEffect` additionally requires:

- An explicit `userAuthorized: true` flag in `opts` (caller asserts the user opted in).
- A log line in `.reversa/cs-agent.log` recording command, args, and timestamp.
- A confirmation prompt unless the current Reversa phase is `coding` and the action is within the agent-owned dev workflow (`dev checkout/build/handoff` or `csui new/build/handoff`).

`HUMAN_ONLY` calls have no function — Reversa instead emits a copy-pasteable command line and asks the user to run it themselves.

### Not in scope for the wrapper

- It is **not** a generic gateway. It will not forward arbitrary `cs-agent <topic> <command>` calls. Every supported call is a typed function in this module.
- It does **not** mutate active profile.
- It does **not** install or refresh anything.
- It does **not** retry on `OTHER` failures; it surfaces them.

---

## 2. Config — `[integrations.cs_agent]`

Add to `templates/config.toml`:

```toml
[integrations.cs_agent]
# Off by default. Enabled by the orchestrator or installer after asking the user.
enabled = false

# Profile name to pass on every call. Set when the user confirms detection.
profile = ""

# Read-only mirrors of fields cs-agent owns, populated by reversa-content-server
# on first successful profile info call. Used for prompt defaults and traceability.
# Reversa never edits cs-agent's source of truth.
ot_home = ""
workdir = ""

# Snapshot freshness — Reversa will refuse to act on a snapshot older than this
# without a user override. Refresh = re-run profile info + graph status.
snapshot_ttl_days = 7
```

Machine-local overrides in `config.user.toml` (kept out of git per existing convention):

```toml
[integrations.cs_agent]
executable = "F:\\smoke\\CS253\\cs-agent.exe"
profile = "CS253"
# Optional — if set, Reversa uses MCP transport instead of CLI shell-outs.
# Off by default in v2; revisit after the CLI flow is proven.
# mcp_command = ""
```

Why two files: the executable path and concrete profile name are user-specific; the framework defaults are repo-shared. `config.user.toml` already exists for exactly this split.

---

## 3. Shared operating contract — `agents/reversa-content-server/SKILL.md`

A **library skill**, not an orchestrator. Other Reversa skills `@import` (conceptually) the contract and call its helper functions through the adapter.

### What it contains

- **When to consult it.** Any Reversa skill operating on a Content Server project must read this first.
- **Operating constraints carried from cs-agent** (mirrors §5 of [02-findings.md](02-findings.md)):
  - Agent never deploys.
  - `init` / `init refresh` are human-only.
  - Always pass `--json` and `--profile <name>`.
  - `--help` is the schema source of truth; do not bake schemas.
  - OUnit live tests require Eclipse VM on `127.0.0.1:19777`; never assume it is up.
- **Three safety buckets** (mirrors §1) — skills must call through `lib/integrations/cs-agent.js`, never shell out.
- **Snapshot model**:
  - Snapshots live in `.reversa/context/cs-agent/`:
    - `profile-info.json`
    - `graph-status.json`
    - `docs-categories.json`
  - Each carries a `_collected_at` timestamp and `_profile` field.
  - Skills consume the snapshot, not live calls, unless they explicitly opt into freshness.
- **Confidence mapping** — cs-agent edge confidence → Reversa marks:
  - `resolved` / `intrinsic` → 🟢 CONFIRMED with `node_id` + file:line
  - `multi_candidate` → 🟡 INFERRED with candidate count surfaced as `🟡(N)`
  - `inferred` → 🟡 INFERRED
  - `unresolvedRefsByKind` entries → 🔴 GAP routed to `questions.md`
- **Diagnostic command (optional)**:
  - `/reversa-content-server` — if exposed, this command is **snapshot-only**: it runs profile info + graph status + docs categories, writes the three JSON files into `.reversa/context/cs-agent/`, and prints a one-screen summary. It does not generate spec files. It does not produce SDD artifacts. It is a doctor command, nothing more.

### What it does NOT contain

- No orchestration of a discovery pipeline.
- No spec generation.
- No checkpoint logic.
- No competing `/reversa` flow.

---

## 4. Scout patch (the only agent change in phase 1)

Single, focused change to `agents/reversa-scout/SKILL.md`:

1. **Detection signals** — Scout records, in `surface.json.signals[]`, an entry of type `cs_agent_profile` when any of:
   - `cs-agent.exe` is reachable on PATH or via `CSWORKS_ROOT`, AND
   - The adapter's `cs-agent help --json` succeeds, AND
   - `cs-agent profile info --json` returns `ok: true` with at least one `path_checks` entry green.

   The signal payload includes resolved profile name, `ot_home`, workdir, schema version, file count, node count, edge count, and module count. Nothing more.

2. **Skip the deep walk** — when the `cs_agent_profile` signal fires AND the user has confirmed enablement (see §5), Scout skips its standard recursive walk under `srcmodules/` (in CS253 that walk is 34,171 files). It records a stub entry "cs-agent-managed source tree; see graph snapshot" in `surface.json.modules` and stops there.

3. **Cache the three snapshots** — Scout calls the adapter to populate `.reversa/context/cs-agent/{profile-info,graph-status,docs-categories}.json` once during its phase.

4. **Surface in `inventory.md`** — append a new section:

```markdown
## CS Profile (cs-agent)

- Profile: CS253
- Content Server install: E:\CS253
- cs-agent workdir: E:\CS253_workdir
- CSGraph schema: v3
- Indexed: 34,171 source files, 940,729 nodes, 2,251,241 edges, 148 modules
- Top modules by node count: docviewer (4,914), csui (1,838), core (1,154), …
- Unresolved references awaiting human review: 480,631 feature_call, 143,876 uses_xlate, 55,740 type, 22,148 ambiguous_call

> This inventory section is derived from `.reversa/context/cs-agent/graph-status.json`. The full per-module structure lives in CSGraph; Reversa will produce additional artifacts in later phases as proof commands are validated.
```

That section is the **entire phase-1 spec surface**. No `architecture.md`, no `domain.md`, no `erd-complete.md`, no `permissions.md`, no `state-machines.md`, no `extensions.md`. None of those are produced yet.

5. **Do NOT auto-flip `enabled`.** Scout records the signal and stops. Enabling the integration in `[integrations.cs_agent]` is a separate user decision (§5).

---

## 5. Who flips `enabled` — orchestrator or installer, never Scout

Two routes:

- **Installer** (`npx @pnocera/reversa install`): if the installer detects cs-agent during initial setup (probe the adapter), it asks:

> *"I detected a cs-agent install at `F:\smoke\CS253\cs-agent.exe` with profile `CS253` (CS Content Server install at `E:\CS253`). Enable Reversa's Content Server integration for this project? Reversa will use cs-agent for source indexing instead of walking `srcmodules/` directly. [y/N]"*

  On yes, writes `[integrations.cs_agent].enabled = true` plus `profile = "CS253"` to `config.toml`, and the executable path to `config.user.toml`.

- **Orchestrator** (`/reversa`): if Scout records the signal but `enabled = false`, the orchestrator asks the same question at its first checkpoint. On yes, writes the same config. On no, marks the question dismissed in `state.json` so it doesn't re-ask every session.

The user can also enable manually by editing `config.user.toml`.

---

## 6. Phased rollout (revised)

### Phase 1 — recognition + inventory (1 sprint, the beachhead)

- `lib/integrations/cs-agent.js` adapter (read-only set + classification table; no workflow set yet).
- `[integrations.cs_agent]` config + `config.user.toml` override.
- `agents/reversa-content-server/SKILL.md` contract (no orchestration).
- Scout patches (detect, cache snapshots, skip deep walk if enabled, append inventory section).
- Optional diagnostic `/reversa-content-server` command (snapshot-only).

**Deliverable**: on a CS253 project with cs-agent enabled, `/reversa` produces an `inventory.md` whose CS Profile section is real, fast, and citable. Nothing more.

**Acceptance criterion**: running `/reversa` on `E:\CS253` (or any folder linked to the CS253 profile) takes < 60 seconds for Scout and produces an inventory section with the numbers from §4. The rest of the existing Reversa pipeline runs as today against generic files (or stops gracefully if there are none).

### Phase 2 — module dossiers (1 sprint, gated on phase-1 acceptance)

- Add `runReadOnly` wrappers for `graph module`, `graph search`, `graph callers`, `graph subclasses`.
- New artifact: `_reversa_sdd/cs-modules/<module>.md` per module — module summary card with top features, dependencies, extension points, depth, override count. Generated lazily on user request (`/reversa-content-server module <name>`) or in bulk during `/reversa` (with a checkpoint per N modules so the user can pause).
- Archaeologist patch: when a target unit is a CS module and a dossier exists, Archaeologist reads the dossier instead of doing its own walk. Otherwise unchanged.
- Architect patch: build module-level C4 containers from `depends_on` edges in the snapshot. Output `architecture.md` is augmented with a "CS module containers" section. Existing Architect logic for non-CS containers stays.

**Gate**: phase 1 must be in active use on at least one real project before phase 2 starts. Module dossier format must be reviewed against three real CS modules before generalizing.

### Phase 3 — proof-validated artifacts (incremental, one at a time)

Each of these artifacts is moved from "proposed" to "shipped" only after a **proof command** demonstrates correctness on real CS253 data and a human reviews the sample.

| Artifact | Proof command (must produce sane output before we ship the generator) | Risk |
|---|---|---|
| `extensions.md` | `cs-agent graph extension-points --json --profile CS253` produces a complete, navigable list with override sites cited | LOW |
| `route-catalog.md` | `cs-agent graph` filter on `node.kind = route` paired with `docs cross-ref` produces 4,471 routes with > 80 % SDK link rate | LOW |
| `dispatch-map.md` | Filter on `dispatches_to` edges + cycle detection produces a readable map per module, sample-validated on `core` and `docviewer` | MEDIUM |
| `override-map.md` | `overrides` edge enumeration grouped by ancestor; sample-validated against a known CSIDE override | MEDIUM |
| `erd-complete.md` | `type_of` + `inherits` filtered to `kind = object` produces a Mermaid ERD that renders and has < N % unresolved types | HIGH — risk of unreadable graphs; needs filter heuristics |
| `permissions.md` | Heuristic (feature name pattern + extension-point cross-ref) confirmed against a hand-curated permission set | HIGH — heuristic, possibly wrong |
| `state-machines.md` | `dispatches_to` cycle detection + manual review of 5 candidate state machines | HIGH — domain-specific judgment |
| Code↔spec traceability matrix | Sample-validated end-to-end on one feature; CSGraph `node_id`s are persistent across `init refresh` (verify) | MEDIUM |

**Rule**: no artifact ships without (a) a saved proof command transcript in `work/01-cs-agent-specialized/proof/<artifact>.md` and (b) a human-reviewed sample output.

### Phase 4 — Forward / Coding (gated on phase 2)

- Add `runWorkflowSideEffect` wrappers for `dev checkout/new/status/build/handoff`, then `csui new/status/preview/build/handoff/confirm-deployed`.
- Coding agent: when target is a CS module, route writes into the cs-agent local copy and stop at `dev handoff`. Emit copy-paste instructions for the user to deploy.
- Plan agent: blast-radius from `graph callers` snapshot.
- Requirements agent: CSDoc cross-ref for domain terms.
- Audit agent: optional `test probe` to confirm OUnit adapter is alive before declaring ready-for-QA.

### Phase 5 — MCP transport (optional)

After CLI flow is proven and we have a real cost picture, evaluate switching the adapter to MCP via `cs-agent mcp serve`. Lower latency, structured errors, cancellable. Not on the path; do not block earlier phases on this.

---

## 7. Things removed from v1

| v1 item | v2 disposition | Why |
|---|---|---|
| `reversa-cs` orchestrator skill with 8-step pipeline | Removed — replaced by snapshot-only shared contract | Risk of forking `/reversa` checkpoint/resume behavior |
| Phase-1 promise of "full spec set in minutes" with permissions/state-machines/ERD/etc. | Moved to Phase 3 behind proof commands | Over-promise; some artifacts may not be feasible without heuristics worth validating first |
| Scout auto-flip of `[cs_agent].enabled` | Removed — user must confirm via installer or orchestrator prompt | Persistent config change without consent is wrong |
| Generic CLI wrapper that forwards any command | Removed — replaced with explicit 3-bucket classification table | A generic gateway makes safety review impossible |
| `[cs_agent]` config section | Renamed `[integrations.cs_agent]` | Future-proofing for other integrations (n8n adapter could move under `[integrations.n8n]` too) |
| Implicit active-profile reliance | Explicit `--profile <name>` on every call | Active profile can change between sessions; pinning is safer |
| MCP wiring in phase 3 | Moved to phase 5 (optional) | Not on the critical path; defer until CLI flow proves the model |
| New artifacts in phase 1: `extensions.md`, `dispatch-map.md`, `override-map.md`, `route-catalog.md` | Moved to phase 3, each gated by proof command | Each needs sample validation before generator code |

---

## 8. Risks still on the table

These survived the v2 trim. They are still worth tracking.

1. **Snapshot drift after user `init refresh`.** `cs-agent init refresh` rebuilds indexes. Reversa needs to detect that the cached snapshots are stale (compare `_collected_at` against the workdir mtime or against a `cs-agent profile info` revision marker, TBD). Out of scope for phase 1 — for now the `snapshot_ttl_days = 7` config is the only guard.
2. **Path portability.** Cited file paths like `E:\CS253_workdir\srcmodules\...` aren't portable across machines. Phase 1 only writes summary numbers (no per-file citations), so this doesn't bite until phase 2 module dossiers. Plan: store paths relative to `profile.paths.srcdir` and surface them as `<srcmodules>/...`.
3. **Confidence model mismatch.** cs-agent has 4 confidence buckets (`resolved`/`intrinsic`/`multi_candidate`/`inferred`) plus an explicit unresolved set. Reversa has 3 (🟢/🟡/🔴). The mapping in §3 collapses `resolved + intrinsic → 🟢` and `multi_candidate + inferred → 🟡`. Acceptable, but we should surface the original cs-agent label in tooltips/comments so the user can dig in.
4. **Engine portability.** The integration assumes Claude Code first. Codex and other engines call slash commands and read SKILL.md the same way, but MCP transport differs. Phase 5 is the right time to test multi-engine, not earlier.
5. **`config.user.toml` vs CI.** If a teammate runs Reversa in CI on a CS project, they have no `config.user.toml` and no cs-agent install. The adapter must fail clean and Reversa must fall back to its generic flow.

---

## 9. The smallest concrete next step (unchanged in spirit, tighter in scope)

To deliver phase 1 in one focused day:

1. Write `lib/integrations/cs-agent.js` with:
   - `resolveExecutable()` (config → env → PATH)
   - `probe()` calling `help --json` once, caching
   - `runReadOnly(topic, command, args, { profile, timeoutMs })` with the explicit allowlist hard-coded
   - Refuse to expose `runWorkflowSideEffect` yet (return `not_implemented_in_phase_1`)
2. Write `agents/reversa-content-server/SKILL.md` as the operating contract document.
3. Add the `[integrations.cs_agent]` block to `templates/config.toml` and the override block to `templates/config.user.toml`.
4. Patch `agents/reversa-scout/SKILL.md` with the three additions:
   - Detection signal entry
   - Skip-deep-walk branch
   - `inventory.md` CS Profile section template
5. Patch the orchestrator (`agents/reversa/SKILL.md`) to ask the enable-question on first run when the signal is present and `enabled = false`.
6. Hand-test against `E:\CS253` and capture a sample `inventory.md` into `work/01-cs-agent-specialized/proof/sample-inventory.md`.

Anything beyond that is phase 2 or later, and only after phase 1 is shipped and used.
