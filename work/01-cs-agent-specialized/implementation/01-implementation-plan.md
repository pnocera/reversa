# Implementation Plan - Reversa x cs-agent Phase 1

Date: 2026-05-24

Source documents:

- `work/01-cs-agent-specialized/conception/00-conception.md` v2
- `work/01-cs-agent-specialized/conception/01-adapter-api.md` v2
- `work/01-cs-agent-specialized/conception/02-skill-stubs.md` v2
- `work/01-cs-agent-specialized/conception/03-phase-1-acceptance.md` v2

Goal:

Ship Phase 1 only: Reversa detects an initialized cs-agent profile, caches read-only evidence, skips the large `srcmodules` walk when explicitly enabled, and renders one idempotent `## CS Profile (cs-agent)` block in `_reversa_sdd/inventory.md`.

Non-goals:

- Do not wrap `cs-agent init`, `init refresh`, build, lint, test, dev, csui, edit, xlate, or deployment workflows.
- Do not generate module dossiers, ERDs, permissions, routes, state machines, or phase-2 artifacts.
- Do not add MCP transport.

## Current Repo Constraints

- CLI entry point is `bin/reversa.js`; it currently dispatches a fixed command map.
- Reversa skills are Markdown files under `agents/`; they can shell CLI commands but should not import JS.
- Installer writes `.reversa/config.toml`, `.reversa/config.user.toml`, `.reversa/state.json`, and installed skill copies through `lib/installer/writer.js`.
- Existing `update` refreshes only skills listed in installed state. Because `reversa-content-server` is a new core skill, update must explicitly install it for existing projects or Scenario B will lack the doctor/contract skill.
- Installed agents are tracked in both `.reversa/state.json#agents` and `.reversa/config.toml` `[agents].installed`; migrations must keep both coherent.
- There is no current test script in `package.json`; use Node's built-in `node:test` rather than adding a test framework dependency.
- There is no TOML dependency. Keep config parsing scoped and local. No new runtime dependency is allowed in Phase 1 without a separate conception/review decision.

## File Plan

New files:

- `lib/integrations/cs-agent.js`
- `lib/commands/content-server.js`
- `lib/utils/reversa-config.js`
- `lib/integrations/__tests__/cs-agent.test.js`
- `lib/commands/__tests__/content-server.test.js`
- `scripts/test-cs-agent-integration.mjs`
- `agents/reversa-content-server/SKILL.md`

Patched files:

- `bin/reversa.js`
- `package.json`
- `templates/config.toml`
- `templates/config.user.toml`
- `templates/state.json`
- `agents/reversa-scout/SKILL.md`
- `agents/reversa/SKILL.md`
- `agents/reversa-scout/references/surface-schema.md`
- `agents/reversa/references/state-schema.md`
- `lib/installer/prompts.js`
- `lib/installer/writer.js`
- `lib/commands/install.js`
- `lib/commands/update.js`
- `lib/commands/uninstall.js`
- `README.md`
- `docs/cli.md`
- `docs/cli.pt.md`
- `docs/cli.es.md`

Verification-only help check:

- `agents/reversa-agents-help/SKILL.md` lists slash commands, not CLI commands today. Verify this remains true; skip if there is still no CLI command table.

## Phase 0 - Preflight

1. Confirm current tree before editing:
   - `git status --short`
   - `node --version`
   - `npm install` only if dependencies are missing.
   - Confirm the final `package.json#dependencies` is unchanged. Phase 1 adds no runtime dependency.

2. Confirm the live smoke path only with bounded read-only commands:
   - `F:\smoke\CS253\cs-agent.exe help --json`
   - `F:\smoke\CS253\cs-agent.exe profile info --json`
   - Avoid broad indexing or refresh commands.

3. Add test scripts:
   - `test`: `node --test`
   - `test:cs-agent`: `node scripts/test-cs-agent-integration.mjs`
   - The live script exits skipped unless `RUN_CS_AGENT_TESTS=1`.

Exit criteria:

- Unit test command exists even before tests are fully populated.
- No live cs-agent command mutates `E:\CS253` or `E:\CS253_workdir`.
- No new npm dependency is introduced.

## Phase 1 - Config Utilities

Add `lib/utils/reversa-config.js` with a deliberately narrow TOML helper:

