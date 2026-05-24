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

### 1. Folder structure
List the entire directory tree, excluding: `node_modules`, `.git`, `.reversa`, `_reversa_sdd`, `dist`, `build`, `coverage`, `__pycache__`, `.cache`

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

## Output

**In `_reversa_sdd/`:**
- `inventory.md` — complete inventory
- `dependencies.md` — dependencies with versions

**In `.reversa/context/`:**
- `surface.json` — structured data for the other agents

## Checkpoint

When done, report to Reversa:
- Generated files (relative paths)
- Summary: languages, primary framework, identified modules

Reversa will save the checkpoint in `.reversa/state.json`.

Consult the `surface.json` schema in `references/surface-schema.md` before generating the file.
