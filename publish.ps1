<#
.SYNOPSIS
Commits pending changes, bumps the npm package version, creates the git tag, and publishes to npm.

.EXAMPLE
.\publish.ps1

Commits all pending changes, bumps the patch version, tags it, and publishes with the latest npm dist-tag.

.EXAMPLE
.\publish.ps1 -Version minor -Push

Bumps the minor version, publishes, then pushes commits and tags to the configured git remote.

.EXAMPLE
.\publish.ps1 -Version 1.3.0 -Tag beta

Publishes an exact version with the beta npm dist-tag.
#>

param(
    [string]$Version = "patch",
    [string]$PendingCommitMessage = "chore: prepare release",
    [string]$ReleaseCommitMessage = "chore(release): %s",
    [string]$Tag = "latest",
    [switch]$Push
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [string[]]$Arguments = @()
    )

    Write-Host ">> $FilePath $($Arguments -join ' ')"
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

function Get-GitStatus {
    $status = @(& git status --porcelain)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read git status."
    }
    return @($status | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

if (-not (Test-Path -LiteralPath "package.json")) {
    throw "package.json was not found. Run this script from the repository root."
}

Invoke-Checked "git" @("rev-parse", "--show-toplevel") | Out-Null

$packageName = node -p "require('./package.json').name"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($packageName)) {
    throw "Unable to read package name from package.json."
}

Write-Host "Checking npm authentication..."
$npmUser = npm whoami
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($npmUser)) {
    throw "npm authentication check failed. Run npm login and try again."
}
Write-Host "npm user: $npmUser"

$pending = Get-GitStatus
if ($pending.Count -gt 0) {
    Write-Host "Committing $($pending.Count) pending git change(s)..."
    Invoke-Checked "git" @("add", "-A")
    Invoke-Checked "git" @("commit", "-m", $PendingCommitMessage)
} else {
    Write-Host "No pending git changes to commit."
}

Write-Host "Bumping $packageName version with npm version $Version..."
Invoke-Checked "npm" @("version", $Version, "-m", $ReleaseCommitMessage)

$newVersion = node -p "require('./package.json').version"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($newVersion)) {
    throw "Unable to read bumped version from package.json."
}

Write-Host "Publishing $packageName@$newVersion to npm with tag '$Tag'..."
Invoke-Checked "npm" @("publish", "--tag", $Tag, "--access", "public")

if ($Push) {
    Write-Host "Pushing commits and tags..."
    Invoke-Checked "git" @("push")
    Invoke-Checked "git" @("push", "--tags")
} else {
    Write-Host "Skipping git push. Re-run with -Push to push commits and tags."
}

Write-Host "Published $packageName@$newVersion."
