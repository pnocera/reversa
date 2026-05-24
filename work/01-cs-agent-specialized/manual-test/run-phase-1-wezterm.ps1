<#
.SYNOPSIS
Automates the Reversa x cs-agent Phase 1 manual scenarios through WezTerm.

.DESCRIPTION
The script uses WezTerm for the interactive surfaces that are hard to test with
plain process IO: the Reversa installer and, optionally, the Codex TUI. Disk
assertions remain the pass/fail authority.

Default mode runs the installer flows, verifies local npx resolution, and proves
the adapter snapshot/inventory path deterministically. Add -RunCodex to start
real Codex sessions in WezTerm and verify the installed skills from artifacts.
#>

[CmdletBinding()]
param(
  [ValidateSet('A', 'B', 'Both')]
  [string] $Scenario = 'Both',

  [switch] $RunCodex,
  [switch] $IncludeDecline,
  [switch] $KeepWindows,
  [switch] $RemoveCases,

  [ValidateSet('Local', 'Published')]
  [string] $PackageSource = 'Local',
  [string] $PublishedPackage = '@pnocera/reversa@latest',

  [string] $ReversaRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string] $CsAgentExe = 'F:\smoke\CS253\cs-agent.exe',
  [string] $Profile = 'CS253',
  [string] $ProofRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'proof'),

  [int] $InstallTimeoutSeconds = 180,
  [int] $CodexTimeoutSeconds = 900
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Command {
  param([Parameter(Mandatory)][string] $Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found on PATH: $Name"
  }
}

