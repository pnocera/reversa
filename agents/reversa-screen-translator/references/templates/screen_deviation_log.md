---
schemaVersion: 1
generatedAt: <ISO-8601>
reversa:
  version: "x.y.z"
kind: screen_deviation_log
producedBy: screen-translator
mode: append-only
hash: "sha256:<hash of the body below the front-matter>"
---

# Screen Deviation Log

> Record of every divergence between the legacy and the spec generated in `target_screens.md`. Append-only. Pending deviations block the handoff to the Inspector.
> Approved deviations are propagated to `parity_specs.md § Exceptions` when the Inspector runs.

## Conventions

- **ID**: `DEV-NNN` (sequential, three digits).
- **Type**:
  - `technical`: technical limitation of the target (e.g.: Windows terminal without UTF-8 without `chcp 65201`).
  - `modernization`: intentional divergence resulting from modernized mode.
  - `platform`: divergence forced by platform incompatibility (e.g.: Win16 → web).
  - `correction`: visual bug in the legacy that the target corrects (e.g.: typo in label).
- **Approval**: `pending` | `approved` | `rejected`.
- `approved` deviation → also listed in `parity_specs.md § Exceptions`.
- `pending` deviation → blocks handoff to the Inspector.
- `rejected` deviation → archived with explicit note; agent regenerates the screen in a conformant mode.

## Summary

- **Total**: <N>
- **Pending**: <N>
- **Approved**: <N>
- **Rejected**: <N>

## Entries

### DEV-001

| Field | Value |
|---|---|
| Affected screen | <canonical-name> |
| Type | `technical` \| `modernization` \| `platform` \| `correction` |
| Description | <what diverges between legacy and new> |
| Reason | <why the divergence is necessary or acceptable> |
| Origin in the legacy | <file:line> |
| Implication for parity tests | <e.g.: byte-by-byte comparison fails, use semantic comparison> |
| Approval | `pending` \| `approved` \| `rejected` |
| Approved by | <name or identifier, when approved> |
| Approved at | <ISO-8601, when approved> |
| Propagates to `parity_specs.md § Exceptions` | yes \| no |

### DEV-002

(repeat the block above for each deviation)

## Screens with more than one deviation

| Screen | IDs |
|---|---|
| <screen X> | DEV-001, DEV-007 |

## Notes

<General observations about the deviation set: patterns, lessons learned that apply to future migrations on the same origin→target pair, suggestions for an improved adapter in v2.>
