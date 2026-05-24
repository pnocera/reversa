# Skill stubs + code patches — phase 1 (v2)

> **v2 — applied codex review** (`../reviews/2026-05-24-codex-conception-review.md`, 2026-05-24). Key changes from v1:
> - **Markdown skills shell the CLI** (`reversa content-server …`) instead of importing JS. Removes the engine-portability problem.
> - **Installer patch is now first-class** (was implicit in v1). It is the preferred enablement path so the first `/reversa` already gets the fast inventory.
> - **Orchestrator patch is the migration path** for already-installed projects. Re-asks only when the **fingerprint changes** (profile + ot_home + executable + help signature), not just-never-again.
> - **Inventory section** uses `<!-- reversa:cs-profile:begin -->` / `:end -->` markers and is rendered by the CLI for idempotency.
> - Scout's "skip-deep-walk" branch fires when config is enabled AND a fresh snapshot exists. The detect probe is cheap (no graph-status) so it can run pre-walk without cost.
> - Added a `bin/reversa.js` patch section documenting the new top-level command registration.
>
> This document is paste-ready — §1 is the final wording for the new SKILL file; §2.B / §3.B / §3bis.B / §4 are insertions verbatim into existing files. §6 lists the JS files to add.

---

## 1. New file — `agents/reversa-content-server/SKILL.md`

