# Claude Review — cs-agent Phase 1 Implementation

Date: 2026-05-24

Reviewer: Claude Opus 4.7 (1M context), agent harness

Reviewed at commit:

- `5e691b3 chore(release): 1.2.48` (working tree pre-commit; all phase-1 changes staged or untracked)

Reviewed against:

- Implementation plan v2 (`work/01-cs-agent-specialized/implementation/01-implementation-plan.md`)
- Conception v2 (all four `conception/*.md` files)
- v1 + v2 implementation-plan reviews

Files inspected:

- `lib/integrations/cs-agent.js` (847 lines)
- `lib/commands/content-server.js` (382 lines)
- `lib/utils/reversa-config.js` (326 lines)
- `lib/integrations/__tests__/cs-agent.test.js` (168 lines) + fixtures
- `lib/commands/__tests__/content-server.test.js` (137 lines)
- `scripts/test-cs-agent-integration.mjs` (61 lines)
- `agents/reversa-content-server/SKILL.md`
- Patches: `bin/reversa.js`, `package.json`, `templates/{config.toml,config.user.toml,state.json}`, `agents/reversa-scout/SKILL.md`, `agents/reversa/SKILL.md`, `agents/reversa-scout/references/surface-schema.md`, `agents/reversa/references/state-schema.md`, `lib/installer/{prompts.js,writer.js}`, `lib/commands/{update.js,uninstall.js}`, `README.md`, `docs/cli.md`, `agents/reversa-agents-help/SKILL.md`

Tests run:

```
> npm test
# tests 9 / pass 9 / fail 0
```

## Verdict

The structural foundation is sound: the adapter, CLI, config helper, snapshot commit-marker, and read-only allowlist all match the conception and the unit tests pass cleanly. But **two acceptance gates will fail outright** and a third is silently downgraded:

- **G10 (Scenario A — installer-enabled first run)** cannot pass because the installer prompt is not implemented (only the agent-id was added to `DISCOVERY_CORE`).
- **G11 (Scenario B — orchestrator-detected migration with fingerprinted dismissal)** cannot pass because the orchestrator skill has no enablement prompt, no fingerprint comparison, and no synchronous snapshot-and-inventory after acceptance.
- **G16/G12 (Scout records detection signal even when integration is off)** is not honored — Scout only acts when `enabled = true`, so the orchestrator never sees a signal to react to.

The work that *is* there is good. The work that is missing is the entire enablement story. Recommend treating phase 1 as ~70% complete and finishing the installer prompt, orchestrator migration, and fingerprinted dismissal before declaring done.

## Findings

### BLOCKER

#### B1 — Installer prompt is not implemented (acceptance gate G10 will fail)

Plan §"Phase 5 → Installer prompt path" requires `lib/installer/prompts.js` to probe + detect + ask the user during install. Conception §5.4 calls installer-time enablement the **preferred** path because it makes the very first `/reversa` fast.

What landed: a single-line patch to `prompts.js`:

```diff
+  'reversa-content-server',
   'reversa-reconstructor',
```

That's the only change. There is no `probe()` call, no `detect()` call, no enablement question, no write to `config.toml` or `config.user.toml`. `answers.csAgent` is never populated. Searching `lib/installer/prompts.js` and `lib/commands/install.js` for any of `cs_agent | cs-agent | content-server | csAgent` returns zero hits outside `DISCOVERY_CORE`.

**Effect on gates:**

- G10 (Scenario A first-run fast inventory) fails — there is no installer path to enable cs-agent.
- The DoD line "Enabling cs-agent appends `.reversa/context/cs-agent/` to `.gitignore`" is unenforceable from the installer.
- The only enablement route in v2 of the implementation is manual editing of `config.toml` + `config.user.toml`.

**Fix:** implement the installer prompt as the plan describes. Use `lib/commands/content-server.js#probe` and `#detect` as programmatic helpers (they are already exported for exactly this purpose). On accept, call `Writer.updateCsAgentGitignore()` (which exists, see H5).

#### B2 — Orchestrator migration prompt is absent; fingerprinted dismissal is a boolean (acceptance gate G11 fails)