- `readReversaConfig(projectRoot = process.cwd())`
  - Reads `.reversa/config.toml` and `.reversa/config.user.toml` if present.
  - Parses only the sections needed here: `[integrations.cs_agent]`, `[output]`, and `[user]`.
  - Merges `config.user.toml` over `config.toml` key by key.
  - Returns defaults when files or sections are absent.

- `upsertTomlSection(filePath, sectionName, values, options = {})`
  - Preserves unrelated sections and comments.
  - Replaces an existing section body or appends a new section.
  - Supports `options.insertAfter`, used as `insertAfter: "[analysis]"` for `[integrations.cs_agent]` so new files place the block before `[specs]`.
  - Escapes Windows paths correctly.
  - Writes atomically with tempfile + rename.
  - Edits as text, not by round-tripping a full TOML parser.
  - Supports only flat `key = value` lines in the target section: string, boolean, and integer.
  - Identifies the target section by exact header match, then replaces through the next section header or EOF.
  - Refuses to edit if the target section contains unsupported multi-line constructs such as arrays or inline tables; throw and leave the file untouched.

- `appendTomlStringArrayValue(filePath, sectionName, key, value)`
  - Dedicated helper for existing multi-line arrays such as `[agents].installed`.
  - Finds the exact section header and exact array key.
  - Adds a quoted string value only when absent.
  - Preserves existing order and formatting as much as practical.
  - Writes atomically.
  - Throws and leaves the file untouched if the array is malformed or inline.

- `appendGitignoreEntries(projectRoot, entries)`
  - Appends missing entries once.
  - Preserves existing file content.
  - Used for `.reversa/context/cs-agent/` independently of the user's specs git strategy.

- `escapeTomlString(value)` and small boolean/int render helpers.

- `resolveOutputFolder(config, state)`
  - Prefer `.reversa/state.json#output_folder`, then config `[output].folder`, then `_reversa_sdd`.

Test coverage:

- Missing config returns disabled defaults.
- `config.user.toml` executable overrides config executable.
- Upsert into a file without `[integrations.cs_agent]` creates the section at the requested position.
- Upsert into a file with `[integrations.cs_agent]` replaces only that section's values.
- Upsert preserves `[specs]` and user comments outside the target section.
- Windows paths round-trip with backslashes.
- Unsupported multi-line constructs inside the target section throw and leave the file unchanged.
- Appending `reversa-content-server` to `[agents].installed` works for the current multi-line array and is idempotent.
- `.gitignore` append helper adds `.reversa/context/cs-agent/` once and does not duplicate it.

Exit criteria:

- CLI and installer can share one config implementation.
- No command needs ad hoc regex edits to `.reversa/config.toml`.

## Phase 2 - Adapter Trust Boundary

Implement `lib/integrations/cs-agent.js` as the single place that spawns `cs-agent.exe`.

Exports:

- `ADAPTER_VERSION = "0.1.0"`
- `AdapterError`
- `resolveExecutable`
- `probe`
- `detectProfile`
- `runReadOnly`
- `collectSnapshot`
- `validateSnapshotMeta`
- `renderInventorySection`
- `isReadOnlyAllowed`

Implementation details:

- `resolveExecutable({ configured })`
  - Resolution order: configured path, caller/package directory `cs-agent.exe`, PATH (`where` on Windows, `which` elsewhere).
  - Ignore `CSWORKS_ROOT`.
  - If PATH is used, expose that fact to the CLI for a "pin this in config.user.toml" hint.

- `probe(executable)`
  - Spawn `help --json`.
  - Parse exactly one JSON envelope.
  - Compute SHA-256 over raw stdout.
  - Capture executable trust: path, mtime ISO, size bytes, help signature.
  - Cache per executable path within the Node process.

- `detectProfile(executable)`
  - The only profile-less profile command.
  - Spawn `profile info --json` without `--profile`.
  - Aggregate active and registry profiles.
  - For registry entries not already loaded, call `profile info --json --profile <name>`.
  - Return all profiles; never choose one.

- `runReadOnly(topic, command, opts)`
  - Reject empty profile with `profile_required` before spawn.
  - Enforce `READ_ONLY_ENABLED = { profile: info, graph: status, docs: categories }`.
  - Build exact argv `[topic, command, ...args, "--json", "--profile", profile, ...flags]`.
  - Use `spawn` with no shell.
  - Enforce timeouts and typed errors.
  - Verify `envelope.ok === true` and `envelope.profile === profile`.
  - Append the audit log line for success and failure.