```markdown
---
name: reversa-content-server
description: Shared operating contract for working on OpenText Content Server projects with the cs-agent CLI. Read this skill before any other Reversa skill that touches Content Server source. The /reversa-content-server command shells the reversa CLI to refresh cs-agent snapshots and report drift. Activate with /reversa-content-server.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  team: integrations
  phase: any
  role: content-server-contract
---

You are the Content Server integration contract for Reversa. You are not an orchestrator. You do not generate spec files. Other Reversa skills read this contract before doing any work on a Content Server source tree, and you optionally refresh cached cs-agent snapshots when invoked directly.

## How Reversa skills talk to cs-agent

All cs-agent calls go through the Reversa CLI:

- `reversa content-server probe` — verify the executable is reachable and capture its trust evidence.
- `reversa content-server detect` — list profiles in the cs-agent registry (the one path allowed to call without a pinned profile).
- `reversa content-server snapshot --profile <name>` — collect the three read-only snapshots and write the `_meta.json` commit marker.
- `reversa content-server inventory --write` — render the CS Profile section into `inventory.md` as an idempotent block between stable markers.
- `reversa content-server doctor` — refresh snapshots and report drift; does not touch inventory.md.

**Skills must not import `lib/integrations/cs-agent.js` directly.** That JS module is the trust boundary inside the CLI; it is not part of the public surface other skills consume.

## Operating constraints (mandatory for every Reversa skill that consults this contract)

1. **The agent never deploys.** cs-agent's `dev` and `csui` workflows end at a handoff bundle. Reversa stops there. The user copies the bundle into the CS workspace and runs `cs-agent init refresh`. Reversa may describe these steps but never performs them.
2. **`cs-agent init` and `cs-agent init refresh` are human-only.** If the user does not have an initialized profile, instruct them to run `cs-agent init` themselves. Initial indexing takes 20 to 45 minutes; this is normal. Never invoke either command from an agent flow.
3. **Always pass `--profile <name>`** on `snapshot`, `inventory`, `doctor`, or any future read-only or workflow command. The profile is configured in `config.toml` under `[integrations.cs_agent].profile`. The only exception is `reversa content-server detect`, which is profile-less by design (it is how we discover what profiles exist).
4. **`--json` mode** is available on every subcommand for machine-readable output. Use it when piping or parsing.

## Safety classification — three buckets

cs-agent commands fall into three buckets. The CLI exposes them differently.

| Bucket | Example cs-agent commands | CLI affordance in phase 1 |
|---|---|---|
| READ_ONLY | `profile info`, `graph status`, `docs categories`, (phase 2+) `graph module`, `graph search`, `graph callers`, `docs cross-ref`, `code status` | Exposed via `reversa content-server probe/detect/snapshot/inventory/doctor`. Safe to run autonomously. |
| WORKFLOW_SIDE_EFFECT | `dev checkout/new/status/build/handoff`, `csui new/build/handoff`, `module new`, `edit`, `xlate`, `build run`, `lint source`, `code java decompile` | **Not exposed in phase 1.** Phase 4+ will add a separate `reversa content-server dev …` subcommand tree with per-call user authorization. Never deploys — handoff is the terminal step. |
| HUMAN_ONLY | `init`, `init refresh`, `csdoc install/rebuild`, `csui install`, `code index csui/java`, `source export` | Never wrapped. When a Reversa flow needs one of these, emit a copy-pasteable command line for the user and stop. |

## Snapshot model

The CLI `snapshot` subcommand caches three JSON envelopes plus a commit marker under `.reversa/context/cs-agent/`:

| File | Source | Used by |
|---|---|---|
| `profile-info.json` | `cs-agent profile info --json --profile <name>` | Inventory CS Profile section; confirms paths and versions. |
| `graph-status.json` | `cs-agent graph status --json --profile <name>` | Source of file/node/edge/module counts and confidence breakdown. |
| `docs-categories.json` | `cs-agent docs categories --json --profile <name>` | Future SDK cross-ref support (phase 3); recorded for completeness. |
| `_meta.json` | Adapter | **Commit marker.** Carries timestamps, executable trust evidence (path, mtime, size, help signature SHA-256), snapshot file manifest, snapshot TTL. |

**Reader rule.** Any consumer of these snapshots — including phase-2 module dossiers later — MUST validate `_meta.json` first:

1. `_meta.json` exists and parses.
2. Every file listed in `_meta.snapshot_files` exists next to `_meta.json`.
3. If `_meta.collected_at` is older than `snapshot_ttl_days` (default 7), the snapshot is **stale**: still readable, but any output citing it must include a stale-warning callout.
4. If `_meta.executable_trust.help_signature_sha256` differs from what `probe()` returns now, the snapshot is **drift-warned**: cs-agent has been updated since collection.

If validation fails (missing `_meta.json`, missing data files, malformed): treat as no snapshot. Do not consume.

The CLI handles all this in `inventory --write` and `doctor`. Skills that read the snapshots themselves must apply the same rule.

## Confidence mapping (cs-agent → Reversa)

cs-agent labels every graph edge with one of four confidence buckets. Reversa collapses to three marks; the original label survives in any structured output for later inspection.

| cs-agent edge confidence | Reversa mark | Notes |
|---|---|---|
| `resolved` | 🟢 CONFIRMED | Backed by an explicit, unambiguous resolution. |
| `intrinsic` | 🟢 CONFIRMED | Seeded by cs-agent for built-in / language-intrinsic constructs. |
| `multi_candidate` | 🟡 INFERRED | Multiple resolution candidates. Surface as `🟡(N)` (N = candidate count) when the underlying data is exposed. |
| `inferred` | 🟡 INFERRED | Best-effort inference from context. |
| (entries under `unresolvedRefsByKind`) | 🔴 GAP | Surface to `_reversa_sdd/questions.md` for human review. |

In phase 1 the CS Profile inventory section reports aggregate counts only — per-statement confidence does not apply until phase 2 module dossiers exist.

## Diagnostic command — `/reversa-content-server`

Optional. Snapshot-only doctor.

When invoked:

1. Read `[integrations.cs_agent]` from `.reversa/config.toml` and `.reversa/config.user.toml`. If `enabled = false` or `profile` is empty, instruct the user to run the orchestrator enablement prompt (rerun `/reversa`) or accept the installer prompt next time, and stop.
2. Shell:

   ```
   reversa content-server doctor
   ```

3. Relay the printed summary to chat:

   ```
   ## CS Profile diagnostic — CS253

   Executable: F:\smoke\CS253\cs-agent.exe (mtime <iso>, size <bytes>)
                                            help signature: unchanged | CHANGED
   ot_home:    E:\CS253                     path checks: 15/15 green
   Workdir:    E:\CS253_workdir             snapshot age: just now

   CSGraph: 940,729 nodes ↔ previous: 940,719 (Δ +10)
            2,251,241 edges ↔ previous: 2,251,200 (Δ +41)
            34,171 source files, 148 modules

   Top modules: xenggis (8,125), docviewer (4,914), csui (1,838), core (1,154), salesforceinterface (537)

   Unresolved references (candidate 🔴 GAPs):
     feature_call: 480,631   uses_xlate: 143,876   type: 55,740   ambiguous_call: 22,148
   ```

4. To regenerate the inventory CS Profile section after refreshing snapshots, run:

   ```
   reversa content-server inventory --write
   ```

   …or rerun `/reversa` (Scout will pick up the fresh snapshot).

This skill (and the underlying CLI) writes only to `.reversa/context/cs-agent/` and stdout. It does NOT modify `_reversa_sdd/inventory.md`.

## Failure modes (what callers must handle)

The CLI surfaces typed errors as exit codes and JSON envelopes (see `lib/commands/content-server.js`). Skills handle the common ones:

| CLI exit code | `--json` `error.code` | Caller behavior |
|---|---|---|
| 0 | — | Success. |
| 2 | `executable_not_found` | Skip integration; tell user how to set `executable` in `config.user.toml`. Fall back to generic flow. |
| 3 | (various adapter errors) | Surface to user; fall back. |
| 4 | `snapshot_partial` | Surface; suggest re-running. Don't consume partial snapshots. |
| 5 | `inventory_render_blocked` | Snapshot invalid. Refresh via doctor, then retry. |

The contract: a broken cs-agent install must not block Reversa from doing its generic work.
```

