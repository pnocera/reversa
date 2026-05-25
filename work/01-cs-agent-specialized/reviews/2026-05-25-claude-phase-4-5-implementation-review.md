PHASE 4.5 NOT APPROVED

## Blocking findings

### 1. `csAgentSectionMissing` is now wrongly gated by `hasDiscoveryCore` (`lib/commands/update.js:58`)

Contract bullet: *"Existing installs also get missing default `[integrations.cs_agent]` … without applying this content-server migration to non-discovery installs."* That phrasing scopes the **content-server agent install** to discovery installs, while keeping the missing `[integrations.cs_agent]` default migration universal — which matches the templates: `templates/config.toml:37-44` ships this block for every install, not only discovery ones.

The pre-diff code did this correctly. The new line restricts the default-block migration to discovery installs only, so an existing non-discovery install (e.g., one that pre-dates the cs-agent integration block) will never have the section backfilled by `update`. Other code paths read this section as authoritative (`lib/commands/content-server.js:90,144,244`); leaving it missing silently is the exact failure mode the contract is calling out.

Required fix: revert the gating, e.g.

```js
const csAgentSectionMissing = !reversaConfig.sections?.['integrations.cs_agent'];
```

### 2. `needsDismissalStateMigration` is now wrongly gated by `hasDiscoveryCore` (`lib/commands/update.js:61`)

Same problem. The contract calls the dismissal-state migration (boolean → null) out alongside the `[integrations.cs_agent]` default as a universal existing-install migration. `templates/state.json:12` defaults `cs_agent_enablement_dismissed: null` for every install, and writer paths set it on any install that goes through the prompt (`lib/installer/writer.js:150,215`), independent of whether `reversa-scout` was selected.

With the new gating, a non-discovery install that has the old boolean value stuck in `state.json` is never normalized — reads of `state.cs_agent_enablement_dismissed` will keep returning a boolean, and any consumer expecting `object | null` (see `agents/reversa/references/state-schema.md:17`, `:69`) sees a stale shape forever.

Required fix:

```js
const needsDismissalStateMigration = typeof state.cs_agent_enablement_dismissed === 'boolean';
```

### 3. Test coverage does not exercise the non-discovery migration path (`lib/commands/__tests__/update.test.js`)

The single test covers only the discovery-core happy path, which is why the two regressions above pass `node --test` and `npm test`. Once the gating is fixed, add a second case that asserts a non-discovery install (e.g., `agents: ['reversa-scout']` only, with `cs_agent_enablement_dismissed: true` and no `[integrations.cs_agent]` block) ends up with the section default written and the dismissal state normalized to `null`, while `state.agents` and `[agents].installed` are **not** touched (no `reversa-content-server` injection, no skill copy).

---

The rest of the Phase 4.5 contract is satisfied by the surrounding code: `appendTomlStringArrayValue` is used for `[agents].installed` (`update.js:165-170`), the skill is installed through `writer.installSkill` for every configured engine and the universal skills dir (`update.js:179-201`), no optional teams are added, and the idempotency guards (`hasDiscoveryCore && !installedAgents.includes(CONTENT_SERVER_AGENT_ID)` etc.) plus the early-return on `!contentServerMigrationNeeded` at `update.js:75-78` correctly make re-runs a no-op for the migration.
