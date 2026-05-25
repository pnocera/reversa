# Phase 8 Gate Roster

Date: 2026-05-25
Reference host: CS253 (`F:\smoke\CS253\cs-agent.exe`, profile `CS253`)
Status: all hard gates G1-G17 have passing evidence. No open Phase 8 defect was filed.

| Gate | Status | Evidence |
|---|---|---|
| G1 - Executable resolution | PASS | `lib/integrations/__tests__/cs-agent.test.js` covers configured aliases and ignores `CSWORKS_ROOT`; `npm test` passes. |
| G2 - Probe trust shape | PASS | `lib/integrations/__tests__/cs-agent.test.js` and `lib/commands/__tests__/content-server.test.js`; live evidence in `2026-05-25-phase-7-live-cs-agent.txt` and `scenario-b-phase8-raw.json`. |
| G3 - Allowlist refuses unsafe commands | PASS | `read-only runner rejects unclassified commands`, `read-only runner rejects empty profile before spawning`, and CLI invalid mode tests. |
| G4 - Profile-less detect | PASS | `detectProfile is the profile-less registry aggregation path`; Scenario B detect found active `CS253` without choosing automatically. |
| G5 - Live graph status numbers | PASS | `2026-05-25-phase-7-live-cs-agent.txt`; Scenario A/B inventory blocks show 940729 nodes, 2251241 edges, and 148 modules. |
| G6 - Snapshot commit marker | PASS | `collectSnapshot writes snapshot data and validation accepts it`, partial snapshot refusal test, and `_meta.json` in Scenario A/B assets. |
| G7 - Profile argv and mismatch | PASS | `read-only runner allows only classified commands and pins profile/json flags`; `read-only runner rejects profile mismatch`. |
| G8 - Scout records detect signal | PASS | `agents/reversa-scout/SKILL.md`; `scenario-b-phase8-surface.json` contains `cs_agent_profile_detected`. |
| G9 - Scout does not auto-enable | PASS | `scenario-b-transcript.md` shows config remains `enabled = false` after Scout surface signal; Scout skill forbids config writes. |
| G10 - Installer prompt path | PASS | `scenario-a-transcript.md`, Scenario A install transcripts, `writer stores enabled cs-agent executable in config.user.toml`, and installer prompt tests. |
| G11 - Orchestrator migration prompt | PASS | `scenario-b-transcript.md` captures post-Scout prompt, accept path, config update, `config.user.toml` executable, snapshot, and inventory in the same session. |
| G12 - Skip deep walk only on enabled snapshot | PASS | `scenario-a-transcript.md` addendum and `scenario-a-assets/inventory.md` state Scout skipped exactly `E:\CS253_workdir\srcmodules` and used snapshot evidence. |
| G13 - Inventory block idempotent | PASS | `renderInventorySection replaces an existing marked block`, dangling-marker test, `sample-inventory.md`, and Scenario B second run with one marker pair. |
| G14 - Enabled fast path under 60 seconds | PASS | Scenario A fast-path timing: 16121 ms; Scenario B second run: 16998 ms. |
| G15 - CLI discoverable | PASS | `node bin/reversa.js --help` lists `content-server`; `node bin/reversa.js content-server --help` lists `probe`, `detect`, `snapshot`, `inventory`, `doctor`. |
| G16 - Adapter failure fallback | PASS | CLI exit-code tests for snapshot partial and inventory render blocking; Scout skill records probe/snapshot failure signals and continues generic flow. |
| G17 - Audit log and uninstall | PASS | `audit log rotates before append would exceed the limit`; `uninstall removes the cs-agent context cache with .reversa`; live adapter run creates `adapter.log`. |

## Verification Commands

```powershell
npm test
node bin\reversa.js --help
node bin\reversa.js content-server --help
$env:RUN_CS_AGENT_TESTS='1'; node scripts/test-cs-agent-integration.mjs
```

The live command was run in Phase 7 and passed with the transcript saved to `2026-05-25-phase-7-live-cs-agent.txt`. The Phase 8 Scenario A and B timing measurements were taken separately because they exercise retained/disposable end-to-end fixtures rather than the bounded live script.