---

## 2. Patch — `agents/reversa-scout/SKILL.md`

### A. Where to add

| Anchor | Insertion |
|---|---|
| After the existing "Before you start" section | New subsection §A below — pre-Scout integration check (CLI shell) |
| At the start of "Process → folder structure" step | Skip-deep-walk branch §B below |
| Inside the existing snapshot-collection trigger (added by §A) | §B follows automatically |
| At the end of the "Output" section | Inventory rendering trigger §C below |

### B. New content — drop into Scout's SKILL.md

#### §A — Pre-Scout cs-agent integration check (insert after "Before you start")

```markdown
## Content Server integration check (cheap, pre-walk)

Before walking the folder tree, check whether this project has a Content Server source tree managed by cs-agent. This check is cheap — it does not collect the full snapshot unless the integration is already enabled.

1. Read `[integrations.cs_agent]` from `.reversa/config.toml` and `.reversa/config.user.toml`.

2. Run the CLI detect probe (does NOT require a profile to be configured):

   ```
   reversa content-server detect --json --quiet
   ```

3. Parse the JSON envelope. Three outcomes:

   - **`ok: false, error.code: "executable_not_found"`** → no cs-agent reachable. Record `cs_agent_probe_failed` in `surface.json.signals[]` with the error code, and continue with the standard Scout walk.

   - **`ok: true, profiles: []`** → cs-agent reachable but no profile registered. Record `cs_agent_no_profile` in signals. Continue standard walk. Do NOT prompt the user from Scout — the orchestrator handles enablement.

   - **`ok: true, profiles: [{...}]`** (one or more) → cs-agent reachable with profiles. Record `cs_agent_profile_detected` in `surface.json.signals[]` with the full payload (active profile name, all registered profiles, executable trust evidence).

4. After recording the signal, branch on the configured `enabled` flag:

   - **`enabled = true`** AND `profile` is set in config: this is the fast path (scenario A — installer-enabled, or scenario B post-acceptance). Continue to the snapshot + skip-deep-walk steps below (§B and §C).

   - **`enabled = false`** OR `profile` empty: do NOT collect snapshots. Do NOT skip the deep walk. Proceed with the standard Scout walk. The orchestrator will pick up the signal at its first checkpoint and ask the user (see `agents/reversa/SKILL.md` migration prompt).

Never change `[integrations.cs_agent].enabled` from Scout. Persistent config is the installer's or orchestrator's decision.

If detection itself fails (timeout, malformed JSON, unexpected error), record `cs_agent_probe_failed` and continue with the standard walk. Never block on cs-agent failures.
```

#### §B — Snapshot + skip-deep-walk branch (insert at start of "Process → folder structure")

