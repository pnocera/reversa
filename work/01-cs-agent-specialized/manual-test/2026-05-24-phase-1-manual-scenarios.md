# Reversa x cs-agent Phase 1 Manual Scenarios

Date: 2026-05-24

Purpose: manually prove the remaining Phase 1 end-to-end gates after the unit and live adapter checks pass.

Reference inputs:

- Reversa repo: `F:\smoke\reversa\reversa`
- cs-agent executable: `F:\smoke\CS253\cs-agent.exe`
- Content Server profile: `CS253`
- Content Server install: `E:\CS253`
- cs-agent workdir: `E:\CS253_workdir`

Proof output folder:

```powershell
F:\smoke\reversa\reversa\work\01-cs-agent-specialized\proof
```

## Automation

Prefer the WezTerm harness for repeatable proof runs. It drives the interactive installer in a real terminal, saves transcripts, and then uses deterministic file checks as the pass/fail authority.

Fast bounded adapter proof without starting Codex:

```powershell
Set-Location F:\smoke\reversa\reversa
.\work\01-cs-agent-specialized\manual-test\run-phase-1-wezterm.ps1 -Scenario Both -IncludeDecline
```

Full interactive Codex proof:

```powershell
Set-Location F:\smoke\reversa\reversa
.\work\01-cs-agent-specialized\manual-test\run-phase-1-wezterm.ps1 -Scenario Both -IncludeDecline -RunCodex
```

The full Codex mode launches WezTerm panes and kills those panes after artifacts are verified unless `-KeepWindows` is passed. It retains disposable temp cases by default so failed runs can be inspected; pass `-RemoveCases` only when the proof artifacts are enough.

Create one transcript file per scenario and save the resulting inventory sample:

```text
proof/scenario-a-transcript.md
proof/scenario-b-transcript.md
proof/sample-inventory.md
```

## Preflight

Run from `F:\smoke\reversa\reversa`:

```powershell
npm test
$env:RUN_CS_AGENT_TESTS='1'
$env:CS_AGENT_EXE='F:\smoke\CS253\cs-agent.exe'
$env:CS_AGENT_PROFILE='CS253'
npm run test:cs-agent
```

Expected:

- `npm test` passes.
- Live integration test passes.
- No command runs `cs-agent init`, `init refresh`, build, lint, test, dev, csui, edit, xlate, deploy, or any graph rebuild/index refresh command.

## Scenario A - Fresh Install Enables cs-agent

Goal: a fresh install on a machine with reachable cs-agent asks during install, persists config, and the first Reversa run renders `## CS Profile (cs-agent)` into `_reversa_sdd/inventory.md`.

### Setup

Use a disposable project copy. Do not run this in the Reversa repo itself.

```powershell
$src = 'E:\CS253'
$case = Join-Path $env:TEMP ('reversa-scenario-a-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $case | Out-Null
Set-Location $case
git init | Out-Null
$env:CS_AGENT_EXE='F:\smoke\CS253\cs-agent.exe'
$env:CS_AGENT_PROFILE='CS253'
node F:\smoke\reversa\reversa\bin\reversa.js content-server probe --executable $env:CS_AGENT_EXE
node F:\smoke\reversa\reversa\bin\reversa.js content-server detect --executable $env:CS_AGENT_EXE
```

If you need real source tree behavior, copy or link only what is safe for the test. Do not mutate `E:\CS253` or `E:\CS253_workdir`.

The install prompt can only offer Content Server integration when `cs-agent.exe` is resolvable by explicit config, package-local binary, `CS_AGENT_EXE`, `CS_AGENT_EXECUTABLE`, or `PATH`. For this manual run, keep the same PowerShell session after setting `CS_AGENT_EXE`.

Because the installed agent skills call `npx @pnocera/reversa ...`, unpublished local builds must be made available to `npx` before running Codex from the disposable project:

```powershell
npm install --no-save --package-lock=false F:\smoke\reversa\reversa
npx @pnocera/reversa content-server detect --json
```

Do not publish to npm just to run this local scenario. Publish only when you are ready to validate the released package path.

### Install

Run the local package under test:

```powershell
node F:\smoke\reversa\reversa\bin\reversa.js install
```

During prompts:

- Select a normal engine set.
- Accept the Content Server integration prompt for profile `CS253`.

Expected installer results:

- `.reversa/config.toml` has:
  - `[integrations.cs_agent]`
  - `enabled = true`
  - `profile = "CS253"`
  - `executable = "F:\\smoke\\CS253\\cs-agent.exe"` or equivalent escaped path
  - `context_dir = ".reversa/context/cs-agent"`
  - `inventory_path = "_reversa_sdd/inventory.md"` or your configured output folder
  - `snapshot_ttl_days = 7`
- `.reversa/state.json#cs_agent_enablement_dismissed` is `null`.
- `.gitignore` contains `.reversa/context/cs-agent/`.
- Installed skills include `reversa-content-server`.

### First Reversa Run

Start the installed agent in the engine you selected. If testing manually with Codex-style activation, type:

```text
reversa
```

Expected:

- Reversa detects `[integrations.cs_agent].enabled = true`.
- It runs:
  - `reversa content-server snapshot`
  - `reversa content-server inventory`
- Scout uses `.reversa/context/cs-agent/graph-status.json`.
- Scout does not recursively walk `E:\CS253_workdir\srcmodules`.
- `_reversa_sdd/inventory.md` contains exactly one CS Profile block.

### Scenario A Checks