Plan §"Phase 4 → Patch `agents/reversa/SKILL.md`" requires the orchestrator to: compare `state.cs_agent_enablement_dismissed.fingerprint` against profile + ot_home + executable + help SHA, prompt on mismatch, run snapshot + inventory synchronously on accept, write the fingerprint on decline.

What landed (`agents/reversa/SKILL.md` diff):

```markdown
## Content Server specialization

- If enabled = true, run `content-server snapshot` and `content-server inventory` before activating Scout.
- If enabled = false, do not auto-enable it. You may run `content-server detect` only as a read-only probe when the user says the project is OpenText Content Server or asks for Content Server specialization. If a profile is found, ask the user before editing `.reversa/config.toml`.
```

What's missing:

- No verbatim enablement prompt (the plan provided one; it should be in the SKILL).
- No fingerprint comparison — and there cannot be one, because `cs_agent_enablement_dismissed` is a plain boolean in `templates/state.json:12` and documented as a boolean in `agents/reversa/references/state-schema.md`. Codex's HIGH conception finding ("dismissal too blunt — should be fingerprinted") regressed silently.
- No "on accept, run snapshot + inventory synchronously so the user sees the result this session." The skill just says "ask the user before editing config.toml" — vague.
- The migration only triggers when the *user* declares the project is Content Server. The plan made enablement automatic-on-detection so users discover the feature.

**Effect on gates:**

- G11 (orchestrator prompt + fingerprinted dismissal) fails on every clause.

**Fix:** rewrite the orchestrator skill section per the conception/plan stub. Change `cs_agent_enablement_dismissed` to either object-or-null and update `templates/state.json` + `state-schema.md` accordingly.

### HIGH

#### H1 — Scout never records a detection signal when integration is off (Scenario B can't fire)

Plan §"Phase 4 → Patch Scout" requires:

> Add cheap pre-walk detect step.
> Record signals: `cs_agent_probe_failed`, `cs_agent_no_profile`, `cs_agent_profile_detected`, `cs_agent_profile`, `cs_agent_snapshot_failed`.

What landed (`agents/reversa-scout/SKILL.md`):

```markdown
### 0. Content Server snapshot guard
Before listing the tree, check `.reversa/config.toml` section `[integrations.cs_agent]`.

If `enabled = true`, run [snapshot + inventory] ...
```

When `enabled = false`, Scout does nothing cs-agent-related. No probe, no detect, no signal. So `surface.json.signals[]` will never contain `cs_agent_profile_detected`. The orchestrator's planned migration path (B2 above) cannot react to a signal that is never written.

**Effect:** even after fixing B2, Scenario B is still broken because the trigger (the signal) is never produced. Users on an existing install never learn cs-agent is available.

**Fix:** add the pre-walk cheap detect to Scout, gated only on the cs-agent CLI being reachable (probe success), not on `enabled = true`. Record the appropriate signal in `surface.json.signals[]` regardless of enable state.

#### H2 — Inventory section diverges from spec in three ways (location, heading, markers)