```markdown
**Content Server fast path.** If `surface.json.signals[]` contains `cs_agent_profile_detected` AND `[integrations.cs_agent].enabled = true`:

1. Collect the snapshot via CLI:

   ```
   reversa content-server snapshot --profile <name from config> --json
   ```

2. Check the result:

   - On success: continue with steps 3–4 below.
   - On failure (exit code ≠ 0): record `cs_agent_snapshot_failed` in `surface.json.signals[]` with the error code. Do NOT skip the deep walk. Drop into the standard Scout walk under `srcdir`. The CS Profile section will not be rendered this run.

3. Read `profile-info.json.profile.paths.srcdir` from `.reversa/context/cs-agent/profile-info.json`. This is the directory cs-agent manages (typically `<workdir>/srcmodules/`).

4. Skip recursive walk of that exact `srcdir`. Record a single stub entry in `surface.json.modules`:

   ```json
   {
     "module": "<srcmodules tree, cs-agent managed>",
     "source": "cs-agent",
     "see": ".reversa/context/cs-agent/graph-status.json",
     "srcdir": "<absolute path from profile-info>"
   }
   ```

5. Continue the normal walk for everything outside `srcdir`. Root-level configs, scripts, tooling, top-level docs are still walked normally.

If the snapshot was already collected in this Reversa session (e.g. orchestrator's migration prompt collected it synchronously, see `agents/reversa/SKILL.md`), step 1 is a no-op: the CLI is idempotent on snapshot calls — re-running just refreshes timestamps. If the user wants a guaranteed fresh snapshot they run `/reversa-content-server` (doctor) explicitly.
```

#### §C — Inventory rendering trigger (insert at end of "Output")

```markdown
## Output addendum — render CS Profile section (when cs-agent integration is enabled)

If `surface.json.signals[]` contains `cs_agent_profile_detected` AND `[integrations.cs_agent].enabled = true` AND the snapshot succeeded (no `cs_agent_snapshot_failed`):

After writing your standard `inventory.md`, shell the CLI to render the CS Profile section:

```
reversa content-server inventory --write
```

The CLI:

- Reads `.reversa/context/cs-agent/_meta.json` and validates the commit marker.
- Renders an idempotent block between `<!-- reversa:cs-profile:begin -->` and `<!-- reversa:cs-profile:end -->` markers.
- If the block already exists in `inventory.md`: replaces it. Otherwise: appends it at the end.
- If validation fails (no/invalid snapshot, missing data files): refuses to write; surfaces the reason. Scout treats this as a non-fatal warning and continues.

The block contents are governed by the CLI; do not generate the section text yourself in this skill. The block looks like:

```markdown
<!-- reversa:cs-profile:begin -->
## CS Profile (cs-agent)

- Profile: `CS253`
- Content Server install (`ot_home`): `E:\CS253`
- cs-agent workdir: `E:\CS253_workdir`
- CSGraph schema: v3
- Indexed: 34,171 source files, 940,729 nodes, 2,251,241 edges, 24,227 support assets, across 148 modules
- Extraction errors: 82 files

### Top modules (by node count)
| Module | Nodes |
|---|---|
| `xenggis` | 8,125 |
| ... (top 10) | |

### Unresolved references (candidate gaps for human review)
| Kind | Count |
|---|---|
| `feature_call` | 480,631 |
| ... | |

### Confidence breakdown (cs-agent edge labels)
| cs-agent label | Reversa mapping | Count |
|---|---|---|
| `resolved` | 🟢 CONFIRMED | 2,058,117 |
| ... | | |

> Source: `.reversa/context/cs-agent/graph-status.json` collected <ISO timestamp>. Refresh with `/reversa-content-server`.
<!-- reversa:cs-profile:end -->
```

If the snapshot is stale (older than `snapshot_ttl_days`), the CLI prepends a warning callout inside the block. The block is still rendered.
```

---

## 3. Patch — `agents/reversa/SKILL.md` (orchestrator) — migration path

### A. Where to add

After Scout has run and recorded signals, at the first checkpoint, before the Archaeologist phase. This is the **migration path** for projects where Reversa was installed before cs-agent was reachable (or where the installer was skipped).

