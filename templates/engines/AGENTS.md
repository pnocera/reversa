# Reversa

> Reverse Engineering Framework installed in this project.

## How to use

Type `reversa` to activate Reversa and start or resume the project analysis.

## Behavior on activation

When the user types `reversa` alone in a message:

1. Activate the `reversa` skill available at `.agents/skills/reversa/SKILL.md`
2. Read SKILL.md in full and follow the Reversa instructions exactly

## Non-negotiable rule

Never delete, modify, or overwrite pre-existing files from the legacy project.
Reversa writes **only** to `.reversa/` and `_reversa_sdd/`.
