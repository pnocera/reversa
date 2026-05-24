# Claude Review — cs-agent Specialized Implementation Plan

Date: 2026-05-24

Reviewer: Claude Opus 4.7 (1M context), agent harness

Reviewed file:

- `work/01-cs-agent-specialized/implementation/01-implementation-plan.md`

Cross-checked against:

- Conception v2 (`conception/00-conception.md`, `01-adapter-api.md`, `02-skill-stubs.md`, `03-phase-1-acceptance.md`)
- Codex conception review (`reviews/2026-05-24-codex-conception-review.md`)
- Live repo: `bin/reversa.js`, `package.json`, `templates/config.toml`, `templates/state.json`, `lib/installer/writer.js`, `lib/installer/prompts.js`, `lib/commands/{install,update,uninstall}.js`, `agents/reversa-agents-help/SKILL.md`

Extra checks:

- Did not run any cs-agent commands — the plan's Phase 0 calls them, and the conception's live calls are already in the record.

## Verdict

The plan is implementable as written but has three HIGH issues that will bite during coding if not resolved up front, and a handful of MEDIUM decisions the implementer will otherwise re-litigate ad hoc. Phase structure, trust boundary discipline, and gate coverage are sound. Recommend addressing the HIGHs and committing on the MEDIUM decisions before opening the first PR.

All 17 hard acceptance gates (G1–G17) trace to a phase. Definition of Done covers the unit-testable subset; the integration / e2e subset is covered by Phase 7 + Phase 8.

## Findings

### HIGH — Existing-install update path for `reversa-content-server` is underspecified

Plan §"Phase 4 → Install/update handling" says:

> If `state.agents` contains `reversa` and `reversa-scout` but not `reversa-content-server`, append it to `state.agents` and install the skill for every configured engine.

Three concrete gaps will trip implementation:

1. **`state.agents` is not the only source of truth.** `lib/installer/writer.js:155-166` writes `config.toml`'s `[agents].installed` from `answers.agents` during fresh install. `update.js:121` iterates `installedAgents = state.agents ?? []`, but other code paths (e.g. `add-agent`) read the config-side list. The migration must update **both** `state.agents` and `config.toml`'s `[agents].installed` so the two stay coherent.

2. **Manifest entries for the new skill must be added in update.** `update.js:120-143` reinstalls each agent for each engine using `writer.installSkill(agent, engine.skillsDir)`. That function (writer.js:73-88) skips when the destination already exists. For the migration, the destination *does not* exist yet, so the install will proceed — good. But the manifest at `update.js:177-182` is rebuilt from `writer.manifestPaths`, which is per-Writer-instance. The newly installed skill's files need to land in `manifestPaths` so the merged manifest at the end of update includes them. Verify the existing `_registerFilesInDir` call inside `installSkill` covers this; if it does, the migration is mostly free, but the plan should call it out so the implementer doesn't accidentally bypass `installSkill` for the migration step.

3. **The migration runs once and only once.** After the first update on an existing install, `state.agents` contains the new skill and the migration branch must not re-fire. Trivial guard, but should be explicit. If the user later removes the skill (manually or via a future `remove-agent`), they need an escape hatch, not silent re-injection.

**Recommendation:** add a dedicated `Phase 4.5 — Migration` subsection that spells out:

- Update both `state.agents` and `config.toml`'s `[agents].installed`.
- Use `writer.installSkill` so manifest tracking works.
- Add to Definition of Done: "Existing install upgraded with `update` acquires the `reversa-content-server` skill, manifest reflects it, and re-running `update` is a no-op."

### HIGH — `writer.js` config mutation pathway is not reconciled with the new TOML upsert helper

Today, `lib/installer/writer.js:157-168` mutates `config.toml` during install with a chain of `.replace()` calls against exact string literals (anchors like `chat_language = "pt-br"`, `installed = []`, etc.). Phase 1 of the plan introduces `lib/utils/reversa-config.js` `upsertTomlSection()`. Phase 5 says "Render `[integrations.cs_agent]` values into `config.toml` when enabled" without specifying mechanism.

If the implementer adds another `.replace()` for `enabled = false`, two failure modes appear:

- The replace anchor matches multiple sections if any other future block uses `enabled = false` (current templates have none, but the plan adds a new template section, so the new block's `enabled = false` is the only one — fragile by construction).
- The cs-agent block is missing from older `config.toml` files (Scenario B's existing installs predate this work). `.replace()` returns the input unchanged when the anchor is absent, silently dropping the write.

**Recommendation:**

- Phase 5 should explicitly state: use `upsertTomlSection(filePath, "integrations.cs_agent", values)` from Phase 1. Do not extend the `.replace()` chain.
- Phase 1's test coverage list should add: "Upsert into a `config.toml` that has no `[integrations.cs_agent]` block creates one; upsert into a `config.toml` that has it replaces the values without touching other sections."
- Optional but recommended: also migrate the existing `.replace()` mutations to `upsertTomlSection` so the install path uses one mechanism. Out of scope for phase 1 if the implementer wants to defer, but at minimum the new code must not entrench the dual-mechanism debt.

### HIGH — `.gitignore` for `.reversa/context/cs-agent/` should be mandatory, not opt-in

Plan §"Phase 5 → Installer prompt path → `install.js`" says:

> When `answers.git_strategy === "gitignore"` and cs-agent is enabled, include `.reversa/context/cs-agent/`.
> Consider adding this ignore line even when specs are committed, because the context contains machine-local absolute paths.

The snapshots reference absolute paths like `E:\CS253_workdir\…`, the executable path, and the help signature SHA of a specific local binary. The adapter log records command names and durations from a specific local cs-agent. None of this travels across teammates. Per-machine artifacts in a committed `.reversa/` would manifest as constant diff noise plus confused "why doesn't your snapshot match mine" support tickets.

**Recommendation:** elevate "Consider adding" to "Always add". When cs-agent is enabled (installer or orchestrator), append `.reversa/context/cs-agent/` to the project's `.gitignore` unconditionally. Document the rationale (machine-local content) in the install output line. Add to Phase 5 exit criteria: "Enabling cs-agent always appends the gitignore line."

If the user manually removes the line later, that's their choice; Reversa should not enforce on subsequent runs.

### MEDIUM — Spawn injection mechanism for unit tests is not specified

Phase 2 implementation note:

> To keep unit tests clean, factor process execution behind a small internal runner that can be injected in tests or exposed under a test-only helper.

With `node:test` (Phase 0's chosen runner — no `vi.mock`-style auto-mocking) and ESM (`"type": "module"` in package.json), three patterns are viable:

a. Accept an optional `spawn` option on every public function. Cleanest for testability; clutters the API.
b. Export a `__setTestSpawn(spawnFn)` module-level setter that mutates an internal variable. Hidden complexity, but keeps the public API clean.
c. Wrap `child_process.spawn` behind a single internal `_runCmd(executable, argv, opts)` and export it as `__internal` for tests only.

Picking one up front saves implementation churn. **Recommendation:** use option (c) — a single `_runCmd` exported under a clearly-tagged `__test` symbol (e.g. `export const __test = { runCmd: _runCmd, setRunCmd: (fn) => { _runCmd = fn; } };`). Tests reset between runs via `t.afterEach`. Public API stays clean; spawn is the single mock surface.

State this in Phase 2 so the implementer doesn't re-decide mid-coding.

### MEDIUM — `reversa-config.js` TOML helper scope needs commitment

Phase 1 says:

> Parses only the sections needed here: `[integrations.cs_agent]`, `[output]`, and `[user]`.
> No TOML dependency. Keep config parsing scoped and local unless the implementation later proves this is too brittle.

The existing `templates/config.toml` has multi-line array values (`installed = [\n  "reversa-scout",\n  ...\n]`) and embedded user comments. The helper needs to handle:

- Section detection (`[section.subsection]` syntax with dotted keys).
- Flat `key = value` pairs (boolean, integer, string).
- String escaping for Windows paths.
- Preserving lines outside the target section verbatim (including comments and unsupported multi-line constructs).

It does **not** need to parse `[agents]`-style multi-line arrays — those are mutated by writer.js's existing `.replace()` regex and the plan keeps that path. But the upsert must not corrupt a `[agents]` block when rewriting an adjacent section.

**Recommendation:** Phase 1 should commit:

- The helper supports only flat `key = value` lines (string, boolean, integer) within a target section.
- When upserting, it identifies the section header line by exact match (`[integrations.cs_agent]`), walks forward to the next section header or EOF, and replaces that range entirely.
- It refuses (throws) if the target section contains multi-line constructs (arrays, inline tables) — `[integrations.cs_agent]` has none in our spec, so this never triggers in phase 1 but guards against future contributors silently corrupting expanded sections.
- It does NOT round-trip the whole file through a parser. It edits as text.

Test coverage list should add: "Section with unknown multi-line value → throws, file untouched."

### MEDIUM — Position of the new `[integrations.cs_agent]` block in `templates/config.toml`

Conception §3 of `02-skill-stubs.md` v2 says "after the existing `[analysis]` section, before `[specs]`." Plan §"Phase 4 → Patch templates" says just "Add `[integrations.cs_agent]` default-off block."

Position matters because the `upsertTomlSection` helper (when creating a new section) must place it deterministically so review diffs stay stable. **Recommendation:** Phase 4 should specify "insert after `[analysis]`, before `[specs]`" and the helper should support `upsertTomlSection(filePath, sectionName, values, { insertAfter: "[analysis]" })`. Default insert-at-end is fine if the user doesn't pass `insertAfter`.

### MEDIUM — Test fixtures need a documented home

Phase 6 lists fixture envelopes (profile-info, graph-status, docs-categories, stale/corrupt `_meta.json`) but doesn't say where they live. Implementer will guess.

**Recommendation:** add to Phase 6: "Fixtures live under `lib/integrations/__tests__/fixtures/`. Source them from a real cs-agent run on CS253 (anonymize as needed) so they catch shape regressions when cs-agent updates."

### MEDIUM — Live integration script (Phase 7) needs a cleanup contract

Plan says "Use a temporary output directory under OS temp." Doesn't say whether to delete it after success. If kept, repeated runs accumulate. If deleted, debugging is harder.

**Recommendation:** create a uniquely-named temp dir per run; print its path; auto-delete on success unless `KEEP_CS_AGENT_TMP=1` is set. On failure, always keep and print the path. Add to Phase 7 exit criteria.

### MEDIUM — README CLI commands section update is left as "conditional"

Plan §"Conditional/help updates" hedges: "README/help text if there is a section listing CLI commands." It does. `README.md` has a `## CLI commands` table that the team has already kept current (most recent rebranding pass touched it). Phase 1 of cs-agent integration adds a user-visible command that belongs there.

**Recommendation:** move the README update from "conditional" to a definite Phase 4 patch:

- Add `npx @pnocera/reversa content-server` row to the CLI commands table in `README.md`.
- Same for `docs/cli.md`, `docs/cli.pt.md`, `docs/cli.es.md` (these were translated in the earlier work; they have the same structure).
- Same for `agents/reversa-agents-help/SKILL.md` if it lists CLI commands (it currently lists slash commands, not CLI commands — verify and skip if so).

### LOW — Suggested commit sequence could pair templates with skills

Commits 3 and 4 in the suggested sequence:

> 3. feat(cs-agent): install content-server skill and config schema
> 4. feat(cs-agent): wire scout and orchestrator enablement flow

These touch overlapping files (templates and SKILL patches). Reviewing in isolation, commit 3 leaves the system half-wired — config has the section, skill exists, but Scout doesn't shell the CLI yet. If a CI test runs at HEAD of commit 3 against a CS-enabled fixture, the inventory section won't appear.

**Recommendation:** either merge 3 and 4 into one commit, or ensure CI doesn't assert end-to-end behavior until commit 4. The plan should note the intermediate state explicitly so reviewers don't flag commit 3 as broken.

### LOW — `renderInventorySection` partial-marker recovery should warn

Plan Phase 2:

> `write` mode replaces from begin marker to end marker, or begin marker to EOF if the end marker is missing.

This is destructive if the user manually edited content *after* the begin marker and deleted the end marker (typo, merge conflict). The user's edits below the begin marker are lost without warning.

**Recommendation:** when the partial-marker recovery path triggers, the CLI should print a warning ("`<!-- reversa:cs-profile:end -->` marker was missing; truncated everything from begin marker to EOF"). Add to Phase 6 acceptance: a test asserting the warning is printed in this case.

### LOW — Two function names for the CLI dispatcher

Plan Phase 3 Exports list both `default async function contentServer(args)` and `run(args) alias for the conception examples`. The conception example (`02-skill-stubs.md` §6) uses `run(restArgs)`. Pick one shape so the CLI registration in `bin/reversa.js` doesn't import both.

**Recommendation:** keep only `default`, and have `bin/reversa.js` invoke `await mod.default(args)` (matches every other command in the current dispatcher — see `bin/reversa.js:59-60`). Drop the `run` alias.

### LOW — Phase 0 mentions `npm install` precondition

Plan: "`npm install` only if dependencies are missing." Phase 1 adds no new npm dependencies (node:test is built-in, `crypto.createHash` is built-in, `where`/`which` are shell utilities). Worth confirming explicitly so the implementer doesn't add `@iarna/toml` or similar after deciding the TOML helper is "too brittle" — that decision deserves its own conception entry, not an in-flight `npm i`.

**Recommendation:** add to Phase 0: "Confirm `package.json#dependencies` is unchanged at the end of phase 1. No new runtime deps."

### LOW — `cs_agent_enablement_dismissed` template default

Plan Phase 4: "Add `cs_agent_enablement_dismissed: null` to `templates/state.json`."

Adding it as `null` is fine, but means every fresh install carries an explicit `null` field. Alternative: omit the field entirely from the template and treat absence as "never dismissed" in the orchestrator's check (the plan's orchestrator pseudocode already does `if (state.cs_agent_enable_dismissed)` — truthy check, handles both).

**Recommendation:** pick one and document. Either way: the test fixtures in Phase 6 need to cover both shapes (field absent, field is `null`, field is the dismissal object) so the orchestrator logic is exercised across all three.

## Gate coverage cross-check

All 17 hard gates from `03-phase-1-acceptance.md` trace to at least one phase:

| Gate | Phase(s) | Covered? |
|---|---|---|
| G1 (resolution, ignored CSWORKS_ROOT) | 2, 6 | Yes |
| G2 (probe shape + trust evidence) | 2, 6, 7 | Yes |
| G3 (allowlist + profile_required) | 2, 6 | Yes |
| G4 (detectProfile profile-less + multi-profile) | 2, 6, 7 | Yes |
| G5 (graph status real numbers) | 2, 7 | Yes (live only) |
| G6 (commit-marker snapshot) | 2, 6, 7 | Yes |
| G7 (argv + profile_mismatch) | 2, 6 | Yes |
| G8 (Scout records signal) | 4, 8 | Yes |
| G9 (Scout does NOT auto-enable) | 4 (by absence) | Yes |
| G10 (installer prompt scenario A) | 5, 8 | Yes |
| G11 (orchestrator prompt + fingerprinted dismissal) | 4, 8 | Yes |
| G12 (skip-deep-walk fires when enabled + snapshot ok) | 4, 8 | Yes |
| G13 (idempotent inventory block) | 2, 6 | Yes |
| G14 (Scout < 60 s enabled) | 8 | Yes (manual) |
| G15 (CLI discoverable) | 3, 6 | Yes |
| G16 (fallback on adapter failure) | 2, 6 | Yes |
| G17 (audit log + rotation + uninstall) | 2, 5, 6 | Yes |

**Soft gates** (S1–S5): all covered in Phase 5 / 7 / 8.

**Definition of Done** misses one item worth adding: "Existing install upgraded with `update` acquires the `reversa-content-server` skill" (the migration covered in HIGH §1).

## Things the plan got right

- Phase ordering (config utility → adapter → CLI → templates/skills → installer/lifecycle → tests → live → manual) is correct dependency order.
- Splitting unit tests (Phase 6) from live integration (Phase 7) gates the slow path behind an env flag, keeping CI fast.
- `detectProfile` carved out as the one profile-less path matches the conception cleanly.
- Audit log rotation and uninstall handling addressed in the same phase.
- Suggested commit sequence keeps adapter / CLI / skills / installer in separate, reviewable units.
- Risks section calls out the right concerns (TOML duplication, missing core skill, Scout instruction-vs-code split, idempotency, marker-first validation, bounded live tests).
- Definition of Done is concrete and falsifiable.

## Bottom line

Address the three HIGH findings (update migration mechanics, upsert helper usage in writer.js, mandatory `.gitignore`) before opening the first PR. Commit on the MEDIUM decisions (spawn injection pattern, TOML helper scope, section placement, fixture location, temp dir cleanup, README updates) so the implementer doesn't re-litigate mid-flight. The LOW items can be handled in review.

After those fixes, the plan should produce a clean, reviewable phase-1 PR that passes G1–G17 on the CS253 reference host. The trust boundary discipline carried over from the conception is intact, the scope is genuinely tight, and the slide-into-phase-2 risk is contained.