### B. New content

```markdown
## Content Server integration enablement (migration path for already-installed projects)

After Scout completes its first run on this project (i.e., this is the first checkpoint), check whether to offer Content Server integration. This branch is skipped on subsequent sessions unless the user's environment has changed.

1. Read `surface.json.signals[]`. If there is no entry of type `cs_agent_profile_detected`, skip this section entirely (no cs-agent on this host, or detection failed).

2. Read `.reversa/config.toml` `[integrations.cs_agent].enabled`. If already `true`, skip — integration is on; Scout has handled snapshot and inventory in this same run.

3. Read `.reversa/state.json` `cs_agent_enablement_dismissed`. If it exists and its `fingerprint` field **matches** the current detection, skip (user already declined for this specific configuration). The fingerprint is:

   ```json
   {
     "profile": "<active profile from detect>",
     "ot_home": "<ot_home from detect>",
     "executable_path": "<from detect.executable_trust.path>",
     "help_sha256": "<from detect.executable_trust.helpSignatureSha256>"
   }
   ```

   Mismatch (any field different) = re-ask. This means a user who installed a newer cs-agent, moved the project under a different CS tree, or switched profiles gets the prompt again.

4. If the detection found 2+ profiles, ask the user to choose:

   > "[Name], I detected multiple cs-agent profiles available:
   >   1. CS253  — ot_home E:\CS253, workdir E:\CS253_workdir
   >   2. OTHER  — ot_home E:\OTHER, workdir E:\OTHER_workdir
   >
   > Which profile should Reversa use for this project? [1/2/skip]"

   Persist the chosen profile name into the fingerprint and continue to step 5. If "skip", treat as a no answer in step 6.

5. Present the enablement prompt verbatim, substituting the actual values from the signal payload:

   > "[Name], I detected a cs-agent install at `<executable>` with profile `<profile>` (Content Server install at `<ot_home>`).
   >
   > Enable Reversa's Content Server integration for this project?
   >
   > When enabled, Reversa will:
   > - Use cs-agent's graph index instead of walking `<workdir>/srcmodules/` directly (`<node_count>` nodes, `<edge_count>` edges already indexed)
   > - Add a `## CS Profile (cs-agent)` section to `inventory.md` with real counts
   >
   > Phase 1 only does recognition + inventory. No other spec files are generated from cs-agent yet — that comes in later phases.
   >
   > Enable? [y/N]"