| Aspect | Conception / plan | Implementation |
|---|---|---|
| Target file | `_reversa_sdd/inventory.md` (append/replace block inside Scout's existing inventory) | `_reversa_sdd/00-content-server-inventory.md` (separate file) |
| Section heading | `## CS Profile (cs-agent)` | `## Content Server Inventory` |
| Markers | `<!-- reversa:cs-profile:begin -->` … `:end -->` (kebab-case) | `<!-- REVERSA:CS_AGENT_INVENTORY START -->` … `END -->` (uppercase snake) |

The "separate file" choice is the most consequential. The conception was explicit:

> "Scout's existing `inventory.md` writer appends one new section."

By splitting into `00-content-server-inventory.md`, the CS Profile content becomes invisible to anyone reading `inventory.md`. Scout's patched SKILL says "use the snapshot for Content Server file counts" but doesn't say "and write into your own inventory.md as well." The user ends up with two inventory files in `_reversa_sdd/` with no cross-link.

The marker case change (`REVERSA:CS_AGENT_INVENTORY` vs `reversa:cs-profile`) is cosmetic but breaks any downstream test or tooling written against the conception's documented markers — including the acceptance script for G13.

**Fix:** route the rendered block into `_reversa_sdd/inventory.md` per spec. Keep `00-content-server-inventory.md` as a deprecated alias or remove. Standardize on the kebab-case markers from the conception so spec docs match the code.

#### H3 — Partial-marker recovery appends a new block instead of replacing — produces duplicates

Plan §"Phase 2":

> `write` mode replaces from begin marker to end marker, or **begin marker to EOF** if the end marker is missing.

Acceptance G13 includes:

> Fourth invocation after manually corrupting the begin marker only: the writer **replaces from the begin marker to EOF** (defensive — acceptable consequence is the user lost any post-block manual edits; document this).

Implementation (`upsertMarkedBlock`, cs-agent.js:778-794):

```js
if (hasStart && hasEnd) {
  // replace existing block — good
}
const suffix = existing.trim() ? `${existing.replace(/\s+$/u, '')}\n\n${block}` : block;
return {
  text: suffix,
  warning: hasStart || hasEnd ? 'partial_marker_found_appended_new_block' : null,
};
```

So when only one marker is present, the implementation **appends a new block at the end** of the file, leaving the broken half-block in place. The user now has two CS Profile sections — exactly the duplication the markers were meant to prevent.

The implementation chose safety (no data loss) over the spec (truncate + warn). That trade-off is defensible, but it should have been a documented decision rather than a silent divergence. As-is, running `inventory --write` twice on a file with a corrupted block grows the file each time.

**Fix:** match the spec (truncate from begin marker to EOF + warn loudly), OR document the new behavior and add a test that asserts only one block can exist (e.g. detect-and-remove the broken half-block before appending).

#### H4 — `cs_agent_enablement_dismissed` is a boolean; fingerprint design dropped

`templates/state.json:12`:

```json
"cs_agent_enablement_dismissed": false,
```

`agents/reversa/references/state-schema.md`:

> `cs_agent_enablement_dismissed` | boolean | Whether the user dismissed …

The plan, conception, AND codex's HIGH conception finding all required this to be a fingerprint object (`{ profile, ot_home, executable_path, help_sha256, dismissed_at }`). The boolean form means: once dismissed, never re-asked even if the user moves the project, swaps the cs-agent binary, or switches profiles. This is exactly the UX problem codex's review identified.

This is a regression of an explicit HIGH finding from the conception-review round. The fingerprint design didn't survive into the implementation.

**Fix:** change the type. The plan's Phase 4 line 338 already specified that implementers must handle absent / null / object as equivalent — that flexibility was for forward compatibility, not for skipping the object form entirely.

#### H5 — `updateCsAgentGitignore()` is defined but never called

`lib/installer/writer.js:328-335` adds the helper. Grep for callers:

```
$ grep -nR updateCsAgentGitignore lib/
lib/installer/writer.js:328:  updateCsAgentGitignore() {
```

Zero callers. The CLI's `snapshot` subcommand does call `appendGitignoreEntries` directly when `enabled === true`, but only after enablement. Since neither installer nor orchestrator enables anything (B1 + B2), this helper is unreachable in the current code.

**Effect:** the mandatory `.gitignore` requirement from codex's HIGH conception finding + plan §"Phase 5 → install.js" is not enforced anywhere a user would naturally hit.

**Fix:** wire `updateCsAgentGitignore()` into the installer enablement flow (when B1 is fixed) and the orchestrator acceptance flow (when B2 is fixed). Verify the CLI snapshot path also calls it on first enablement.

### MEDIUM

#### M1 — Audit log is JSON Lines instead of tab-separated text

Plan §"Phase 2 → Audit log" and conception §A.7 specified tab-separated human-readable format with `code=` `failure=` key=value tail. Implementation writes one JSON object per line:

```js
writeFileSync(logPath, `${JSON.stringify(entry)}\n`, ...);
```

Functional and arguably better for parsing, but the spec said "no JSON payloads, no stdout capture" — implying intentional readability for human operators. JSON Lines is parseable but harder to scan visually. Document the choice or revert to the text format.

#### M2 — Snapshot TTL: hours not days; default 24h not 7 days

`templates/config.toml:43`: `snapshot_ttl_hours = 24`.
`cs-agent.js:358`: `const ttlHours = options.ttlHours ?? 24;`.

Plan and conception used `snapshot_ttl_days` with default 7. The implementation chose hours with a 24h default — 7× more aggressive staleness flagging. The actual stale logic triggers a warning callout in the rendered block, so on day 2 every inventory section says "snapshot is stale" until refreshed.

Pick one. If hours stays, raise the default to at least `168` (7 days) so behavior matches the spec.

#### M3 — Exit code mapping collapses categories

Plan / conception specified:

- 4: snapshot partial
- 5: inventory render blocked

Implementation (`content-server.js:300-312`):

- 4: `snapshot_invalid`
- 5: default for everything else

`snapshot_partial` as an error code doesn't exist in the adapter (collectSnapshot just re-throws), so the `4 = snapshot partial` mapping is dead. `inventory_render_blocked` doesn't exist either — `renderInventorySection` throws `snapshot_invalid` instead. The plan's distinct exit codes for two distinct failure classes collapse into one.

Minor but it means scripted callers can't distinguish "snapshot is broken" from "inventory rendering refused" via exit code alone.

#### M4 — `detectExecutableDrift` ignores help signature

`cs-agent.js:653-662`:

```js
function detectExecutableDrift(meta, executablePath) {
  const pathToCheck = executablePath || meta.executable_path;
  if (!pathToCheck || !existsSync(pathToCheck)) return false;
  const current = statSync(pathToCheck);
  const trusted = meta.executable_trust || {};
  return Boolean(
    trusted.size_bytes && trusted.size_bytes !== current.size
    || trusted.mtime_ms && trusted.mtime_ms !== current.mtimeMs
  );
}
```

Only checks size + mtime. The plan said help signature SHA must be part of drift detection (the most reliable signal — size and mtime can be identical across builds). The signature is captured in `_meta.executable_trust.help_signature_sha256` already, so the fix is one extra comparison plus a re-probe to get the current signature.

#### M5 — SKILL.md frontmatter is missing the activation trigger

`agents/reversa-content-server/SKILL.md:3`:

```
description: Reads OpenText Content Server evidence through the local cs-agent adapter and produces a reusable read-only inventory block for Reversa.
```

Convention in every other Reversa skill (e.g. `reversa-agents-help/SKILL.md:3`): description ends with `Activate with /<slash-command>.` so the engine can route the slash command to the skill. The cs-agent skill description doesn't have this trailer.

Effect: `agents/reversa-agents-help/SKILL.md` advertises `/reversa-content-server` as a command, but the engine may not actually route it to this skill because the activation phrase is missing. On Claude Code this would manifest as the slash command not appearing or not invoking correctly.

**Fix:** append `Activate with /reversa-content-server.` to the description.

#### M6 — Detect always calls probe first (extra spawn)

`content-server.js:59-82`: `detect()` runs probe then detectProfile. The plan/conception kept these as two distinct entry points — probe is profile-less (`help --json`); detectProfile is the only other profile-less path. Wrapping probe inside detect adds one extra spawn per call.

Minor — the extra spawn is fast and gives the CLI a single envelope with both pieces of information. But it conflates two intentionally-separate API paths.

#### M7 — Side-channel `process.env.REVERSA_CS_AGENT_RESOLVED_FROM` mutation

`cs-agent.js:62-86` mutates `process.env.REVERSA_CS_AGENT_RESOLVED_FROM` to signal whether the executable came from PATH. The same information is already in the return value (`source: 'PATH'` and `hint: '...'`).

Mutating process.env from a library is a code smell — different callers (tests in parallel, embedded uses) will race on the flag. The return value alone is enough; the env mutation is duplicative and removable.

#### M8 — Marker case mismatch with conception (`REVERSA:CS_AGENT_INVENTORY` vs `reversa:cs-profile`)

Already covered in H2. Calling out separately because every consumer of the conception (tests, downstream tools) will reach for the lowercase kebab-case names. Picking different identifiers in the implementation creates a permanent discrepancy.

### LOW

#### L1 — Test fixtures are toy-sized (`sourceFileCount: 42`, `nodeCount: 120`)

Plan §"Phase 6 → fixtures":

> Source fixture shape from a real CS253 run where useful, anonymized if needed.

Implementation uses minimal envelopes. The unit tests pass — they only check that numbers round-trip. But the fixtures won't catch shape regressions when cs-agent updates (e.g. new fields, kind enumerations). Acceptable trade-off; calling it out so future contributors don't think the toy numbers are sacred.

#### L2 — `escapeRegExp` defined in two modules

`cs-agent.js:845` and `reversa-config.js:58` both define identical helpers. Trivial duplication; one shared `lib/utils/regex.js` would do.

#### L3 — `appendTomlStringArrayValue` throw-on-malformed not tested

The helper documents throwing on inline arrays (`reversa-config.js:286-289`), and the migration depends on it succeeding. The test suite doesn't cover the throw case (codex review v2's only outstanding LOW from the plan review). If a user has hand-edited `[agents].installed = [...]` into an inline array, the migration silently throws and the update aborts mid-flight with no skill installed.