```powershell
$inventory = Join-Path $case '_reversa_sdd\inventory.md'
$content = Get-Content -Raw $inventory
($content | Select-String '<!-- reversa:cs-profile:begin -->' -AllMatches).Matches.Count
($content | Select-String '<!-- reversa:cs-profile:end -->' -AllMatches).Matches.Count
$content -match '## CS Profile \(cs-agent\)'
$content -match 'Profile: `CS253`'
Test-Path (Join-Path $case '.reversa\context\cs-agent\_meta.json')
Test-Path (Join-Path $case '.reversa\context\cs-agent\graph-status.json')
```

Pass criteria:

- Marker begin count is `1`.
- Marker end count is `1`.
- Heading exists.
- Profile is `CS253`.
- `_meta.json` and `graph-status.json` exist.
- Scout enabled path is under 60 seconds from Content Server snapshot start to inventory rendered.

Save:

- Full transcript to `proof/scenario-a-transcript.md`.
- Copy the CS Profile block to `proof/sample-inventory.md` if this is the first successful run.

## Scenario B - Existing Install Migration

Goal: an already-installed Reversa project with cs-agent disabled detects the profile, asks once per fingerprint, collects the snapshot synchronously on acceptance, and uses the fast path on the second run.

### Setup

Use a disposable project with Reversa installed but cs-agent disabled.

```powershell
$case = Join-Path $env:TEMP ('reversa-scenario-b-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $case | Out-Null
Set-Location $case
git init | Out-Null
$env:CS_AGENT_EXE='F:\smoke\CS253\cs-agent.exe'
$env:CS_AGENT_PROFILE='CS253'
npm install --no-save --package-lock=false F:\smoke\reversa\reversa
npx @pnocera/reversa content-server detect --json
node F:\smoke\reversa\reversa\bin\reversa.js install
```

If the installer asks to enable Content Server, decline for this setup.

Before starting Codex or any Reversa agent from this disposable project, verify that local `npx` resolves the unpublished package:

```powershell
npx @pnocera/reversa content-server detect --json
```

If this prints `Comando desconhecido: "content-server"`, stop the scenario. `npx` is still using the published package instead of the local checkout, and the migration prompt cannot be validated.

Verify or force the disabled state:

```powershell
notepad .reversa\config.toml
```

Ensure:

```toml
[integrations.cs_agent]
enabled = false
profile = ""
```

If `.reversa/state.json#cs_agent_enablement_dismissed` has a matching object from setup, set it to `null` so the migration prompt can be tested.

### First Reversa Run

Start Reversa:

```text
reversa
```

Expected:

- Reversa may first present the exploration plan approval prompt. Approve the plan and confirm starting Scout.
- Before Scout actually starts, Reversa runs the Content Server specialization gate.
- Scout performs cheap pre-walk detection.
- `.reversa/context/surface.json` records `cs_agent_profile_detected` or the orchestrator detects the same profile directly.
- Reversa prompts:

```text
I found an initialized Content Server profile named `CS253` at `E:\CS253`.
Reversa can use `cs-agent` in read-only mode to cache profile, graph, and documentation-category evidence before Scout runs.
Enable this Content Server specialization for this project?

1. Yes, enable and collect the snapshot now
2. Not now
```

Choose option `1`.

Expected immediately in the same session:

- `.reversa/config.toml` is updated with `enabled = true`, `profile = "CS253"`, and the executable path.
- `.gitignore` contains `.reversa/context/cs-agent/`.
- Snapshot is collected under `.reversa/context/cs-agent/`.
- `_reversa_sdd/inventory.md` gets the CS Profile block before the session proceeds past Scout.

### Second Reversa Run

Start Reversa again:

```text
reversa
```

Expected:

- No enablement prompt for the same fingerprint.
- Fast path runs because `[integrations.cs_agent].enabled = true`.
- Scout skips recursive traversal of `E:\CS253_workdir\srcmodules`.
- Enabled-path Scout duration remains under 60 seconds.

### Dismissal Fingerprint Check

Repeat setup with Content Server disabled. On the prompt, choose option `2`.

Expected:

- `.reversa/state.json#cs_agent_enablement_dismissed` is an object with:
  - `profile`
  - `ot_home`
  - `executable_path`
  - `help_sha256`
  - `dismissed_at`
- Re-running with the same profile/executable does not ask again.
- Changing the executable path or active profile causes Reversa to ask again.

### Scenario B Checks

```powershell
$config = Get-Content -Raw .reversa\config.toml
$state = Get-Content -Raw .reversa\state.json | ConvertFrom-Json
$inventory = Get-Content -Raw _reversa_sdd\inventory.md
$config -match 'enabled = true'
$config -match 'profile = "CS253"'
$inventory -match '<!-- reversa:cs-profile:begin -->'
$inventory -match '## CS Profile \(cs-agent\)'
Test-Path .reversa\context\cs-agent\_meta.json
Test-Path .reversa\context\cs-agent\adapter.log
```

Pass criteria:

- Config enabled.
- Profile persisted.
- Inventory block exists exactly once.
- Snapshot marker exists.
- Audit log exists.
- Second run is fast path and under 60 seconds.
- Decline path writes a fingerprint object and suppresses repeated prompts for the same fingerprint.

Save:

- Full transcript to `proof/scenario-b-transcript.md`.
- If Scenario A did not create `proof/sample-inventory.md`, copy the CS Profile block from this run.

## Final Gate Summary

Mark Phase 1 manual proof complete only when:

- Scenario A passes.
- Scenario B accept path passes.
- Scenario B decline/fingerprint path passes.
- Enabled Scout path is measured under 60 seconds.
- `proof/scenario-a-transcript.md`, `proof/scenario-b-transcript.md`, and `proof/sample-inventory.md` exist.
