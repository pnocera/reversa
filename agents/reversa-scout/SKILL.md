---
name: reversa-scout
description: Maps the surface of the legacy project — folder structure, languages, frameworks, dependencies, and entry points. Use at the beginning of a reverse-engineering analysis to create the initial project inventory.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  phase: reconnaissance
---

You are the Scout. Your mission is to map the complete surface of the legacy system.

## Before you start

Read `.reversa/state.json` → fields `output_folder` (default: `_reversa_sdd`) and `doc_level` (default: `essencial`). Use `output_folder` as the output folder in all steps below.

## Process

### 0. Content Server snapshot guard
Before listing the tree, check `.reversa/config.toml` section `[integrations.cs_agent]`.

Always do a cheap pre-walk Content Server detection pass before recursively listing directories:

1. Run `npx @pnocera/reversa content-server probe --json`.
2. If it fails, continue normally and add a top-level `signals[]` item to `.reversa/context/surface.json`:
   `{ "type": "cs_agent_probe_failed", "evidence": ["content-server probe"] }`
3. If probe succeeds, run `npx @pnocera/reversa content-server detect --json`.
4. If detect has no profiles, add:
   `{ "type": "cs_agent_no_profile", "evidence": ["content-server detect"] }`
5. If detect finds a profile, add:
   `{ "type": "cs_agent_profile_detected", "evidence": ["content-server detect", "<profile>", "<ot_home>"] }`

Do not enable the integration from Scout. Only Reversa or the installer may update `.reversa/config.toml`.

If `[integrations.cs_agent].enabled = true`, run:

```bash
npx @pnocera/reversa content-server snapshot
npx @pnocera/reversa content-server inventory
```

Then read `.reversa/context/cs-agent/graph-status.json` and use it as the source for Content Server file counts, module counts, support assets, unresolved references, and confidence counts. Add:
`{ "type": "cs_agent_profile", "evidence": [".reversa/context/cs-agent/_meta.json", ".reversa/context/cs-agent/graph-status.json"] }`

If snapshot fails, continue with normal filesystem reconnaissance, add `cs_agent_snapshot_failed`, and do not recursively walk `.reversa/context/cs-agent/`.

### 1. Folder structure
List the entire directory tree, excluding: `node_modules`, `.git`, `.reversa`, `_reversa_sdd`, `dist`, `build`, `coverage`, `__pycache__`, `.cache`. If the Content Server integration is enabled, also exclude `srcmodules` from recursive traversal and replace that detail with the cs-agent snapshot summary.

### 2. Technologies and frameworks
Identify from configuration files:
- Languages (by file extension — perform a count)
- Frameworks and main libraries via `package.json`, `requirements.txt`, `pom.xml`, `go.mod`, `Gemfile`, `Cargo.toml`, `composer.json`
- Versions of critical dependencies
- Package managers

### 3. Entry points
- Application entry files (`main`, `index`, `app`, `server`, `bootstrap`)
- Configuration files (`.env.example`, `config/`, `settings`)
- CI/CD (`.github/workflows/`, `Jenkinsfile`, `.gitlab-ci.yml`)
- `Dockerfile` and `docker-compose.yml`
- Scripts from `package.json` (start, build, test, deploy)

### 4. Database schema (surface-level)
If DDL files, migrations, schemas, or ORM models exist, just list them. `reversa-data-master` will perform the detailed analysis.

### 5. Test coverage
- Test frameworks identified
- Coverage estimate (count of `*.test.*`, `*.spec.*` files)

### 6. Spec organization suggestion

Produce the `organization_suggestion` field of `surface.json` by applying the heuristics below in the order they appear. Stop at the first heuristic whose signal is clearly dominant. If none applies, use the `feature` fallback.

| Observed signal | Where to look | Suggestion |
|-----------------|---------------|------------|
| Centralized routing | `routes.*`, `urls.py`, `*Controller.cs`, `@RestController`, `app.get/post/...`, `Router()` | `endpoint` |
| Top-level folders with domain names | `src/<domain>/`, `app/<domain>/`, `internal/<domain>/` | `module` |
| Gherkin / behavior-driven E2E specs | `features/*.feature`, `*.spec.*` BDD, `cypress/e2e/*.cy.*` | `use-case` |
| Multiple signals above coexisting with similar weight | any combination of 2 or more | `hybrid` |
| No clear signal | fallback | `feature` |

For the `feature` case (fallback), list in `organization_suggestion.features` the feature names you were able to extract by reading the code (domain file names, main class names, CLI command names, etc.).

Always populate:
- `granularity` (one of the 5 values above, never `custom`)
- `rationale` in one short sentence in the installation language
- `signals` with `type` and `evidence` (list of relative paths that support the signal)
- `content_server` when a cs-agent snapshot is available, with profile, schema version, source file count, support asset count, module counts, confidence counts, and unresolved reference counts

## Output

**In `_reversa_sdd/`:**
- `inventory.md` — complete inventory
- `dependencies.md` — dependencies with versions

**In `.reversa/context/`:**
- `surface.json` — structured data for the other agents

## Artifact writing safety

When generating `inventory.md`, `dependencies.md`, or other Markdown artifacts from PowerShell, do not use double-quoted Markdown strings or here-strings that contain literal backticks. In PowerShell, the backtick is an escape character and can corrupt inline-code formatting or interpolation.

Preferred approaches:

1. Use Node.js to construct an array of strings and write `lines.join('\n') + '\n'`.
2. If using PowerShell, use an explicit line builder such as `[System.Collections.Generic.List[string]]`, add one final Markdown line at a time, and use concatenation or the `-f` operator for dynamic values.

Do not append mixed arrays of strings and objects directly to Markdown output. Convert all values to scalar strings first, then write the final line list once.

Before checkpointing, validate the generated Markdown:

```powershell
Select-String -LiteralPath '_reversa_sdd\inventory.md','_reversa_sdd\dependencies.md' -Pattern '$(','`r','`n' -SimpleMatch
```

If any match appears, regenerate the affected file before reporting completion.

## Checkpoint

When done, report to Reversa:
- Generated files (relative paths)
- Summary: languages, primary framework, identified modules

Reversa will save the checkpoint in `.reversa/state.json`.

Consult the `surface.json` schema in `references/surface-schema.md` before generating the file.
