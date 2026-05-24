# Reference — cs-agent command tree (snapshot)

Captured via `F:\smoke\CS253\cs-agent.exe help --json` on 2026-05-24.

- Total commands: **113**
- Schema is documented inline via `cs-agent <topic> <command> --help` and the structured `help --json` envelope.
- Full JSON saved to `C:\Users\Pierre\.claude\projects\F--smoke-reversa-reversa\e1b4843c-daed-408c-8848-ab45fe1dbf61\tool-results\bpwmfwkok.txt` during the investigation session. Re-run `cs-agent help --json` to refresh — the harness validator is a side build, not bundled.

## Topics

| Topic | Purpose |
|---|---|
| `init` | Create a cs-agent workdir for one Content Server instance (human-only). |
| `build` | Run OBuild for the active profile source tree or one target OSpace. |
| `code` | Java decompiler install + Java/CSUI code intel (status, index, search, node, explore, java jars/decompile). |
| `csdoc` | Install a CSDoc zip and rebuild the CSDoc corpus. |
| `csui` | Install optional CSUI SDK + agent-owned CSUI extension workflow. |
| `dev` | Agent-owned OScript module dev workflow (checkout, new, status, build, handoff). |
| `docs` | Categories / search / concept / cross-ref over CSDoc + csui-doc + xref. |
| `edit` | Dry-run override stub for a target feature in a subclass. |
| `graph` | CSGraph index status + structural queries (search, module, subclasses, extension-points, kinds, callers). |
| `lint` | Static source checks before OBuild. |
| `mcp` | Serve cs-agent tools over MCP stdio. |
| `module` | Create a new source module from a template skeleton. |
| `profile` | Show the active profile, registry, and path checks. |
| `runs` | List recent recorded run directories. |
| `source` | Export CSIDE-style source files from an OLL SQLite file. |
| `test` | Probe the configured Eclipse-side OUnit adapter without launching CS. |
| `xlate` | Add a translation key to module properties files idempotently. |

## Global flags

- `--json` — write exactly one JSON envelope to stdout.
- `--profile <name>` — run against a profile without changing active-profile.
- `--help` — show help.

## Conventions Reversa must honor

- `init` and `init refresh` are **human-only**.
- **All builds end at a handoff**; agent never copies into `E:\CS253\module`.
- Inline `--help` is the source of truth — Reversa code wraps the JSON envelope but never re-declares flags.
- Failure modes are enumerated per command in the `failureCodes` array of `help --json` (e.g. `BAD_ARG`, `PROFILE_NOT_FOUND`, `AGENT_HOME_UNRESOLVED`, `HANDOFF_REQUIRED`, `OTHER`).
