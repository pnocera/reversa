---
schemaVersion: 1
generatedAt: <ISO-8601>
reversa:
  version: "x.y.z"
kind: screen_modernization_decision
producedBy: screen-translator
decidedBy: <human-id or null when mode=skipped>
decidedAt: <ISO-8601 or null when mode=skipped>
mode: literal | modernized | hybrid | skipped
sourcePlatform: <slug or null when mode=skipped>
targetPlatform: <slug or null when mode=skipped>
hash: "sha256:<hash of the body below the front-matter>"
---

> When `mode: skipped`, this decision **did not go through a human**: it was emitted automatically by the Screen Translator because the legacy has no UI. Only the "Context" and "Decision" sections are filled in, with the reason for omission; the others remain as N/A. The Inspector reads `mode: skipped` in the front-matter and skips visual parity without asking.


# Screen Modernization Decision

> Conscious decision on how to translate the legacy system's screens: observable byte-by-byte parity, idiomatic redesign for the target platform, or screen-by-screen combination.
> This artifact is mandatory reading for the Screen Translator itself (to generate `target_screens.md`), for the Inspector (to build parity tests appropriate to the mode), and for the coding agent.

## Context

- **Detected source platform**: <slug> (e.g.: `cobol-ansi-tui`, `delphi-vcl`, `asp-classic`, `android-xml`)
- **Confidence**: 🟢 CONFIRMED | 🟡 INFERRED | 🔴 GAP | ⚠️ AMBIGUOUS
- **Target platform**: <slug> (e.g.: `go-cli`, `web-spa`, `flutter`, `tauri`)
- **Screens inventoried**: <N>
- **Inventory origin**: `_reversa_sdd/screens/inventory.json` + `_reversa_sdd/ui/inventory.md`
- **Applied adapter**: `<adapters/origin__target>` (see `references/adapter-pairs.md`)

## Evaluated modes

### Mode: literal
- **Definition**: observable byte-by-byte or pixel-equivalent parity between legacy and new.
- **Trade-offs**:
  - Implementation cost: <high | medium | low>
  - Visual fidelity: <high | medium | low>
  - Viability of constructive parity tests: <yes | partial | no>
  - Expected end-user acceptance: <high | medium | low>
  - Future technical debt: <high | medium | low>
- **Recommended**: <yes | no>
- **Justification**: <short text>

### Mode: modernized
- **Definition**: idiomatic redesign for the target platform, preserving information and flow, but re-expressing hierarchy and interaction.
- **Trade-offs**:
  - Implementation cost: <high | medium | low>
  - Visual fidelity: <high | medium | low>
  - Viability of constructive parity tests: <yes | partial | no>
  - Expected end-user acceptance: <high | medium | low>
  - Future technical debt: <high | medium | low>
- **Recommended**: <yes | no>
- **Justification**: <short text>

### Mode: hybrid
- **Definition**: part of the screens in literal, part in modernized, with explicit lists.
- **Trade-offs**:
  - Implementation cost: <high | medium | low>
  - Mixed visual fidelity: <description>
  - Viability of parity tests: <description per subset>
  - Cost of maintaining the separation: <high | medium | low>
- **Recommended**: <yes | no>
- **Justification**: <short text>

## Decision

- **Chosen mode**: <literal | modernized | hybrid>
- **Human's justification**: <text>
- **Discarded alternatives**: <brief list with reason>
- **Decided at**: <ISO-8601>
- **Decided by**: <name or identifier>

### In hybrid mode, explicit lists (mandatory)

**Screens in literal mode**:
- <screen 1>
- <screen 2>

**Screens in modernized mode**:
- <screen 3>
- <screen 4>

> Empty lists block Phase 2. The agent refuses to proceed.

## Pending implications for Phase 2

| Step | Implication | How to honor |
|---|---|---|
| Generation of `target_screens.md` | <implication> | <expected action> |
| Golden file capture | <implication> | <expected action> |
| Design-system tokens | <implication> | <expected action> |
| Textual content | Preserve literally unless explicit approval of linguistic review | <expected action> |

## Implications for the Inspector

- **Parity strategy**:
  - Literal mode → observable byte-by-byte / pixel-equivalent parity, validated by golden files when the oracle runs.
  - Modernized mode → semantic contract (events, transitions, textual content, states), without byte-by-byte visual comparison.
  - Hybrid mode → mixed strategy, declared per screen in `parity_specs.md`.
- **Known deviations to propagate**: see `screen_deviation_log.md`.

## Notes

<Additional points that the coder, the Inspector, and the agent need to know to honor the decision. Includes, for example, explicit approval of linguistic review, tolerance for approximate rendering, or marking of screens that do not admit modernization due to regulatory requirements.>
