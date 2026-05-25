PHASE 4.5 APPROVED

The two gating regressions from the prior review are correctly resolved:

- `lib/commands/update.js:58` — `csAgentSectionMissing` is now `!reversaConfig.sections?.['integrations.cs_agent']`, universal again.
- `lib/commands/update.js:61` — `needsDismissalStateMigration` is now `typeof state.cs_agent_enablement_dismissed === 'boolean'`, universal again.
- The composite `contentServerMigrationNeeded` (`update.js:62-65`) still ORs all four flags, so non-discovery installs hit the migration branch at `update.js:148`, and the inner `if (needsContentServerState)` / `if (needsContentServerConfig)` blocks correctly stay false — no `reversa-content-server` injection into `state.agents` or `[agents].installed`, and the skills loop at `update.js:179-201` iterates over the un-mutated `installedAgents`, so no skill copy.

Test coverage is now adequate:

- `update.test.js:32-105` keeps the discovery double-run case (agents injected exactly once, dismissal normalized, `[integrations.cs_agent]` present, skill + manifest entry written).
- `update.test.js:107-166` adds the non-discovery case (`agents: ['reversa-scout']`, `cs_agent_enablement_dismissed: true`, no integration block) and asserts:
  - `state.agents` stays exactly `['reversa-scout']` (no injection),
  - `cs_agent_enablement_dismissed` becomes `null`,
  - `[integrations.cs_agent]` with `enabled = false` is written,
  - no `"reversa-content-server"` token in `config.toml`,
  - no `.agents/skills/reversa-content-server` directory.

Together these pin down the universal-vs-discovery split the contract requires.

## Optional low-risk notes

- `update.js:75-78` early-returns when on the latest version and no migration is needed, which is correct. The non-discovery test exercises the "latest version + migration needed" path; consider, as a future hardening, also asserting the message at `update.js:79` ("Continuing to apply installation migrations.") is emitted — purely informational, not blocking.
- The non-discovery test has `engines: []`, so the skills/entry-file loops are no-ops by virtue of an empty `installedEngines`. That's the right behavior for this fixture but means the test isn't exercising "non-discovery install with engines" — if you want fuller coverage later, a variant with `engines: ['codex']` and `agents: ['reversa-scout']` would also verify that the scout skill is reinstalled while `reversa-content-server` is still not copied. Not required for sign-off.
- Reordering `hasDiscoveryCore` ahead of `csAgentSectionMissing` (lines 57-58) is cosmetic and fine; no behavioral effect.