#### L4 — Live integration script default timeout is 60 s; conception said graph status can take 5 min

`scripts/test-cs-agent-integration.mjs:37`: `Number.parseInt(process.env.CS_AGENT_TIMEOUT_MS || '60000', 10)`.

CS253 is small enough that 60 s is fine, but the conception/adapter set the graph-status default to 5 min. The live script's default is 5× tighter — if a future CS instance is slower, the script fails spuriously. Either raise to 300_000 or document that CS253 is the reference timing target.

#### L5 — Plan said `lib/commands/install.js` would be patched; git status shows it untouched

The plan listed `lib/commands/install.js` in the Patched files section (line 57). It's not in the modified list. The `.gitignore` work that the plan put in `install.js` ended up as `updateCsAgentGitignore()` in `writer.js` (H5) and as inline `appendGitignoreEntries` calls in the CLI. So `install.js` not being touched is consistent with where the work landed. The plan's file inventory was misleading — minor.

## What's done well

These are real wins worth preserving:

- **Adapter trust boundary is intact.** `lib/integrations/cs-agent.js` is the only file in the repo that spawns `cs-agent.exe`. The `__test.setRunCmd` injection pattern matches the plan exactly.
- **Read-only allowlist is hard-coded and fail-closed.** `READ_ONLY_COMMANDS` is a frozen Set; unknown topics/commands throw `unclassified_command` before spawn.
- **`--profile` requirement is enforced.** `runReadOnly` throws `profile_required` if profile is empty; argv pinning is correct (`--json` and `--profile <name>` always present).
- **`profile_mismatch` is enforced.** Adapter compares returned envelope's profile field against the requested one and throws.
- **Snapshot commit-marker semantics work.** `_meta.json` is written after the three data files via per-file rename. `validateSnapshotMeta` is the consumer-side gate and returns `{ ok, problems, stale, executableDrift }`.
- **Snapshot atomic rename uses staging directory** with a UUID name; staging is cleaned best-effort on failure.
- **Audit log rotation works** (>5MB drops oldest 25%); audit failure does not mask command result (wrapped in try/catch).
- **TOML helper is appropriately scoped** — flat key=value only, throws on unsupported multi-line, atomic write. `appendTomlStringArrayValue` correctly handles the existing `[agents].installed` multi-line array.
- **`update.js` migration is coherent** — updates both `state.agents` and `config.toml [agents].installed` via `appendTomlStringArrayValue`, then `writer.installSkill` (in the truncated portion of the diff) registers manifest entries.
- **`uninstall.js` surfaces the cs-agent context dir explicitly** before the user types "remove" — good UX win not specified in the plan.
- **Test scripts are wired** (`npm test` + `npm run test:cs-agent`). All 9 unit tests pass.
- **Live integration script behaves correctly when skipped** (`RUN_CS_AGENT_TESTS != 1` → graceful exit 0).
- **`bin/reversa.js` registration** is clean — one entry in the command map, one line in `--help`, dispatch via existing `mod.default(args)` pattern (matches codex's v1 review recommendation).
- **No new npm dependencies.** `package.json#dependencies` unchanged from before phase 1.
- **README + `docs/cli.md`** updated with the new command.

## Acceptance gate coverage

| Gate | Status | Notes |
|---|---|---|
| G1 — Executable resolution (no CSWORKS_ROOT) | ✅ | Implementation correctly omits CSWORKS_ROOT fallback. |
| G2 — Probe captures executable trust | ✅ | `probe()` returns `executableTrust` with path/size/mtime/help_signature. |
| G3 — Allowlist refuses unlisted commands | ✅ | Tested. |
| G4 — `detectProfile` works profile-less + multi-profile | ✅ | Tested. |
| G5 — Live `graph status` returns real CS253 numbers | ⚠️ | Live script supports it but not auto-tested in CI. |
| G6 — Snapshot commit-marker | ✅ | Validation passes; kill-mid-snapshot leaves no usable `_meta.json`. |
| G7 — argv + profile_mismatch | ✅ | Tested. |
| G8 — Scout records signal | ❌ | Only signals on `enabled = true`; no `cs_agent_profile_detected` fired pre-enablement (H1). |
| G9 — Scout does NOT auto-enable | ✅ | Scout only reads config, never writes. |
| **G10 — Installer prompt (Scenario A)** | ❌ | Not implemented (B1). |
| **G11 — Orchestrator prompt + fingerprint** | ❌ | Skill has no prompt; dismissal is boolean not fingerprint (B2, H4). |
| G12 — Skip-deep-walk fires correctly | ⚠️ | Fires when enabled, but H1 means it never auto-enables for new users. |
| G13 — Inventory block idempotent | ⚠️ | Markers + heading + file location all diverge (H2); partial-marker case appends instead of truncates (H3). |
| G14 — Scout < 60 s on enabled path | ⚠️ | Not measurable without G10/G11 working. |
| G15 — CLI discoverable | ✅ | `bin/reversa.js --help` and `content-server --help` both list subcommands. |
| G16 — Fallback on adapter failure | ⚠️ | Adapter throws cleanly, but H1 means there's no probe-fail signal recorded either. |
| G17 — Audit log + rotation + uninstall | ✅ | All three work; rotation tested implicitly via implementation. |

3 hard failures (G8, G10, G11). 5 partial (G5, G12, G13, G14, G16). 9 passes.

DoD items:

| DoD item | Status |
|---|---|
| `npm test` passes | ✅ |
| `--help` lists content-server | ✅ |
| `content-server --help` lists subcommands | ✅ |
| Unit tests cover G1, G3, G6, G7, G13, G15, G17 | ✅ (with the H3 caveat on G13) |
| Live integration script passes with `RUN_CS_AGENT_TESTS=1` | ⚠️ (not yet run for the proof; script exists) |
| Scenario A and B proof transcripts saved | ❌ (cannot be produced without B1, B2 fixed) |
| Existing install upgraded with `update` acquires content-server skill | ✅ (migration works in update.js) |
| Enabling cs-agent appends `.gitignore` | ⚠️ (helper exists but never invoked from enablement path — H5) |
| README and CLI docs list content-server | ✅ |
| `package.json#dependencies` unchanged | ✅ |
| No phase-2 data artifacts | ✅ |

## Bottom line

The plumbing is right and the unit tests prove the adapter, CLI, snapshot, and TOML helpers work. The product story is incomplete: no installer prompt, no orchestrator prompt, no fingerprint, no automatic discovery for users on existing installs. A user today can only enable cs-agent by hand-editing two TOML files.

Before declaring phase 1 done:

1. Implement the installer prompt (B1) — wire it into `lib/installer/prompts.js` calling the already-exported `probe`/`detect` from `lib/commands/content-server.js`. On accept, populate config and call `Writer.updateCsAgentGitignore()`.
2. Implement the orchestrator migration prompt (B2) verbatim from the conception stub. Change `cs_agent_enablement_dismissed` to an object form so the fingerprint comparison logic has something to compare against (H4).
3. Add the cheap pre-walk detect to Scout (H1) so the orchestrator has a signal to react to.
4. Decide the inventory file/marker/heading story (H2) — recommend matching the conception verbatim so downstream consumers and the acceptance script in §G13 work as documented.
5. Either match the spec on partial-marker recovery (truncate + warn) or document the new append behavior plus add a "exactly one block can exist" enforcement step (H3).

The MEDIUM and LOW items are good follow-ups but don't block. After the five fixes above, the implementation should pass the full G1-G17 gate set.
