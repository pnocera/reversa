PHASE 4 APPROVED

Verification summary (all Phase 4 concerns checked against the working tree):

- `agents/reversa-content-server/SKILL.md` (lines 36, 53, 69): Read-only contract reinforced; broad `srcmodules` traversal replaced with the precise `profile-info.json#profile.paths.srcdir` reference. `inventory` is invoked with `--write`.
- `agents/reversa-scout/SKILL.md`:
  - Cheap pre-walk detect at section 0 (lines 24-35).
  - All five `cs_agent_*` signals recorded with fingerprint fields (`profile`, `ot_home`, `executable_path`, `help_sha256`) at lines 33 and 45.
  - "Do not enable the integration from Scout" (line 35) — no config/state writes.
  - Skips only the exact `profile.paths.srcdir` when enabled and snapshot succeeded (line 52); explicitly does not skip every `srcmodules`.
- `agents/reversa/SKILL.md`:
  - Enabled fast path runs before Scout (lines 22-26).
  - Migration prompt moved after Scout, before Archaeologist (lines 30-93 + new step 2 at line 112).
  - Uses `surface.json#signals` + fingerprinted dismissal (lines 32-49).
  - Managed `[integrations.cs_agent]` block written to `.reversa/config.toml` without `executable`; `executable` override written to `.reversa/config.user.toml` (lines 63-69).
  - `.reversa/context/cs-agent/` appended to `.gitignore` (line 70).
  - Snapshot and `inventory --write` run synchronously on accept (lines 71-73).
- `agents/reversa/references/step-01-first-run.md` (lines 63-74): Lifecycle matches — enabled fast path before Scout, migration prompt at first checkpoint after Scout.
- `agents/reversa-scout/references/surface-schema.md` (lines 26-32, 100-115): Documents fingerprint fields and the precise srcdir skip rule.
- `agents/reversa/references/state-schema.md` (lines 17-23, 69): Documents the `cs_agent_enablement_dismissed` fingerprint object and `null` semantics.
- `templates/config.toml:37-43`: Default-off `[integrations.cs_agent]` block present, placed before `[specs]`.
- `templates/config.user.toml:10-13`: Commented executable override example present.
- `templates/state.json:12`: `cs_agent_enablement_dismissed: null` present.
- `lib/installer/prompts.js:8-22`: `reversa-content-server` listed in `DISCOVERY_CORE`.
- `README.md:355-359` and `docs/cli.md` / `cli.es.md` / `cli.pt.md` (lines 117-123): Full content-server command surface documented in EN/ES/PT.
- `agents/reversa-agents-help/SKILL.md`: Slash-command help only, already includes the Content Server entry (lines 41-46). No Phase 4 change needed — confirmed unchanged in working tree.

Optional low-risk notes (non-blocking):

- `agents/reversa-scout/SKILL.md:37-42` runs `content-server inventory --write` inside section 0, before Scout writes `inventory.md` itself. The plan text says "after standard `inventory.md` is written." This works today because the `inventory` command writes/appends to the configured path, but ordering this call after sections 1-5 would more literally match the plan and avoid any edge case where Scout overwrites the file later in the run. Not a blocker.
- `templates/config.toml:42` ships `inventory_path = ""`. If left empty when the integration is enabled, downstream callers must resolve a default (e.g. `<output_folder>/inventory.md`). Consider documenting that default in a comment alongside the block for clarity. Not a blocker.
