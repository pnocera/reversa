# Findings — What cs-agent is and what it gives Reversa

> Source: `F:\smoke\CS253\README.md`, `F:\smoke\CS253\SKILL.md`, live calls to `cs-agent.exe profile info --json`, `graph status --json`, `help --json` on the initialized `CS253` profile (ot_home `E:\CS253`, workdir `E:\CS253_workdir`).

## 1. What cs-agent is

`cs-agent.exe` is a Windows single-binary CLI **and** MCP server for working on OpenText Content Server OScript / CSUI / Java code. It bundles:

- An **OScript parser** + indexer (`oscript`, `embedded`, `html`, `ini`, `properties` lifecycles)
- A **graph index** (`graph.sqlite`) — symbol-and-edge knowledge graph of the entire CS source tree
- A **code index** (`code.sqlite`) — tree-sitter-backed CSUI JavaScript/TypeScript and Java intelligence
- A **cross-reference index** (`xref.sqlite`) — deterministic + heuristic links between code and SDK docs
- A **CSDoc corpus** + optional **csui-doc**, **csui-sdk**, **csui-style-kit**, **csui-generator** assets
- A **Vineflower** Java decompiler for `E:\CS253\ojlib` jars
- An **OUnit live test probe** that talks to an Eclipse-owned VM over HTTP on `127.0.0.1:19777`
- An **OBuild** invocation harness with diagnostics
- A **dev workflow** for agent-owned module edits that stops at a user handoff (agent never deploys)
- A **CSUI workflow** that stages Grunt builds and never runs Grunt itself

The CLI exposes **113 commands** across 18 topics. JSON output is the contract (`--json` → one envelope on stdout). MCP is the same binary: `cs-agent.exe mcp serve`.

## 2. CS253 profile is real and indexed

`cs-agent init` already ran. From `profile info --json`:

| Asset | Path |
|---|---|
| `ot_home` | `E:\CS253` |
| Workdir | `E:\CS253_workdir` |
| OBuild | `1.9.0` at `tools/obuild/OBuild/obuild.cmd` |
| Eclipse plugin | `26.1.0.202512161839` |
| CSDoc | `26.1.0` |
| csui-doc / csui-sdk / csui-style-kit / csui-generator | `26.1.0` (all installed) |
| Vineflower | `1.12.0` |
| Java roots | `E:\CS253\ojlib` |
| Source dir (extracted) | `E:\CS253_workdir\srcmodules` |
| Build out | `E:\CS253_workdir\out\build` |
| graph DB | `E:\CS253_workdir\out\graph\graph.sqlite` |
| code DB | `E:\CS253_workdir\out\graph\code.sqlite` |
| xref DB | `E:\CS253_workdir\out\sdk_docs\xref.sqlite` |
| OUnit adapter | `http://127.0.0.1:19777` with token file |

All 15 `path_checks` are `exists: true`. The environment is ready for Reversa to call against it.

## 3. CSGraph scale (CS253 OOTB)

From `graph status --json`:

- **58,398 files** (34,171 source + 24,227 support assets)
- **940,729 nodes**
- **2,251,241 edges**
- **148 modules** tracked
- 82 files with extraction errors (visible — useful for confidence marking)

### Node kinds

| kind | count |
|---|---|
| variable | 463,751 |
| parameter | 163,688 |
| feature | 111,165 |
| function | 77,319 |
| file | 34,171 |
| object | 29,033 |
| asset | 24,227 |
| weblingo_directive | 14,114 |
| script | 13,121 |
| template | 4,483 |
| route | 4,471 |
| ospace | 293 |
| module | 148 |
| oscript_block | 711 |
| type | 12 |
| xlate_key | 19 |
| intrinsic | 3 |

### Edge kinds

| kind | count |
|---|---|
| contains | 976,030 |
| type_of | 778,875 |
| calls | 315,123 |
| overrides | 128,647 |
| inherits | 29,681 |
| references | 11,768 |
| renders_template | 4,728 |
| dispatches_to | 4,488 |
| depends_on | 1,190 |
| executes_script | 711 |

### Per-edge confidence (already labeled — maps 1:1 to Reversa)

| label | count | Reversa equivalent |
|---|---|---|
| `resolved` | 2,058,117 | 🟢 CONFIRMED |
| `intrinsic` | 65,944 | 🟢 CONFIRMED (built-in/seeded) |
| `multi_candidate` | 109,483 | 🟡 INFERRED (ambiguous, multiple candidates) |
| `inferred` | 17,697 | 🟡 INFERRED |

### Unresolved references (= 🔴 GAPs surfacable to the user)

| kind | count |
|---|---|
| feature_call | 480,631 |
| uses_xlate | 143,876 |
| type | 55,740 |
| ambiguous_call | 22,148 |
| template | 8,675 |
| depends_on | 557 |
| asset | 40 |
| inherits | 2 |

