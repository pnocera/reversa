# Schema — .reversa/state.json

This file persists the complete analysis state between sessions. Reversa reads and writes this file.

## Complete structure

```json
{
  "version": "1.0.0",
  "project": "project-name",
  "user_name": "User Name",
  "chat_language": "pt-br",
  "doc_language": "Português",
  "answer_mode": "chat",
  "doc_level": null,
  "output_folder": "_reversa_sdd",
  "cs_agent_enablement_dismissed": {
    "profile": "CS253",
    "ot_home": "E:\\CS253",
    "executable_path": "F:\\smoke\\CS253\\cs-agent.exe",
    "help_sha256": "6868bbbc1b965abde49e7c2cbc4006362e1d41e940cc8fc22f793c66ff1fcb6e",
    "dismissed_at": "2026-05-24T10:00:00Z"
  },
  "phase": "reconnaissance",
  "completed": ["reconnaissance"],
  "pending": ["excavation", "interpretation", "generation", "review"],
  "engines": ["claude-code"],
  "agents": ["reversa", "reversa-scout", "reversa-archaeologist"],
  "checkpoints": {
    "scout": {
      "completed_at": "2026-04-26T10:00:00Z",
      "files": [
        "_reversa_sdd/inventory.md",
        "_reversa_sdd/dependencies.md",
        ".reversa/context/surface.json"
      ]
    },
    "archaeologist": {
      "completed_at": "2026-04-26T11:00:00Z",
      "modules_analyzed": ["auth", "orders", "payments"],
      "files": [
        "_reversa_sdd/code-analysis.md",
        "_reversa_sdd/data-dictionary.md",
        ".reversa/context/modules.json"
      ]
    }
  },
  "created_files": [
    "CLAUDE.md",
    ".agents/skills/reversa/SKILL.md",
    ".reversa/state.json",
    ".reversa/plan.md"
  ]
}
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Installed Reversa version |
| `project` | string | Legacy project name |
| `user_name` | string | User name (for interactions) |
| `chat_language` | string | Interaction language (e.g. pt-br, en-us) |
| `doc_language` | string | Language of generated specs (e.g. Português, English) |
| `answer_mode` | string | How the user responds to gaps: `chat` or `file` |
| `doc_level` | string \| null | Volume of generated documentation: `essencial`, `completo`, or `detalhado`. Starts as `null` — must be filled via user choice after the Scout. |
| `output_folder` | string | Specs output folder (default: `_reversa_sdd`) |
| `cs_agent_enablement_dismissed` | object \| null | Fingerprint of the Content Server/cs-agent detection the user dismissed. `null` means not dismissed. If the detected profile, `ot_home`, executable path, or help SHA changes, Reversa may ask again. |
| `phase` | string \| null | Current phase. `null` = not started |
| `completed` | string[] | Completed phases |
| `pending` | string[] | Pending phases |
| `checkpoints` | object | Completion record for each agent |
| `engines` | string[] | Configured engines (e.g. `["claude-code", "codex"]`) |
| `agents` | string[] | Installed agents |
| `created_files` | string[] | All files created by Reversa (for safe uninstall) |

## Valid phases

`reconnaissance` → `excavation` → `interpretation` → `generation` → `review`

## Writing rule

Never remove existing fields. Only add or update.

## Where NOT to write

The specs organization decision (granularity, custom folders, original Scout suggestion, choice timestamp) does **not** go in `state.json`. It is persisted in `.reversa/config.toml`, section `[specs]`, as described in `references/step-03-specs-organization.md`. The `state.json` is runtime state; `config.toml` is a long-term decision.
