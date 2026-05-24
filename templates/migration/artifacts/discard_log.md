---
schemaVersion: 1
generatedAt: <ISO-8601>
reversa:
  version: "x.y.z"
kind: discard_log
producedBy: curator
hash: "sha256:<hash of the body below the front-matter>"
---

# Discard Log

> Complete record of what was discarded from the migration and why. Each item has traceability to its origin in the legacy.

## Discarded items

### BR-DESCARTAR-001
- **Origin**: `_reversa_sdd/<unit>/{requirements,design}.md` § <section>
- **Description**: <rule or behavior discarded>
- **Justification**: <text>
- **Paradigm-linked**: yes | no
  - If yes: <which paradigm and how the target paradigm absorbs the use case>
- **Replacement in the new system**: <none | replaced by X>
- **Risk of discarding**: low | medium | high, with explanatory note

<repeat per item>

## Items discarded due to paradigm change (dedicated subsection)

> Lists only items whose `Paradigm-linked = yes`. Explicit audit for the coding agent.

| ID | Origin | Legacy paradigm | Substitute in target paradigm |
|---|---|---|---|
| BR-DESCARTAR-XXX | <ref> | <e.g.: synchronous pessimistic lock> | <e.g.: idempotency via event ID> |

## Notes
<Final observations from the Curator about the discarded set.>
