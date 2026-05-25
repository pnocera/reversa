PHASE 5 APPROVED

The diff fully satisfies the Phase 5 contract.

**Prompt path** (`lib/installer/prompts.js`)
- `askCsAgentEnablement` is invoked at L251 in `runInstallPrompts`, after the standard answers and before the return — read-only probe + detect with `jsonMode: true, quiet: true` (L268–275).
- Probe/detect throw → silent `{available:false, enabled:false, dismissed:null}` (L276–282).
- Zero profiles → silent `{available:true, enabled:false, dismissed:null, signal:'cs_agent_no_profile'}` (L287–296).
- One profile → confirm only (L340–346).
- >1 profiles → list picker with the `__skip_cs_agent_profile__` sentinel (L304–319).
- Accept payload carries `enabled, profile, ot_home, workdir, executable, fingerprint` (L366–375).
- Decline and skip both build `dismissedFingerprint` with `dismissed_at` and emit `dismissed` + `dismissedFingerprint` plus profile/ot_home/workdir (L320–335, L349–363).

**Writer** (`lib/installer/writer.js`)
- `applyCsAgentAnswers` upserts `[integrations.cs_agent]` in `config.toml` via `upsertTomlSection({insertAfter:'analysis'})` (L204–213) and forces `executable = ''` there.
- Enabled-only branch upserts `executable` into `config.user.toml` via `upsertTomlSection` (L214–218) — not into managed config.
- `state.cs_agent_enablement_dismissed` written from `dismissed ?? dismissedFingerprint ?? null` (L220–225).
- `ensureCsAgentContextDir` + `updateCsAgentGitignore` fire on enable OR dismissal (L227–230), independent of `answers.git_strategy`. New context dir is `_register`-ed so uninstall tracks it (L368–375).

**Uninstall** (`lib/commands/uninstall.js`)
- Cs-agent context cache is announced (L71–73) and removed transitively by the `.reversa/` rmSync at L127–128. Regression test `lib/commands/__tests__/uninstall.test.js` proves the cache is gone after uninstall (L31–32).

**Update** (`lib/commands/update.js`) — unchanged in this diff; Phase 4.5 migration logic intact.

**Optional low-risk notes (non-blocking):**
- When probe/detect fail silently (`available:false`), `applyCsAgentAnswers` still writes a stub `[integrations.cs_agent]` with `enabled=false`. Harmless and arguably useful (sets `context_dir`, `snapshot_ttl_days`), but worth a comment if you want future readers to know it's intentional.
- `state.cs_agent_enablement_dismissed` is set twice during a fresh install — once in `createReversaDir` (L150) and again in `applyCsAgentAnswers` (L223). Functionally identical; you could drop the L150 assignment to keep ownership of that field in one place.
- The `data.executableTrust ??= probeData.executableTrust;` belt-and-suspenders (prompts.js L286) is only exercised by tests that mock `detect` without merging probe trust; production `detect` already merges it. Fine as-is, or simplify if the mock seam isn't worth preserving.