This is **already a Reversa-shaped dataset**: typed nodes, typed edges, per-edge confidence, an explicit unresolved bucket. The current Archaeologist/Detective/Architect pipeline would spend enormous effort rebuilding (worse) what CSGraph already has resolved.

## 4. Command surface relevant to Reversa

Output of `cs-agent help --json` gives 113 commands. The subset Reversa cares about:

### Read-only, safe to call automatically

| Command | What Reversa would use it for |
|---|---|
| `profile info --json` | Detect that a CS profile exists; locate workdir, DBs, ot_home |
| `graph status --json` | Establish baseline scale (matches inventory.md) |
| `graph search --json` | Symbol lookup by name/kind |
| `graph module <name> --json` | Module-level summary (replaces Scout's per-module walk for CS modules) |
| `graph subclasses <type> --json` | Inheritance hierarchy |
| `graph extension-points --json` | Where the system is designed to be extended |
| `graph kinds --json` | Enumerate node kinds present in this profile |
| `graph callers <symbol> --json` | Reverse call graph for blast-radius analysis |
| `docs search --json` | Search CSDoc + csui-doc by keyword |
| `docs concept --json` | Pull a canonical concept doc |
| `docs cross-ref --json` | Bridge code symbol ↔ SDK doc (deterministic `amd_module`/`rest_route` separated from heuristic `name` matches) |
| `code status --json` | Code intel state (tree-sitter grammar availability) |
| `code search/node/explore --json` | CSUI JS / Java symbol intelligence |
| `code java jars --json` | Enumerate `E:\CS253\ojlib` jars |
| `lint source --json` | Static checks for unbuilt source |
| `test probe --json` | Confirm OUnit adapter is alive (does not run tests) |
| `runs --json` | List recent recorded runs |
| `profile info` | Trust anchor for which CS instance is active |

### Write / side-effect — only on explicit user request

| Command | Effect | Reversa rule |
|---|---|---|
| `init` / `init refresh` | 20–45 min indexing | **Never call autonomously** (per SKILL.md). If profile missing, instruct user. |
| `dev checkout/new/status/build/handoff` | Stage agent-owned module edits | Bridge for `/reversa-coding` when target is a CS module. Always stops at handoff. |
| `csui new/status/preview/build/handoff/confirm-deployed` | Stage CSUI extension edits | Bridge for `/reversa-coding` when target is a CSUI extension. |
| `csui style new/build/remove/confirm-deployed` | Style overrides | Same as above. |
| `module new` | New module skeleton | Bridge for `/reversa-new` greenfield in CS context. |
| `edit` | Dry-run subclass override stub | Useful for `/reversa-forward` modification proposals. |
| `xlate` | Add translation keys | Touched only via Coding. |
| `build run` / `build diagnostics` | Run OBuild / surface errors | Used by `/reversa-coding` validation step. |
| `csdoc install/rebuild` / `csui install` | Refresh SDK assets | User-initiated only. |
| `code index csui/java` | Refresh code intel | User-initiated only. |
| `code java decompile` | Vineflower jar decompile | Default one jar at a time (per SKILL.md); raise `--concurrency` only on explicit ask. |
| `source export` | Re-extract OLL → CSIDE source files | User-initiated. |

## 5. Constraints carried over from cs-agent's own contract

These are non-negotiable rules cs-agent itself enforces; Reversa must mirror them:

1. **The agent never deploys.** All `build` and `csui build` paths end at a handoff bundle; the user copies into `E:\CS253\module` and reruns graph refresh.
2. **`init` is human-only.** Reversa must instruct the user to run it; never auto-run.
3. **`--json` is mandatory** for any programmatic use.
4. **Don't bake schemas** — ask `--help` first when a command's shape matters. The full command tree is queryable as `cs-agent help --json` (113 entries, all with args/flags/failureCodes).
5. **Inline help is the source of truth.** `SKILL.md` and `README.md` intentionally do not list flag tables.
6. **OUnit live tests** require the Eclipse VM running on the loopback port; Reversa should not assume it's up.
7. **Profile resolution** — normal commands resolve the active profile from the user init registry. `--profile <name>` overrides without changing the active one. Reversa should default to `--profile CS253` when generating spec runs against this codebase.
8. **Vineflower decompile is heavy.** One jar at a time unless the user opts into more.

## 6. The big asymmetry

Right now Reversa Discovery would do generic reverse-engineering on the `E:\CS253\srcmodules` tree: file walks, regex pattern guesses, partial AST parses, manual cross-referencing. Outcome would be a thin, lossy spec for a domain it does not understand (OScript, OSpace, weblingo, features, dispatches).

cs-agent has already solved the structural problem with domain-correct parsers, edge labels, and per-edge confidence — for **940k nodes** and **2.25M edges**. The right move is to **delegate to cs-agent** and have Reversa do what only Reversa can do: orchestrate the discovery pipeline, write narrative specs, propose forward features, manage state across sessions, and run the cross-team handoffs.
