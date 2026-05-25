# Scenario B Corrected Lifecycle Transcript

Date: 2026-05-25T07:58:25Z to 2026-05-25T07:59:01Z
Project: `C:\Windows\TEMP\reversa-scenario-b-phase8-66VA46`
Package source: local checkout `F:\smoke\reversa\reversa`
cs-agent executable: `F:\smoke\CS253\cs-agent.exe`
Profile: `CS253`

This is the canonical Scenario B transcript for Phase 8. It supersedes the older `scenario-b-*-codex-transcript.md` files that used the obsolete pre-Scout Content Server gate wording.

## Starting State

The fixture was installed with Reversa present and Content Server disabled:

```toml
[integrations.cs_agent]
enabled = false
profile = ""
executable = ""
context_dir = ".reversa/context/cs-agent"
inventory_path = ""
snapshot_ttl_days = 7
```

State before Scout:

```json
{
  "phase": null,
  "cs_agent_enablement_dismissed": null,
  "engines": ["codex"],
  "agents": ["reversa", "reversa-scout", "reversa-archaeologist", "reversa-content-server"]
}
```

## Scout Detect-Only Pass

Commands executed through the Reversa adapter only:

```powershell
node F:\smoke\reversa\reversa\bin\reversa.js content-server probe --json
node F:\smoke\reversa\reversa\bin\reversa.js content-server detect --json
```

Detect result:

```json
{
  "ok": true,
  "action": "detect",
  "active": "CS253",
  "executable": "F:\\smoke\\CS253\\cs-agent.exe",
  "help_signature_sha256": "6868bbbc1b965abde49e7c2cbc4006362e1d41e940cc8fc22f793c66ff1fcb6e"
}
```

Scout wrote `.reversa/context/surface.json` with the post-Scout signal:

```json
{
  "signals": [
    {
      "type": "cs_agent_profile_detected",
      "profile": "CS253",
      "ot_home": "E:\\CS253",
      "executable_path": "F:\\smoke\\CS253\\cs-agent.exe",
      "help_sha256": "6868bbbc1b965abde49e7c2cbc4006362e1d41e940cc8fc22f793c66ff1fcb6e",
      "evidence": ["content-server detect", "CS253", "E:\\CS253"]
    }
  ]
}
```

Config after this Scout pass was still disabled, proving Scout did not auto-enable:

```toml
[integrations.cs_agent]
enabled = false
profile = ""
executable = ""
context_dir = ".reversa/context/cs-agent"
inventory_path = ""
snapshot_ttl_days = 7
```

## Orchestrator Prompt And Acceptance

The current orchestrator contract asks after Scout and before Archaeologist:

```text
I found an initialized Content Server profile named `CS253` at `E:\CS253`.
Reversa can use `cs-agent` in read-only mode to cache profile, graph, and documentation-category evidence before the next analysis step.
Enable this Content Server specialization for this project?

1. Yes, enable and collect the snapshot now
2. Not now
```

Accepted choice: `1`.

Config after acceptance:

```toml
[integrations.cs_agent]
enabled = true
profile = "CS253"
executable = ""
context_dir = ".reversa/context/cs-agent"
inventory_path = "_reversa_sdd/inventory.md"
snapshot_ttl_days = 7
```

Personal override after acceptance:

```toml
[integrations.cs_agent]
executable = "F:\\smoke\\CS253\\cs-agent.exe"
```

`.gitignore` contains `.reversa/context/cs-agent/`.

## Synchronous Snapshot And Inventory

Commands executed before Archaeologist:

```powershell
node F:\smoke\reversa\reversa\bin\reversa.js content-server snapshot --json
node F:\smoke\reversa\reversa\bin\reversa.js content-server inventory --write --json
```

Snapshot result:

```json
{
  "ok": true,
  "action": "snapshot",
  "snapshotDir": "C:\\Windows\\Temp\\reversa-scenario-b-phase8-66VA46\\.reversa\\context\\cs-agent",
  "profile": "CS253",
  "adapter_version": "0.1.0",
  "schema_version_observed": 3
}
```

Inventory result:

```json
{
  "ok": true,
  "action": "inventory",
  "written": true,
  "action_taken": "appended",
  "inventoryPath": "C:\\Windows\\Temp\\reversa-scenario-b-phase8-66VA46\\_reversa_sdd\\inventory.md",
  "validation_ok": true,
  "stale": false,
  "executableDrift": false
}
```

Inventory block checks after the first run:

- Heading `## CS Profile (cs-agent)`: present
- Begin markers: 1
- End markers: 1
- Source files: 34171
- Support assets: 24227
- Graph nodes: 940729
- Graph edges: 2251241

## Second `/reversa` Fast Path

The second run starts with `[integrations.cs_agent].enabled = true`, so the migration prompt branch is not eligible. The enabled fast path collected snapshot and inventory before Scout:

```powershell
node F:\smoke\reversa\reversa\bin\reversa.js content-server snapshot --json
node F:\smoke\reversa\reversa\bin\reversa.js content-server inventory --write --json
```

Result:

- Elapsed: 16998 ms
- Under 60 seconds: true
- Snapshot action: ok
- Inventory action: replaced
- Inventory markers after second run: begin = 1, end = 1

## Assets

- Raw command envelope: `scenario-b-phase8-raw.json`
- Scout surface excerpt: `scenario-b-phase8-surface.json`
- Final inventory copy: `scenario-b-phase8-inventory.md`
- Final config copy: `scenario-b-phase8-config.toml`
- Personal config copy: `scenario-b-phase8-config.user.toml`