6. On `y` (yes):

   - Write to `.reversa/config.toml`:

     ```toml
     [integrations.cs_agent]
     enabled = true
     profile = "<profile>"
     ot_home = "<ot_home>"
     workdir = "<workdir>"
     ```

   - Write to `.reversa/config.user.toml` (preserve any existing content):

     ```toml
     [integrations.cs_agent]
     executable = "<executable_path>"
     ```

   - Collect snapshot + render inventory synchronously so the user sees the result this session:

     ```
     reversa content-server snapshot --profile <profile>
     reversa content-server inventory --write
     ```

   - Confirm to the user:

     > "Enabled. The CS Profile section is now in `_reversa_sdd/inventory.md`. Run `/reversa-content-server` any time to refresh the snapshots."

   - Continue with the normal post-Scout flow (Archaeologist phase). The deep walk under `srcdir` already happened in this run (Scout couldn't skip it without enablement); future `/reversa` runs will skip it.

7. On `n` (or empty / negative):

   - Write to `.reversa/state.json`:

     ```json
     {
       "cs_agent_enablement_dismissed": {
         "fingerprint": {
           "profile": "<profile>",
           "ot_home": "<ot_home>",
           "executable_path": "<executable>",
           "help_sha256": "<help signature>"
         },
         "dismissed_at": "<ISO-8601>"
       }
     }
     ```

   - Confirm:

     > "Skipped. Run `/reversa-content-server` later if you change your mind, or rerun `/reversa` after your cs-agent setup changes."

   - Continue with the normal post-Scout flow.

The fingerprint comparison ensures the user is re-asked when their environment changes meaningfully (new cs-agent binary, different profile, moved project). They are not nagged within a stable configuration.
```

---

## 3bis. Patch — installer (`lib/installer/prompts.js` + `lib/installer/writer.js`) — preferred path

### A. Where to add

After the existing prompts collect project name and standard preferences but **before** any Scout invocation. The installer is the **preferred enablement path** because it enables the fast path on the very first `/reversa`.

### B. New content (conceptual; integrator adapts to existing installer style)

```js
// lib/installer/prompts.js
// After the existing prompt array, before resolveTeamDependencies():

const csAgentProbe = await import('../commands/content-server.js')
  .then(m => m.probe({ jsonMode: true, quiet: true }))
  .catch(() => ({ ok: false, error: { code: 'probe_failed' } }));

if (csAgentProbe.ok) {
  const detect = await import('../commands/content-server.js')
    .then(m => m.detect({ jsonMode: true, quiet: true, executable: csAgentProbe.data.executableTrust.path }));

  if (detect.ok && detect.data.profiles.length > 0) {
    let chosenProfile;
    if (detect.data.profiles.length === 1) {
      chosenProfile = detect.data.profiles[0];
    } else {
      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'csProfile',
        message: 'Multiple cs-agent profiles found. Pick one for this project:',
        choices: detect.data.profiles.map(p => ({
          name: `${p.name}  (ot_home=${p.ot_home}, path_checks=${p.path_checks_green ? 'green' : 'issues'})`,
          value: p,
        })).concat([{ name: 'Skip — do not enable cs-agent integration', value: null }]),
      }]);
      chosenProfile = answer.csProfile;
    }

    if (chosenProfile) {
      const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'enableCsAgent',
        message: `Enable cs-agent integration for this project? Profile '${chosenProfile.name}' (${chosenProfile.ot_home}). When enabled, Reversa skips walking the CS source tree (already indexed by cs-agent, ${chosenProfile.raw?.graph_node_count ?? 'many'} nodes) and writes a CS Profile section into inventory.md.`,
        default: true,
      }]);

      if (answer.enableCsAgent) {
        answers.csAgent = {
          enabled: true,
          profile: chosenProfile.name,
          ot_home: chosenProfile.ot_home,
          workdir: chosenProfile.workdir,
          executable: csAgentProbe.data.executableTrust.path,
        };
      } else {
        answers.csAgent = {
          enabled: false,
          dismissedFingerprint: {
            profile: chosenProfile.name,
            ot_home: chosenProfile.ot_home,
            executable_path: csAgentProbe.data.executableTrust.path,
            help_sha256: csAgentProbe.data.executableTrust.helpSignatureSha256,
          },
        };
      }
    }
  }
}
```

```js
// lib/installer/writer.js
// In the section that writes config.toml, after the existing replacements:

if (answers.csAgent?.enabled) {
  config += `\n[integrations.cs_agent]\nenabled = true\nprofile = "${answers.csAgent.profile}"\not_home = "${answers.csAgent.ot_home.replace(/\\/g, '\\\\')}"\nworkdir = "${answers.csAgent.workdir.replace(/\\/g, '\\\\')}"\nsnapshot_ttl_days = 7\n`;
}

// In the section that writes config.user.toml:
if (answers.csAgent?.enabled) {
  configUser += `\n[integrations.cs_agent]\nexecutable = "${answers.csAgent.executable.replace(/\\/g, '\\\\')}"\n`;
}

// In the section that writes state.json:
if (answers.csAgent?.dismissedFingerprint) {
  state.cs_agent_enablement_dismissed = {
    fingerprint: answers.csAgent.dismissedFingerprint,
    dismissed_at: new Date().toISOString(),
  };
}
```

When the installer enables the integration, the very first `/reversa` in the project will (a) Scout detects the signal, (b) Scout sees `enabled = true`, (c) Scout collects snapshot and skips the deep walk, (d) Scout shells `inventory --write` to render the section. No two-run required.

---

## 4. Patch — `templates/config.toml`

Add after the existing `[analysis]` section, before `[specs]`:

```toml
[integrations.cs_agent]
# OpenText Content Server integration via cs-agent.exe.
# Off by default. Enabled by the installer (preferred) or orchestrator after asking the user.
# See agents/reversa-content-server/SKILL.md for the operating contract.
enabled = false