function Quote-PS {
  param([Parameter(Mandatory)][string] $Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Get-ReversaPaneCommand {
  param([Parameter(Mandatory)][string[]] $Arguments)
  $argsText = ($Arguments | ForEach-Object { Quote-PS $_ }) -join ' '
  if ($PackageSource -eq 'Published') {
    return "npx -y $(Quote-PS $PublishedPackage) $argsText"
  }
  return "npx @pnocera/reversa $argsText"
}

function Get-ReversaInstallPaneCommand {
  if ($PackageSource -eq 'Published') {
    return "npx -y $(Quote-PS $PublishedPackage) install"
  }
  return "node $(Quote-PS (Join-Path $ReversaRoot 'bin\reversa.js')) install"
}

function Invoke-ReversaPackage {
  param([Parameter(Mandatory)][string[]] $Arguments)
  if ($PackageSource -eq 'Published') {
    & npx -y $PublishedPackage @Arguments
  } else {
    & npx '@pnocera/reversa' @Arguments
  }
}

function Get-ProofRunName {
  param([Parameter(Mandatory)][string] $BaseName)
  if ($PackageSource -eq 'Published') {
    return "$BaseName-published"
  }
  return $BaseName
}

function Get-ProofFile {
  param(
    [Parameter(Mandatory)][string] $BaseName,
    [Parameter(Mandatory)][string] $Kind
  )
  $runName = Get-ProofRunName -BaseName $BaseName
  return Join-Path $ProofRoot "$runName-$Kind"
}

function Get-SummaryPath {
  $suffix = ''
  if ($PackageSource -eq 'Published') {
    $suffix += '-published'
  }
  if ($RunCodex) {
    $suffix += '-codex'
  }
  return Join-Path $ProofRoot "phase-1-wezterm$suffix-summary.json"
}

function New-ScenarioCase {
  param([Parameter(Mandatory)][string] $Name)
  $path = Join-Path $env:TEMP ($Name + '-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $path | Out-Null
  git -C $path init | Out-Null
  return $path
}

function Remove-ScenarioCase {
  param([Parameter(Mandatory)][string] $CaseDir)

  $resolved = (Resolve-Path -LiteralPath $CaseDir).Path
  $temp = (Resolve-Path -LiteralPath $env:TEMP).Path.TrimEnd('\')
  if (-not $resolved.StartsWith($temp + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove scenario case outside TEMP: $resolved"
  }
  if ((Split-Path -Leaf $resolved) -notmatch '^reversa-scenario-') {
    throw "Refusing to remove unexpected scenario folder: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

function Invoke-Wez {
  param([Parameter(ValueFromRemainingArguments)][string[]] $Args)
  $output = & wezterm @Args
  if ($LASTEXITCODE -ne 0) {
    throw "wezterm $($Args -join ' ') failed with exit code $LASTEXITCODE"
  }
  return $output
}

function Start-WezPane {
  param(
    [Parameter(Mandatory)][string] $CaseDir,
    [Parameter(Mandatory)][string] $Title
  )

  $paneId = (Invoke-Wez cli spawn --new-window --cwd $CaseDir --workspace reversa-phase-1 -- powershell -NoLogo -NoProfile -NoExit).Trim()
  Invoke-Wez cli set-tab-title --pane-id $paneId $Title | Out-Null
  Wait-PaneText -PaneId $paneId -Pattern 'PS .*>' -TimeoutSeconds 20 | Out-Null
  return $paneId
}

function Send-PaneText {
  param(
    [Parameter(Mandatory)][string] $PaneId,
    [Parameter(Mandatory)][string] $Text
  )
  Invoke-Wez cli send-text --pane-id $PaneId --no-paste $Text | Out-Null
}

function Send-PaneLine {
  param(
    [Parameter(Mandatory)][string] $PaneId,
    [string] $Text = ''
  )
  Send-PaneText -PaneId $PaneId -Text ($Text + "`r")
}

function Get-PaneText {
  param([Parameter(Mandatory)][string] $PaneId)
  return (& wezterm cli get-text --pane-id $PaneId --start-line -5000) -join "`n"
}

function Save-PaneTranscript {
  param(
    [Parameter(Mandatory)][string] $PaneId,
    [Parameter(Mandatory)][string] $Path
  )
  New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force | Out-Null
  Get-PaneText -PaneId $PaneId | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Wait-PaneText {
  param(
    [Parameter(Mandatory)][string] $PaneId,
    [Parameter(Mandatory)][string] $Pattern,
    [int] $TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $text = Get-PaneText -PaneId $PaneId
    if ($text -match $Pattern) {
      return $text
    }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for pane $PaneId text pattern: $Pattern"
}

function Confirm-CodexTrustIfPrompted {
  param(
    [Parameter(Mandatory)][string] $PaneId,
    [int] $TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $text = Get-PaneText -PaneId $PaneId
    if ($text -match 'Do you trust the contents of this directory\?') {
      Send-PaneLine -PaneId $PaneId -Text '1'
      return $true
    }
    if ($text -match 'OpenAI Codex' -and $text -match 'Working|Run Reversa|Use /skills') {
      return $false
    }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for Codex startup or trust prompt in pane $PaneId"
}

function Stop-WezPane {
  param([Parameter(Mandatory)][string] $PaneId)
  if ($KeepWindows) { return }
  try {
    Invoke-Wez cli kill-pane --pane-id $PaneId | Out-Null
  } catch {
    Write-Warning "Could not kill WezTerm pane ${PaneId}: $($_.Exception.Message)"
  }
}

function Invoke-ScenarioInstaller {
  param(
    [Parameter(Mandatory)][string] $CaseDir,
    [Parameter(Mandatory)][ValidateSet('A', 'B')][string] $ScenarioName,
    [Parameter(Mandatory)][string] $TranscriptPath
  )

  $paneId = Start-WezPane -CaseDir $CaseDir -Title "reversa-$ScenarioName-install"
  try {
    Send-PaneLine $paneId "Write-Host '__REVERSA_PANE_READY__'"
    Wait-PaneText $paneId '__REVERSA_PANE_READY__' 20 | Out-Null

    Send-PaneLine $paneId "`$env:CS_AGENT_EXE=$(Quote-PS $CsAgentExe)"
    Send-PaneLine $paneId "`$env:CS_AGENT_PROFILE=$(Quote-PS $Profile)"
    Send-PaneLine $paneId "`$env:npm_config_yes='true'"
    if ($PackageSource -eq 'Local') {
      Send-PaneLine $paneId "npm install --no-save --package-lock=false $(Quote-PS $ReversaRoot); if (`$LASTEXITCODE -eq 0) { Write-Host '__REVERSA_NPM_INSTALLED__' }"
      Wait-PaneText $paneId '__REVERSA_NPM_INSTALLED__' $InstallTimeoutSeconds | Out-Null
    }

    $detectCommand = Get-ReversaPaneCommand -Arguments @('content-server', 'detect', '--json')
    Send-PaneLine $paneId "$detectCommand; if (`$LASTEXITCODE -eq 0) { Write-Host '__REVERSA_DETECT_DONE__' }"
    Wait-PaneText $paneId '__REVERSA_DETECT_DONE__' $InstallTimeoutSeconds | Out-Null

    Send-PaneLine $paneId (Get-ReversaInstallPaneCommand)

    Wait-PaneText $paneId 'Engines Harness to support' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId
    Wait-PaneText $paneId 'Agents teams to install' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId
    Wait-PaneText $paneId 'Project name:' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId
    Wait-PaneText $paneId 'What should the agents call you' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId 'Neo'
    Wait-PaneText $paneId 'Language for agent interactions' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId 'en-us'
    Wait-PaneText $paneId 'Language for generated documents and specs' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId 'English'
    Wait-PaneText $paneId 'Output folder for specs' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId
    Wait-PaneText $paneId 'How to handle artifacts in git' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId
    Wait-PaneText $paneId 'How do you prefer to answer agent questions' $InstallTimeoutSeconds | Out-Null
    Send-PaneLine $paneId

    $text = Wait-PaneText $paneId 'Enable read-only Content Server integration|Installation complete' $InstallTimeoutSeconds
    if ($text -match 'Enable read-only Content Server integration') {
      if ($ScenarioName -eq 'A') {
        Send-PaneLine $paneId
      } else {
        Send-PaneLine $paneId 'n'
      }
    }

    Wait-PaneText $paneId 'Installation complete' $InstallTimeoutSeconds | Out-Null
    Save-PaneTranscript -PaneId $paneId -Path $TranscriptPath
  } finally {
    Stop-WezPane $paneId
  }
}

function Invoke-DirectSnapshot {
  param([Parameter(Mandatory)][string] $CaseDir)

  Push-Location $CaseDir
  $oldExe = $env:CS_AGENT_EXE
  $oldProfile = $env:CS_AGENT_PROFILE
  try {
    $env:CS_AGENT_EXE = $CsAgentExe
    $env:CS_AGENT_PROFILE = $Profile
    Invoke-ReversaPackage -Arguments @('content-server', 'snapshot', '--json') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'content-server snapshot failed' }
    Invoke-ReversaPackage -Arguments @('content-server', 'inventory', '--json') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'content-server inventory failed' }
  } finally {
    $env:CS_AGENT_EXE = $oldExe
    $env:CS_AGENT_PROFILE = $oldProfile
    Pop-Location
  }
}

function Enable-ScenarioBConfig {
  param([Parameter(Mandatory)][string] $CaseDir)

  $escapedExe = $CsAgentExe -replace '\\', '\\'
  $configPath = Join-Path $CaseDir '.reversa\config.toml'
  $config = Get-Content -Raw -LiteralPath $configPath
  $next = [regex]::Replace(
    $config,
    '(?s)\[integrations\.cs_agent\].*?(?=\r?\n\[|$)',
    "[integrations.cs_agent]`r`nenabled = true`r`nprofile = `"$Profile`"`r`nexecutable = `"$escapedExe`"`r`ncontext_dir = `".reversa/context/cs-agent`"`r`ninventory_path = `"_reversa_sdd/inventory.md`"`r`nsnapshot_ttl_days = 7`r`n"
  )
  Set-Content -LiteralPath $configPath -Value $next -Encoding UTF8
  Add-GitignoreLine -CaseDir $CaseDir -Line '.reversa/context/cs-agent/'
}

function Add-GitignoreLine {
  param(
    [Parameter(Mandatory)][string] $CaseDir,
    [Parameter(Mandatory)][string] $Line
  )
  $path = Join-Path $CaseDir '.gitignore'
  $existing = if (Test-Path -LiteralPath $path) { Get-Content -Raw -LiteralPath $path } else { '' }
  if (($existing -split '\r?\n') -contains $Line) { return }
  Add-Content -LiteralPath $path -Value $Line
}

function Set-ScenarioBDismissed {
  param([Parameter(Mandatory)][string] $CaseDir)

  Push-Location $CaseDir
  $oldExe = $env:CS_AGENT_EXE
  $oldProfile = $env:CS_AGENT_PROFILE
  try {
    $env:CS_AGENT_EXE = $CsAgentExe
    $env:CS_AGENT_PROFILE = $Profile
    $raw = Invoke-ReversaPackage -Arguments @('content-server', 'detect', '--json')
    if ($LASTEXITCODE -ne 0) { throw 'content-server detect failed' }
  } finally {
    $env:CS_AGENT_EXE = $oldExe
    $env:CS_AGENT_PROFILE = $oldProfile
    Pop-Location
  }

  $detected = $raw | ConvertFrom-Json
  $profileData = @($detected.data.profiles | Where-Object { $_.name -eq $Profile } | Select-Object -First 1)[0]
  if (-not $profileData) { throw "Profile not found during dismissal setup: $Profile" }

  $statePath = Join-Path $CaseDir '.reversa\state.json'
  $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  $state.cs_agent_enablement_dismissed = [pscustomobject]@{
    profile = $profileData.name
    ot_home = $profileData.ot_home
    executable_path = $detected.data.executable
    help_sha256 = $detected.data.executableTrust.help_signature_sha256
    dismissed_at = (Get-Date).ToUniversalTime().ToString('o')
  }
  $state | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Invoke-CodexRun {
  param(
    [Parameter(Mandatory)][string] $CaseDir,
    [Parameter(Mandatory)][ValidateSet('A', 'B-Accept', 'B-Decline')][string] $RunName,
    [Parameter(Mandatory)][string] $TranscriptPath
  )

  $paneId = Start-WezPane -CaseDir $CaseDir -Title "reversa-$RunName-codex"
  try {
    $choice = if ($RunName -eq 'B-Decline') { 'choose option 2 and do not enable Content Server' } else { 'choose option 1 and enable profile CS253 when prompted' }
    $prompt = @"
Run Reversa in this disposable test project. Treat this as if the user typed "reversa".

Automation contract:
- Approve the exploration plan.
- Before Scout starts, obey the Content Server specialization gate.
- If Content Server enablement is offered, $choice.
- Use only read-only Reversa adapter commands: npx @pnocera/reversa content-server probe, detect, snapshot, and inventory.
- Do not run cs-agent.exe directly and do not run init, refresh, build, lint, test, dev, csui, edit, xlate, deploy, or graph rebuild commands.
- The scenario package source is $PackageSource. If it is Published, do not install from $ReversaRoot.
- Stop after Scout writes _reversa_sdd/inventory.md and .reversa/context/surface.json, or after the decline fingerprint is written for the decline scenario.
- Do not start Archaeologist.
- Finish with the literal marker ${RunName}_DONE.
"@
    $encodedPrompt = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($prompt))
    Send-PaneLine $paneId "`$env:CS_AGENT_EXE=$(Quote-PS $CsAgentExe)"
    Send-PaneLine $paneId "`$env:CS_AGENT_PROFILE=$(Quote-PS $Profile)"
    Send-PaneLine $paneId "`$env:npm_config_yes='true'"
    Send-PaneLine $paneId "`$p=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('$encodedPrompt'))"
    Send-PaneLine $paneId "codex --no-alt-screen --dangerously-bypass-approvals-and-sandbox `$p"
    Confirm-CodexTrustIfPrompted -PaneId $paneId | Out-Null

    if ($RunName -eq 'B-Decline') {
      Wait-ForDismissal -CaseDir $CaseDir -TimeoutSeconds $CodexTimeoutSeconds
    } else {
      Wait-ForInventory -CaseDir $CaseDir -TimeoutSeconds $CodexTimeoutSeconds
    }
    Save-PaneTranscript -PaneId $paneId -Path $TranscriptPath
  } catch {
    $failedTranscript = $TranscriptPath -replace '\.md$', '-failed.md'
    try {
      Save-PaneTranscript -PaneId $paneId -Path $failedTranscript
      Write-Warning "Saved failed Codex transcript: $failedTranscript"
    } catch {
      Write-Warning "Could not save failed Codex transcript: $($_.Exception.Message)"
    }
    throw
  } finally {
    Stop-WezPane $paneId
  }
}

function Wait-ForInventory {
  param(
    [Parameter(Mandatory)][string] $CaseDir,
    [int] $TimeoutSeconds = 900
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $inventory = Join-Path $CaseDir '_reversa_sdd\inventory.md'
  $meta = Join-Path $CaseDir '.reversa\context\cs-agent\_meta.json'
  do {
    if ((Test-Path -LiteralPath $inventory) -and (Test-Path -LiteralPath $meta)) {
      $content = Get-Content -Raw -LiteralPath $inventory
      if ($content -match '<!-- reversa:cs-profile:begin -->') { return }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for inventory and cs-agent snapshot in $CaseDir"
}

function Wait-ForDismissal {
  param(
    [Parameter(Mandatory)][string] $CaseDir,
    [int] $TimeoutSeconds = 900
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $statePath = Join-Path $CaseDir '.reversa\state.json'
  do {
    if (Test-Path -LiteralPath $statePath) {
      $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
      if ($state.cs_agent_enablement_dismissed -and $state.cs_agent_enablement_dismissed.profile -eq $Profile) {
        return
      }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for dismissal fingerprint in $CaseDir"
}

function Assert-InstalledPackageResolution {
  param([Parameter(Mandatory)][string] $CaseDir)
  Push-Location $CaseDir
  $oldExe = $env:CS_AGENT_EXE
  $oldProfile = $env:CS_AGENT_PROFILE
  try {
    $env:CS_AGENT_EXE = $CsAgentExe
    $env:CS_AGENT_PROFILE = $Profile
    $json = Invoke-ReversaPackage -Arguments @('content-server', 'detect', '--json')
    if ($LASTEXITCODE -ne 0) { throw 'npx content-server detect failed' }
    $parsed = $json | ConvertFrom-Json
    if ($parsed.ok -ne $true -or $parsed.action -ne 'detect') {
      throw 'npx content-server detect did not return an ok detect envelope'
    }
    if (-not (@($parsed.data.profiles | Where-Object { $_.name -eq $Profile }).Count)) {
      throw "npx detect did not find profile $Profile"
    }
  } finally {
    $env:CS_AGENT_EXE = $oldExe
    $env:CS_AGENT_PROFILE = $oldProfile
    Pop-Location
  }
}

function Assert-EnabledScenario {
  param([Parameter(Mandatory)][string] $CaseDir)

  $config = Get-Content -Raw -LiteralPath (Join-Path $CaseDir '.reversa\config.toml')
  if ($config -notmatch 'enabled\s*=\s*true') { throw 'Expected integrations.cs_agent.enabled = true' }
  if ($config -notmatch "profile\s*=\s*`"$([regex]::Escape($Profile))`"") { throw "Expected profile $Profile in config" }

  $gitignore = Get-Content -Raw -LiteralPath (Join-Path $CaseDir '.gitignore')
  if ($gitignore -notmatch '\.reversa/context/cs-agent/') { throw 'Expected cs-agent context in .gitignore' }

  $inventoryPath = Join-Path $CaseDir '_reversa_sdd\inventory.md'
  if (-not (Test-Path -LiteralPath $inventoryPath)) { throw 'Expected inventory.md' }
  $inventory = Get-Content -Raw -LiteralPath $inventoryPath
  $begin = ([regex]::Matches($inventory, '<!-- reversa:cs-profile:begin -->')).Count
  $end = ([regex]::Matches($inventory, '<!-- reversa:cs-profile:end -->')).Count
  if ($begin -ne 1 -or $end -ne 1) { throw "Expected exactly one CS profile block; got begin=$begin end=$end" }
  if ($inventory -notmatch '## CS Profile \(cs-agent\)') { throw 'Expected CS Profile heading' }
  if ($inventory -notmatch "Profile: ``$([regex]::Escape($Profile))``") { throw "Expected profile $Profile in inventory" }

  foreach ($relative in @(
    '.reversa\context\cs-agent\_meta.json',
    '.reversa\context\cs-agent\graph-status.json',
    '.reversa\context\cs-agent\profile-info.json',
    '.reversa\context\cs-agent\docs-categories.json',
    '.reversa\context\cs-agent\adapter.log'
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $CaseDir $relative))) {
      throw "Expected artifact missing: $relative"
    }
  }
}

function Assert-DisabledAfterInstall {
  param([Parameter(Mandatory)][string] $CaseDir)
  $config = Get-Content -Raw -LiteralPath (Join-Path $CaseDir '.reversa\config.toml')
  if ($config -notmatch 'enabled\s*=\s*false') { throw 'Expected disabled install config' }
  if ($config -notmatch 'profile\s*=\s*""') { throw 'Expected empty profile after disabled install' }
}

function Clear-ScenarioBDismissal {
  param([Parameter(Mandatory)][string] $CaseDir)

  $statePath = Join-Path $CaseDir '.reversa\state.json'
  $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  $state.cs_agent_enablement_dismissed = $null
  $state | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Assert-DismissedScenario {
  param([Parameter(Mandatory)][string] $CaseDir)
  $config = Get-Content -Raw -LiteralPath (Join-Path $CaseDir '.reversa\config.toml')
  if ($config -notmatch 'enabled\s*=\s*false') { throw 'Expected disabled config after dismissal' }

  $state = Get-Content -Raw -LiteralPath (Join-Path $CaseDir '.reversa\state.json') | ConvertFrom-Json
  $dismissed = $state.cs_agent_enablement_dismissed
  if (-not $dismissed) { throw 'Expected cs_agent_enablement_dismissed object' }
  foreach ($key in @('profile', 'ot_home', 'executable_path', 'help_sha256', 'dismissed_at')) {
    if (-not $dismissed.$key) { throw "Dismissal fingerprint missing $key" }
  }
  if ($dismissed.profile -ne $Profile) { throw "Dismissal profile mismatch: $($dismissed.profile)" }
}

function Copy-ProofAssets {
  param(
    [Parameter(Mandatory)][string] $CaseDir,
    [Parameter(Mandatory)][string] $Name
  )
  $assetDir = Join-Path $ProofRoot "$Name-assets"
  New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
  foreach ($item in @(
    '.reversa\state.json',
    '.reversa\plan.md',
    '.reversa\config.toml',
    '.reversa\context\surface.json',
    '.reversa\context\cs-agent\_meta.json',
    '.reversa\context\cs-agent\profile-info.json',
    '.reversa\context\cs-agent\graph-status.json',
    '.reversa\context\cs-agent\docs-categories.json',
    '_reversa_sdd\inventory.md',
    '_reversa_sdd\dependencies.md'
  )) {
    $src = Join-Path $CaseDir $item
    if (Test-Path -LiteralPath $src) {
      $dest = Join-Path $assetDir (($item -replace '^[._\\]+', '') -replace '[\\/:]+', '-')
      Copy-Item -LiteralPath $src -Destination $dest -Force
    }
  }

  $manifest = [pscustomobject]@{
    name = $Name
    case_dir = $CaseDir
    copied_at = (Get-Date).ToUniversalTime().ToString('o')
    assets = Get-ChildItem -LiteralPath $assetDir -File | ForEach-Object { $_.Name }
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ProofRoot "$Name-assets-manifest.json") -Encoding UTF8
}

function Invoke-ScenarioA {
  $case = New-ScenarioCase 'reversa-scenario-a'
  $transcript = Get-ProofFile -BaseName 'scenario-a-wezterm' -Kind 'install-transcript.md'
  Invoke-ScenarioInstaller -CaseDir $case -ScenarioName A -TranscriptPath $transcript
  Assert-InstalledPackageResolution -CaseDir $case

  if ($RunCodex) {
    Invoke-CodexRun -CaseDir $case -RunName A -TranscriptPath (Get-ProofFile -BaseName 'scenario-a-wezterm' -Kind 'codex-transcript.md')
  } else {
    Invoke-DirectSnapshot -CaseDir $case
  }

  Assert-EnabledScenario -CaseDir $case
  Copy-ProofAssets -CaseDir $case -Name (Get-ProofRunName -BaseName 'scenario-a-wezterm')
  if ($RemoveCases) {
    Remove-ScenarioCase -CaseDir $case
  } else {
    Write-Host "Scenario A case retained for review: $case"
  }
  return $case
}

function Invoke-ScenarioBAccept {
  $case = New-ScenarioCase 'reversa-scenario-b-accept'
  $transcript = Get-ProofFile -BaseName 'scenario-b-accept-wezterm' -Kind 'install-transcript.md'
  Invoke-ScenarioInstaller -CaseDir $case -ScenarioName B -TranscriptPath $transcript
  Assert-InstalledPackageResolution -CaseDir $case
  Assert-DisabledAfterInstall -CaseDir $case
  Clear-ScenarioBDismissal -CaseDir $case

  if ($RunCodex) {
    Invoke-CodexRun -CaseDir $case -RunName B-Accept -TranscriptPath (Get-ProofFile -BaseName 'scenario-b-accept-wezterm' -Kind 'codex-transcript.md')
  } else {
    Enable-ScenarioBConfig -CaseDir $case
    Invoke-DirectSnapshot -CaseDir $case
  }

  Assert-EnabledScenario -CaseDir $case
  Copy-ProofAssets -CaseDir $case -Name (Get-ProofRunName -BaseName 'scenario-b-accept-wezterm')
  if ($RemoveCases) {
    Remove-ScenarioCase -CaseDir $case
  } else {
    Write-Host "Scenario B accept case retained for review: $case"
  }
  return $case
}

function Invoke-ScenarioBDecline {
  $case = New-ScenarioCase 'reversa-scenario-b-decline'
  $transcript = Get-ProofFile -BaseName 'scenario-b-decline-wezterm' -Kind 'install-transcript.md'
  Invoke-ScenarioInstaller -CaseDir $case -ScenarioName B -TranscriptPath $transcript
  Assert-InstalledPackageResolution -CaseDir $case
  Assert-DisabledAfterInstall -CaseDir $case
  Clear-ScenarioBDismissal -CaseDir $case

  if ($RunCodex) {
    Invoke-CodexRun -CaseDir $case -RunName B-Decline -TranscriptPath (Get-ProofFile -BaseName 'scenario-b-decline-wezterm' -Kind 'codex-transcript.md')
  } else {
    Set-ScenarioBDismissed -CaseDir $case
  }

  Assert-DismissedScenario -CaseDir $case
  Copy-ProofAssets -CaseDir $case -Name (Get-ProofRunName -BaseName 'scenario-b-decline-wezterm')
  if ($RemoveCases) {
    Remove-ScenarioCase -CaseDir $case
  } else {
    Write-Host "Scenario B decline case retained for review: $case"
  }
  return $case
}

function Main {
  Assert-Command wezterm
  Assert-Command node
  Assert-Command npm
  Assert-Command npx
  Assert-Command git

  if (-not (Test-Path -LiteralPath $CsAgentExe)) {
    throw "cs-agent executable not found: $CsAgentExe"
  }

  New-Item -ItemType Directory -Path $ProofRoot -Force | Out-Null
  $env:npm_config_yes = 'true'

  $cases = @()
  if ($Scenario -in @('A', 'Both')) {
    $cases += Invoke-ScenarioA
  }
  if ($Scenario -in @('B', 'Both')) {
    $cases += Invoke-ScenarioBAccept
    if ($IncludeDecline) {
      $cases += Invoke-ScenarioBDecline
    }
  }

  $summary = [pscustomobject]@{
    ok = $true
    scenario = $Scenario
    run_codex = [bool]$RunCodex
    include_decline = [bool]$IncludeDecline
    remove_cases = [bool]$RemoveCases
    package_source = $PackageSource
    published_package = if ($PackageSource -eq 'Published') { $PublishedPackage } else { $null }
    proof_root = $ProofRoot
    cases = $cases
    completed_at = (Get-Date).ToUniversalTime().ToString('o')
  }
  $summaryPath = Get-SummaryPath
  $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
  Write-Host "Phase 1 WezTerm automation passed. Summary: $summaryPath"
}

Main
