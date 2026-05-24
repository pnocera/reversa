# Codex Review - cs-agent Specialized Conception

Date: 2026-05-24

Reviewed files:

- `work/01-cs-agent-specialized/conception/00-conception.md`
- `work/01-cs-agent-specialized/conception/01-adapter-api.md`
- `work/01-cs-agent-specialized/conception/02-skill-stubs.md`
- `work/01-cs-agent-specialized/conception/03-phase-1-acceptance.md`

Extra checks:

- Ran `F:\smoke\CS253\cs-agent.exe profile info --json --profile CS253`
- Ran `F:\smoke\CS253\cs-agent.exe --profile CS253 profile info --json`
- Both argv orders work on the current smoke copy, so exact `--profile` ordering is not a blocker.
- CodeGraph was not initialized for this repo in the current checkout, so repo-shape checks below use targeted file reads and literal search.

## Verdict

The conception is directionally good: Phase 1 is scoped to recognition, cached read-only evidence, and one inventory section. That is the right first product slice. I would not implement it as-is yet. There are a few contract gaps that will cause either an unimplementable skill patch or a first-run experience that contradicts the acceptance criteria.

## Findings

### High - The skill patches call a JS adapter directly, but Reversa skills do not have a stable JS API surface

`02-skill-stubs.md:151-155` tells Scout to call `lib/integrations/cs-agent.js` functions directly, and `02-skill-stubs.md:194-195` does the same for `collectSnapshot()`. In the current repo, Scout is a Markdown skill (`agents/reversa-scout/SKILL.md:15-23`) executed by an agent, while the packaged CLI exposes a fixed command map in `bin/reversa.js:14-22`. There is no current `content-server`, `cs-agent`, or helper command that a skill can invoke as a product contract.

This makes the design engine-dependent. Codex or Claude can be instructed to run ad hoc Node snippets, but that is not the same as a Reversa feature. It also makes tests like `03-phase-1-acceptance.md:93-115` ambiguous because there is no harness boundary between "the skill" and "the adapter".

Recommendation:

- Add a CLI/helper surface first, for example `npx @pnocera/reversa content-server probe`, `snapshot`, and maybe `render-inventory-section`.
- Keep `lib/integrations/cs-agent.js` as the internal module, but make skills call the CLI helper, not import JS.
- Wire `bin/reversa.js` and help text as part of Phase 1, not as a later doctor-only nicety.

### High - Profile detection is circular

The conception says Scout calls `cs-agent profile info --json` with `--profile <auto-detected name>` during first-run detection (`00-conception.md:102-105`). The adapter API says `profile` is required for every call except `probe()` (`01-adapter-api.md:31-34`, `01-adapter-api.md:76-90`, `01-adapter-api.md:232-235`). But the Scout stub then says that if no profile is configured, it should "read the first profile from cs-agent's registry response" (`02-skill-stubs.md:151-154`).

There is no explicit API that gets the registry or active profile before a profile is known. The current live command can return active profile data, but the adapter contract forbids profile-less `runReadOnly()` calls, so implementation will either violate the spec or fail on first-run projects.

Recommendation:

- Add a separate detection API, for example `detectProfile(executable)`, that is explicitly allowed to run `profile info --json` without `--profile`.
- Treat its output as detection-only. Once a profile is selected, all normal read-only calls must pass `--profile`.
- If multiple profiles are returned, do not silently pick the first. Ask or require installer config.

### High - The first-run flow contradicts the acceptance outcome and still pays the expensive Scout walk

The acceptance headline promises that running `/reversa` on a fresh reachable CS project "detects the integration, asks once, and - on acceptance - writes" the CS Profile section in under 60 seconds of Scout time (`03-phase-1-acceptance.md:9-11`). The conception flow says Scout records the signal but does not skip the deep walk because config is still off (`00-conception.md:119-123`), and on acceptance the orchestrator tells the user to rerun Scout (`00-conception.md:140-144`, `02-skill-stubs.md:303-305`). The hard gates later only bound the enabled second run (`03-phase-1-acceptance.md:132-137`, `03-phase-1-acceptance.md:161-168`).

That is a product mismatch. The fresh first run can still recursively walk `srcmodules`, which is exactly the pain this integration is meant to avoid. It also conflicts with the known constraint that broad CS live checks on this machine should stay bounded.

Recommendation:

- Prefer installer-time enablement: if `install` can probe successfully, ask before the first Scout run so the first `/reversa` gets the fast path.
- If orchestrator-time enablement remains necessary for already-installed projects, make the acceptance explicitly two-run: first run detects and asks; second run writes the CS Profile under 60 seconds.
- Alternatively insert a pre-Scout cheap-detection checkpoint before any deep walk, then continue Scout in enabled mode after acceptance.

### Medium - Snapshot atomicity is specified too strongly for the proposed implementation

`collectSnapshot()` writes three JSON files with tempfile + rename and then `_meta.json` (`01-adapter-api.md:112-149`). The acceptance says that if the process is killed between calls, "no partial files remain" (`03-phase-1-acceptance.md:70-79`). Per-file atomic rename prevents half-written JSON, but it does not prevent a coherent partial set: `profile-info.json` could be fully renamed and then the process could die before `graph-status.json`.

Recommendation:

- Write into a session staging directory and publish by a final directory swap where possible, or
- Treat `_meta.json` as the commit marker and make readers ignore/delete files not referenced by a valid fresh `_meta.json`.
- Update G5 to test coherent snapshot validity, not just absence of half-written files.

### Medium - Inventory emission is append-only and will duplicate sections on reruns

The conception says Scout "appends one new section" after snapshot collection (`00-conception.md:179-181`) and the skill stub repeats "append the following section" (`02-skill-stubs.md:198-205`). Acceptance requires `_reversa_sdd/inventory.md` to end with the section and uses a character-level diff against the sample (`03-phase-1-acceptance.md:139-149`).

On reruns, append-only behavior can leave multiple stale `## CS Profile (cs-agent)` sections. The character-level diff also makes harmless wording or ordering changes fail tests.

Recommendation:

- Render the CS Profile as a generated block between stable markers, replacing it idempotently on every run.
- Make acceptance assert required fields, counts, freshness note, and absence of placeholders. Avoid character-level diff as a hard gate.

### Medium - Permanent dismissal is not keyed to the detected profile or executable

The orchestrator skips forever when `state.cs_agent_enable_dismissed` is true (`00-conception.md:121-123`, `02-skill-stubs.md:272-274`, `02-skill-stubs.md:316`). Acceptance requires the same behavior (`03-phase-1-acceptance.md:123-130`).

That is too blunt for a machine-local integration. A user may decline when PATH points to an old cs-agent, then later install the right copy, switch profiles, or move the project under a real CS tree. The old decline would suppress the useful prompt.

Recommendation:

- Store dismissal as a fingerprinted object, not a boolean: profile, `ot_home`, executable path, help signature, and maybe detected workdir.
- Re-ask only when that fingerprint changes.
- Keep the machine-local executable in `config.user.toml`, but keep product-level enablement in project config.

### Medium - Executable fallback can bind to a stale smoke copy without enough evidence

`resolveExecutable()` falls back from configured path to `CSWORKS_ROOT/cs-agent.exe`, caller directory, and PATH, and "never executes anything" (`01-adapter-api.md:38-55`). G1 accepts `CSWORKS_ROOT=F:\smoke\CS253` resolving to that copy (`03-phase-1-acceptance.md:21-31`). Prior cs-agent smoke work showed that `F:\smoke\CS253\cs-agent.exe` can drift behind the built distribution, so existence alone is weak evidence.

The later probe helps, but Phase 1 should make stale binary diagnosis explicit because all downstream cached evidence depends on the chosen executable.

Recommendation:

- Keep configured executable as the preferred path.
- In `probe()`, record executable path, mtime, size, and help signature in `_meta.json`.
- If fallback chooses PATH or `CSWORKS_ROOT`, print that it is inferred and tell the user how to pin `config.user.toml`.
- Consider renaming the env fallback to something less ambiguous than `CSWORKS_ROOT` unless that name is already a cs-agent contract.

### Low - The audit log policy needs install/uninstall and retention semantics

The adapter writes `.reversa/cs-agent.log` for every call and says rotation is the user's problem (`01-adapter-api.md:237-249`). Acceptance requires the file after adapter runs (`03-phase-1-acceptance.md:157-159`). The skill stub also says the doctor command writes there (`02-skill-stubs.md:106-108`).

This is not a blocker, but logs under `.reversa` need to align with Reversa install/update/uninstall behavior and any default ignore rules. They include profile and absolute-path evidence, so they should not accidentally become part of a committed spec corpus.

Recommendation:

- Put the log under `.reversa/context/cs-agent/adapter.log` or document why it lives at `.reversa/cs-agent.log`.
- Add retention or size cap, even a simple truncate-after threshold.
- Ensure uninstall removes it, and update documentation says whether `.reversa/` is intended to be committed.

## Proposed Phase 1 Shape

I would revise Phase 1 into this order:

1. Add `lib/integrations/cs-agent.js` plus a CLI wrapper that exposes `probe`, `snapshot`, and `doctor` behavior.
2. Add explicit `detectProfile()` for profile-less discovery, separate from `runReadOnly()`.
3. Add installer-time prompt so fresh projects can enable before Scout walks `srcmodules`.
4. Patch Scout to call the CLI wrapper, skip only `profile.paths.srcdir` when enabled, and write an idempotent generated CS Profile block.
5. Keep orchestrator prompt as a migration path for already-installed projects, with fingerprinted dismissal.
6. Gate live tests with `RUN_CS_AGENT_TESTS=1` and keep them narrow: probe, profile info, graph status, docs categories, and one enabled Scout fixture run.

## Acceptance Changes I Would Make

- Change the headline outcome to distinguish installer-enabled first run from orchestrator-detected two-run migration.
- Add a gate that `bin/reversa.js --help` lists the Content Server helper command.
- Add a gate for profile-less `detectProfile()` and multi-profile behavior.
- Replace "no partial files remain" with "no snapshot is consumed unless a valid `_meta.json` commit marker references all files."
- Replace character-level inventory diff with semantic assertions.
- Add an idempotency gate: running Scout twice leaves exactly one CS Profile section.

## Bottom Line

This is close to implementable once the adapter has a real invocation surface and profile discovery is made explicit. The biggest conception correction is product flow: decide whether Phase 1 is a one-run installer-enabled fast path or a two-run orchestrator migration. Right now the documents promise both, and implementation will expose that contradiction quickly.