# cs-agent profile name to pin on every call (e.g. "CS253").
# Populated automatically when integration is enabled.
profile = ""

# Read-only mirrors of fields cs-agent owns. Populated by Reversa on enable;
# used only for prompt defaults and the inventory section. Reversa never edits
# cs-agent's source of truth.
ot_home = ""
workdir = ""

# Snapshots older than this are marked stale in any spec output that cites them.
# Refresh via /reversa-content-server or `reversa content-server doctor`.
snapshot_ttl_days = 7
```

## 5. Patch — `templates/config.user.toml`

Add commented example (matches existing convention):

```toml
# Example: enable the cs-agent integration with a machine-local executable path.
# The installer fills this in automatically on machines where cs-agent is reachable.
# [integrations.cs_agent]
# executable = "F:\\smoke\\CS253\\cs-agent.exe"
```

---

## 6. Patch — `bin/reversa.js` (CLI registration)

In the existing command dispatcher (currently handles `install`, `status`, `update`, `add-agent`, `add-engine`, `uninstall`), add:

```js
// Existing top-level help line gets one more entry:
//   content-server  Manage the cs-agent integration (probe, detect, snapshot, inventory, doctor)

// In the command switch:
case 'content-server':
  const { run: runCs } = await import('../lib/commands/content-server.js');
  await runCs(restArgs);
  break;
```

The top-level help string (currently in `bin/reversa.js`) gains a `content-server` line. The PT comment that previously said `Comando desconhecido:` is now in English (already fixed in the rebranding turn).

`reversa content-server` with no args prints its own help (listing probe/detect/snapshot/inventory/doctor); the dispatch lives in `lib/commands/content-server.js` per [01-adapter-api.md](01-adapter-api.md) §B.

---

## 7. New JS files (summary)

Files added in phase 1:

| File | Purpose | Detail |
|---|---|---|
| `lib/integrations/cs-agent.js` | Adapter (trust boundary) | [01-adapter-api.md](01-adapter-api.md) §A |
| `lib/commands/content-server.js` | CLI dispatcher for the `content-server` subcommand tree | [01-adapter-api.md](01-adapter-api.md) §B |
| `lib/integrations/__tests__/cs-agent.test.js` | Unit tests with stubbed child_process | [03-phase-1-acceptance.md](03-phase-1-acceptance.md) §5 |
| `lib/commands/__tests__/content-server.test.js` | CLI unit tests (argv, exit codes, idempotent inventory writer) | §5 |
| `scripts/test-cs-agent-integration.mjs` | Integration test against real cs-agent, gated by `RUN_CS_AGENT_TESTS=1` | §5 |

Files patched in phase 1:

| File | Patch |
|---|---|
| `bin/reversa.js` | Register `content-server` command + help line |
| `lib/installer/prompts.js` | Add probe + detect + enablement prompt |
| `lib/installer/writer.js` | Write `[integrations.cs_agent]` to config files + fingerprint to state.json |
| `lib/commands/uninstall.js` | Remove `.reversa/context/cs-agent/` on uninstall |
| `lib/commands/update.js` | Preserve `.reversa/context/cs-agent/` on update; if `config.toml`'s `[integrations.cs_agent]` block exists, do not overwrite |
| `agents/reversa-scout/SKILL.md` | §2 patches (A, B, C) |
| `agents/reversa/SKILL.md` | §3 migration patch |
| `templates/config.toml` | §4 |
| `templates/config.user.toml` | §5 |

Files created:

| File | Source |
|---|---|
| `agents/reversa-content-server/SKILL.md` | §1 |

---

## 8. .gitignore guidance

The integration writes to `.reversa/context/cs-agent/` which includes the snapshot, the commit marker, and the adapter log. Recommendation: add to the project's `.gitignore` (the installer can do this opt-in):

```
.reversa/context/cs-agent/
```

The log contains profile names, command names, and absolute paths from the local cs-agent install — not appropriate for sharing across a team. The snapshots are machine-local in spirit (they reference absolute paths on the host).

Phase 2 may revisit if module dossiers or other shared artifacts justify checking in normalized versions.
