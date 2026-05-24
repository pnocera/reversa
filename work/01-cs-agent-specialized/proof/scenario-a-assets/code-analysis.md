# Code Analysis - Archaeologist

Generated: 2026-05-24T20:25:42Z

## Evidence boundary

🟢 CONFIRMED - This Archaeologist pass used only `.reversa/context/surface.json`, `.reversa/context/cs-agent/*.json`, and generated Reversa artifacts.
🔴 GAP - Direct graph database reads and source tree traversal are outside the current Archaeologist rule. Module-level internals that are not present in the snapshot JSON are therefore recorded as gaps.

Excluded evidence: `E:\CS253_workdir\out\graph\graph.sqlite` and `E:\CS253_workdir\srcmodules`.

## Snapshot-level system facts

- 🟢 CONFIRMED Profile: CS253
- 🟢 CONFIRMED Primary language: OScript
- 🟢 CONFIRMED Modules identified: 148
- 🟢 CONFIRMED Source files indexed by cs-agent: 34171
- 🟢 CONFIRMED Support assets indexed by cs-agent: 24227
- 🟢 CONFIRMED Graph nodes: 940729
- 🟢 CONFIRMED Graph edges: 2251241
- 🟢 CONFIRMED Extraction error files: 82

## Modules analyzed

| Module | Snapshot support assets | Control flow | Algorithms | Data structures | Business rules |
|---|---:|---|---|---|---|
| `__platform__` | 357 | 🔴 GAP | 🔴 GAP | 🔴 GAP | 🔴 GAP |
| `activeview` | 21 | 🔴 GAP | 🔴 GAP | 🔴 GAP | 🔴 GAP |
| `adminhelp` | 175 | 🔴 GAP | 🔴 GAP | 🔴 GAP | 🔴 GAP |
| `answerdesk` | 54 | 🔴 GAP | 🔴 GAP | 🔴 GAP | 🔴 GAP |
| `appearances` | 27 | 🔴 GAP | 🔴 GAP | 🔴 GAP | 🔴 GAP |
| `barcode` | 2 | 🔴 GAP | 🔴 GAP | 🔴 GAP | 🔴 GAP |

## Data summary

The `essencial` documentation level embeds the data summary here instead of generating a separate data dictionary.

- 🟢 CONFIRMED: snapshot JSON exposes global node/edge counts, global unresolved reference counts, and support asset counts by module.
- 🔴 GAP: module-level entities, fields, required status, defaults, function signatures, business rules, route mappings, and per-module dependencies are not exposed through the allowed snapshot JSON files.

## Pending modules

142 modules remain pending after this checkpoint. They must be analyzed under the same evidence boundary unless a future snapshot exposes more module-level detail through .reversa/context/cs-agent/*.json.