- `collectSnapshot(opts)`
  - Create `.staging-<uuid>` under `.reversa/context/cs-agent/`.
  - Run `probe`, `profile info`, `graph status`, `docs categories` sequentially.
  - Write three snapshot files inside staging.
  - Build `_meta.json` with adapter version, profile, collected_at, snapshot file manifest, observed schema version, TTL, and executable trust.
  - Publish data files first, then `_meta.json` last as the commit marker.
  - Do not publish anything when a call fails before commit.
  - Clean staging best-effort.

- `validateSnapshotMeta(metaPath, opts)`
  - Synchronous file-system guard.
  - Return `{ ok, meta, problems, stale, executableDrift }`.
  - Invalid or missing marker means "do not consume".
  - Stale snapshots are readable but flagged.

- `renderInventorySection(opts)`
  - Validate snapshot marker first.
  - Read `profile-info.json`, `graph-status.json`, and `_meta.json`.
  - Render the markered block exactly once.
  - `write` mode replaces from begin marker to end marker, or begin marker to EOF if the end marker is missing.
  - `print` mode returns the block without touching `inventory.md`.
  - Include stale callout when applicable.

- Audit log
  - Path default: `.reversa/context/cs-agent/adapter.log`.
  - No JSON payloads, no stdout capture.
  - Rotate when appending would exceed 5 MB; drop oldest roughly 25 percent on line boundaries.

Test coverage:

- Resolution order including "ignore `CSWORKS_ROOT`".
- Allowlist rejects `dev checkout` without spawning.
- Empty profile rejects without spawning.
- Single-envelope parsing and multi-envelope failure.
- `detectProfile` is the only profile-less path.
- Profile mismatch throws.
- Snapshot commit marker order and validation failure cases.
- Inventory block append, replace, partial-marker recovery, stale callout.
- Partial-marker recovery prints a warning because it truncates from begin marker to EOF when the end marker is missing.
- Log rotation.

Implementation note:

- To keep unit tests clean under ESM + `node:test`, wrap `child_process.spawn` behind one internal `_runCmd(executable, argv, opts)` and expose a test-only surface:
  - `export const __test = { setRunCmd(fn), resetRunCmd() }`
  - Tests set the runner in `t.beforeEach` and reset it in `t.afterEach`.
  - Public adapter APIs do not accept spawn options.
  - Unit tests must not spawn the real cs-agent.

Exit criteria:

- `node --test lib/integrations/__tests__/cs-agent.test.js` passes.
- No other file spawns `cs-agent.exe`.

## Phase 3 - CLI Surface

Implement `lib/commands/content-server.js`.

Exports:

- `default async function contentServer(args)`
- Programmatic helpers for installer use:
  - `probe(options)`
  - `detect(options)`
  - `snapshot(options)`
  - `inventory(options)`
  - `doctor(options)`

Subcommands:

- `reversa content-server probe [--json] [--quiet] [--executable <path>]`
- `reversa content-server detect [--json] [--quiet] [--executable <path>]`
- `reversa content-server snapshot [--json] [--quiet] [--profile <name>] [--out-dir <path>] [--executable <path>] [--ttl-days <int>]`
- `reversa content-server inventory [--json] [--quiet] [--write | --print] [--inventory-path <path>] [--snapshot-dir <path>]`
- `reversa content-server doctor [--json] [--quiet]`

CLI rules:

- `probe` and `detect` work before enablement.
- `snapshot`, `inventory`, and `doctor` require `[integrations.cs_agent].enabled = true` unless explicit CLI flags make the operation test-only against a temp path.
- `--json` prints exactly one envelope: `{ ok, action, data?, error? }`.
- Human mode prints summaries, never raw cs-agent stdout.
- Exit codes:
  - `0`: ok
  - `2`: executable not found
  - `3`: other adapter error
  - `4`: snapshot partial
  - `5`: inventory render blocked

Patch `bin/reversa.js`:

- Add command map entry: `content-server`.
- Add top-level help line.
- Dispatch through the existing pattern: command modules default-export the runner and `bin/reversa.js` calls `await mod.default(args)`. Do not add a separate `run` alias.
- Ensure `reversa content-server --help` and bare `reversa content-server` print subcommand help.

Test coverage:

- Help lists all subcommands.
- JSON mode is a single envelope.
- Config-disabled behavior is correct.
- Exit code mapping is correct.
- Programmatic `probe()` and `detect()` return envelopes suitable for installer prompts.

Exit criteria:

- `node bin/reversa.js --help` includes `content-server`.
- `node bin/reversa.js content-server --help` lists `probe`, `detect`, `snapshot`, `inventory`, `doctor`.

## Phase 4 - Templates And Skills

Create `agents/reversa-content-server/SKILL.md` from `02-skill-stubs.md` section 1.

Patch `agents/reversa-scout/SKILL.md`:

- Add cheap pre-walk detect step.
- Record signals:
  - `cs_agent_probe_failed`
  - `cs_agent_no_profile`
  - `cs_agent_profile_detected`
  - `cs_agent_profile`
  - `cs_agent_snapshot_failed`
- When enabled and snapshot succeeds, skip only `profile-info.json.profile.paths.srcdir`.
- Keep normal walk for everything outside that exact directory.
- After standard `inventory.md` is written, shell `reversa content-server inventory --write`.
- Never edit config or state from Scout.

Patch `agents/reversa/SKILL.md`:

- Add migration prompt after Scout and before Archaeologist.
- Read `surface.json.signals[]`.
- Skip when enabled is already true.
- Compare `state.cs_agent_enablement_dismissed.fingerprint` against profile, `ot_home`, executable path, and help SHA.
- Prompt on mismatch or missing dismissal.
- On yes, write config, write executable override, run snapshot and inventory synchronously, then continue.
- On no, write the fingerprinted dismissal.

Patch templates:

- Add `[integrations.cs_agent]` default-off block to `templates/config.toml` after `[analysis]` and before `[specs]`.
- Add commented executable override to `templates/config.user.toml`.
- Add `cs_agent_enablement_dismissed: null` to `templates/state.json`.
- Implementers must treat all three states as equivalent where appropriate: field absent, field present as `null`, and field present as a dismissal object.

Patch schemas:

- `agents/reversa-scout/references/surface-schema.md` documents optional `signals[]` entries and cs-agent signal shapes.
- `agents/reversa/references/state-schema.md` documents `cs_agent_enablement_dismissed`.

Patch documentation:

- Add `npx @pnocera/reversa content-server` to the CLI command list in `README.md`.
- Add the same command to `docs/cli.md`, `docs/cli.pt.md`, and `docs/cli.es.md`.
- Verify `agents/reversa-agents-help/SKILL.md`; if it still lists slash commands only, leave it unchanged.

Install/update handling:

- Add `reversa-content-server` to core installed agents for new installs.

Exit criteria:

- Fresh install includes `reversa-content-server` in installed skills.
- Documentation lists the new CLI surface.

## Phase 4.5 - Existing Install Migration

Existing installs need a one-time update migration for the new core skill.

Trigger:

- During `reversa update`, if `state.agents` contains both `reversa` and `reversa-scout`, and neither `state.agents` nor `[agents].installed` contains `reversa-content-server`.

Actions:

- Append `reversa-content-server` to `.reversa/state.json#agents`.
- Append `reversa-content-server` to `.reversa/config.toml` `[agents].installed` with `appendTomlStringArrayValue(filePath, "agents", "installed", "reversa-content-server")`. Do not use `upsertTomlSection` for this multi-line array.
- Install the skill for every configured engine with `writer.installSkill(agent, engine.skillsDir)` and the universal skills dir when present.
- Do not bypass `writer.installSkill`; it registers files and populates `writer.manifestPaths`, which the update manifest merge depends on.
- Do not install optional teams the user did not have.

No-op behavior:

- Re-running `reversa update` after the migration must not add duplicates or reinstall the skill if it is already installed and tracked.
- If a future remove-agent flow exists and the user intentionally removes `reversa-content-server`, respect that explicit state instead of silently re-injecting it. Until such a flow exists, the guard above is enough.

Exit criteria:

- An existing install upgraded with `update` acquires the `reversa-content-server` skill.
- `state.json`, `config.toml`, and the manifest all reflect the new skill.
- A second `update` run is a no-op for this migration.

## Phase 5 - Installer, Update, And Uninstall

Installer prompt path:

- In `lib/installer/prompts.js`, after standard answers are collected and before returning:
  - Call programmatic `probe({ jsonMode: true, quiet: true })`.
  - If probe fails, continue silently.
  - Call `detect({ jsonMode: true, quiet: true, executable })`.
  - If no profiles, continue silently.
  - If one profile, ask confirm.
  - If multiple profiles, show a picker plus skip option.
  - On accept, attach `answers.csAgent = { enabled, profile, ot_home, workdir, executable }`.
  - On decline, attach `answers.csAgent.dismissedFingerprint`.

- In `lib/installer/writer.js`:
  - Create `.reversa/context/cs-agent/`.
  - Render `[integrations.cs_agent]` values into `config.toml` when enabled by calling `upsertTomlSection(filePath, "integrations.cs_agent", values, { insertAfter: "[analysis]" })`.
  - Render `[integrations.cs_agent].executable` into `config.user.toml` when enabled by calling the same upsert helper.
  - Persist `state.cs_agent_enablement_dismissed` when declined.
  - Register the context directory for uninstall tracking if it is created.
  - Do not extend the current `.replace()` chain for this new section; older installs may not have the target block and silent no-op replacement would drop the write.

- In `lib/commands/install.js`:
  - When cs-agent is enabled or declined with a fingerprint, append `.reversa/context/cs-agent/` to `.gitignore` unconditionally.
  - The reason is machine-local content: snapshots and logs contain absolute paths and binary-specific trust evidence.
  - This is independent of `answers.git_strategy`; even teams that commit specs should not commit cs-agent snapshots.
  - If the user manually removes the line later, do not enforce it on every run.

Orchestrator migration path:

- When the user accepts the Scenario B prompt, write config with `upsertTomlSection` and append `.reversa/context/cs-agent/` to `.gitignore` once.
- When the user declines, write the fingerprint and still append `.reversa/context/cs-agent/` only if the context directory is created.

Update behavior:

- Preserve `.reversa/context/cs-agent/`.
- Do not overwrite existing `[integrations.cs_agent]` values.
- If the installed config lacks the new block, do not force-write it; CLI and Scout treat missing as disabled. The migration prompt can write it on acceptance.
- Install the new core skill as described in Phase 4.

Uninstall behavior:

- Existing uninstall removes `.reversa/` entirely, which removes `.reversa/context/cs-agent/`.
- Add an explicit test or explicit removal path so G17 is covered even if uninstall behavior changes later.

Exit criteria:

- Scenario A can be enabled during install.
- Declines are recorded with fingerprint.
- Enabling cs-agent always appends `.reversa/context/cs-agent/` to `.gitignore`.
- Uninstall leaves no `.reversa/context/cs-agent/`.

## Phase 6 - Unit Tests

Use Node's built-in test runner.

Adapter tests in `lib/integrations/__tests__/cs-agent.test.js`:

- G1: executable resolution and ignored `CSWORKS_ROOT`.
- G2 shape with stubbed `help --json`.
- G3: allowlist and `profile_required`.
- G4: `detectProfile()` profile-less registry aggregation.
- G6: snapshot commit marker and validation semantics.
- G7: exact argv and profile mismatch.
- G13: inventory block rendering semantics.
- G17: audit log rotation.

CLI tests in `lib/commands/__tests__/content-server.test.js`:

- Help output.
- JSON envelope shape.
- Exit code mapping.
- Config reading and user override merge.
- `inventory --write` idempotency against fixture files.
- `snapshot` refuses when enabled false unless an explicit temp/test path mode is used.

Additional test fixtures:

- Store fixtures under `lib/integrations/__tests__/fixtures/`.
- Source fixture shape from a real CS253 run where useful, anonymized if needed.
- Minimal profile-info envelope.
- Minimal graph-status envelope with `countsByModule`, `unresolvedRefsByKind`, and confidence counts.
- Minimal docs-categories envelope.
- Old/stale `_meta.json`.
- Corrupt and missing marker cases.
- State variants for dismissal handling: absent field, explicit `null`, and full dismissal object.
- Partial inventory marker fixture to assert the warning is emitted when truncating from begin marker to EOF.

Exit criteria:

- `npm test` passes without real cs-agent.

## Phase 7 - Live Integration Script

Add `scripts/test-cs-agent-integration.mjs`.

Behavior:

