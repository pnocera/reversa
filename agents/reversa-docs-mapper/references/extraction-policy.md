# Data Extraction Policy (Mapper)

Defines when to invoke extraction scripts versus reusing cache from `.reversa/documentation/assets/data/`.

## Cache hit (reuse)

Use the existing JSON when **all** of the following conditions are true:

1. The file exists at `.reversa/documentation/assets/data/<name>.json`.
2. The JSON's `mtime` is greater than the maximum `mtime` among all relevant source files:
   - For `modules.json`: the highest `mtime` within the source code (excluding `.reversa/`, `_reversa_sdd/`, `node_modules/`, `.git/`).
   - For `deps.json`: the highest `mtime` of the source code AND of `modules.json`.
3. The JSON's `schemaVersion` is compatible with the current version (1).

## Cache miss (regenerate)

In any other case, invoke the corresponding Python script:

```bash
python templates/documentation/scripts/extract_modules.py \
    --root . \
    --out .reversa/documentation/assets/data/modules.json

python templates/documentation/scripts/extract_deps.py \
    --modules .reversa/documentation/assets/data/modules.json \
    --out .reversa/documentation/assets/data/deps.json
```

## Python unavailable

Perform inline extraction in the AI engine:

1. Use Glob to list files by extension (`*.py`, `*.js`, `*.ts`, `*.go`, `*.java`).
2. Use Read to count non-empty lines in each file.
3. Build a structure identical to the `modules.json` schema (see `specs/reversa-docs/design.md`).
4. For `deps.json`, in the absence of an AST parser, start with `nodes` populated and `edges: []`. Mark in `.config.json.pagesPlanned` that dependencies were not extracted.

## Force regeneration

If the user passes `--force-extract` to `/reversa-docs-mapper`, ignore the cache and regenerate. Back up the previous JSON to `.backup-<timestamp>/assets/data/`.

## When the Analyst invokes in isolation

If the `Analyst` runs before the Mapper or in isolated mode and does not find `modules.json`/`deps.json`, it must invoke the **same scripts** following this same policy. The result is shared: a subsequent Mapper run will use the cache.
