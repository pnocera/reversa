Both changes verified:

1. **`agents/reversa-scout/SKILL.md`** — Section 0 (lines 21-46) now only runs probe/detect/snapshot; the `content-server inventory --write` call is now at line 106 in the `## Output` section, gated on `[integrations.cs_agent].enabled = true` and `snapshot succeeded`, and explicitly documented to run *after* the standard `inventory.md` is written. This matches the plan: "After standard `inventory.md` is written, shell `reversa content-server inventory --write`."

2. **`templates/config.toml:42`** — Comment `# Empty means use the configured specs output folder inventory.md.` is in place directly above `inventory_path = ""`.

No regressions to other Phase 4 items: scout signals, srcdir-only skip, default-off `[integrations.cs_agent]` block placement, executable override comment in `config.user.toml`, schemas, README/CLI docs — all unchanged. Single `inventory --write` invocation, no duplicates.

PHASE 4 APPROVED

Both optional notes from the prior review are now resolved. The scout ordering matches the plan literally, and the `inventory_path` default behavior is documented inline in the template.