- If `RUN_CS_AGENT_TESTS !== "1"`, print skipped and exit 0.
- Default executable: `F:\smoke\CS253\cs-agent.exe`, overridable by `CS_AGENT_EXE`.
- Default profile: `CS253`, overridable by `CS_AGENT_PROFILE`.
- Use a temporary output directory under OS temp, not the repo and not `E:\CS253_workdir`.
- Create a unique temp directory per run and print its path.
- Delete the temp directory on success unless `KEEP_CS_AGENT_TMP=1`.
- On failure, always keep the temp directory and print its path for debugging.

Checks:

- `content-server probe --json --executable <path>`.
- `content-server detect --json --executable <path>` includes the configured profile.
- `content-server snapshot --json --profile <profile> --executable <path> --out-dir <tmp>`.
- `content-server inventory --write --snapshot-dir <tmp> --inventory-path <tmp>/inventory.md`.
- Run inventory writer twice and assert the file has exactly one begin/end marker pair.

Do not run:

- `cs-agent init`
- `cs-agent init refresh`
- Any graph rebuild or index-all command
- Any side-effect workflow

Exit criteria:

- PowerShell live run command:
  - `$env:RUN_CS_AGENT_TESTS='1'; node scripts/test-cs-agent-integration.mjs`
- Transcript can be saved under `work/01-cs-agent-specialized/proof/`.
- Successful runs leave no temp directory unless `KEEP_CS_AGENT_TMP=1`; failed runs preserve their temp directory.

## Phase 8 - Manual End-To-End Proof

Scenario A - installer-enabled:

1. Use a disposable project fixture.
2. Run `npx @pnocera/reversa install`.
3. Accept cs-agent integration.
4. Start `/reversa`.
5. Verify first Scout run renders the CS Profile block and skips `srcdir`.
6. Capture transcript and resulting inventory block.

Scenario B - already-installed migration:

1. Use a fixture with Reversa installed but no `[integrations.cs_agent]` enabled block.
2. Run `/reversa`.
3. Confirm Scout records `cs_agent_profile_detected`.
4. Accept orchestrator prompt.
5. Verify snapshot + inventory happen synchronously in that session.
6. Run `/reversa` again and verify enabled fast path under 60 seconds.

Proof artifacts:

- `work/01-cs-agent-specialized/proof/scenario-a-transcript.md`
- `work/01-cs-agent-specialized/proof/scenario-b-transcript.md`
- `work/01-cs-agent-specialized/proof/sample-inventory.md`

Exit criteria:

- All hard gates G1-G17 pass or have a concrete defect filed.

## Suggested Commit Sequence

1. `feat(cs-agent): add content-server adapter and CLI`
2. `test(cs-agent): cover adapter and content-server CLI`
3. `feat(cs-agent): install content-server skill, config schema, and orchestration wording`
4. `feat(cs-agent): add installer/update migration and lifecycle handling`
5. `test(cs-agent): add live integration script and proof docs`

Keep commits split so a failure in skill wording does not obscure adapter or CLI correctness. The skill/config/orchestrator commit is intentionally grouped because those pieces are not independently complete.

## Implementation Risks To Watch

- TOML editing can duplicate sections if implemented with raw append. Use an upsert helper.
- Existing update flow can miss new core skills or desynchronize `state.json`, `config.toml`, and manifest. Explicitly handle `reversa-content-server` migration.
- Scout is instruction-driven, not code-driven. The CLI must carry all deterministic behavior; the skill should only call it.
- Inventory rendering must be idempotent; never let Scout hand-write the section.
- Snapshot validation must consume `_meta.json` first. Do not read data files opportunistically.
- `.reversa/context/cs-agent/` is machine-local and must be ignored even when specs are committed.
- Keep live tests bounded. No index refresh, no wide scans, no parallel heavy commands.

## Definition Of Done

- `npm test` passes.
- `node bin/reversa.js --help` lists `content-server`.
- `node bin/reversa.js content-server --help` lists all five subcommands.
- Unit tests cover G1, G3, G6, G7, G13, G15, G17.
- Live integration script passes when explicitly enabled with `RUN_CS_AGENT_TESTS=1`.
- Scenario A and B proof transcripts are saved.
- Existing install upgraded with `update` acquires `reversa-content-server`; `state.json`, `config.toml`, and manifest reflect it; second update is a no-op.
- Enabling cs-agent appends `.reversa/context/cs-agent/` to `.gitignore`.
- README and CLI docs list the `content-server` command.
- `package.json#dependencies` is unchanged.
- No phase-2 data artifacts are generated.
