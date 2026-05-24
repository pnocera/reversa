---
schemaVersion: 1
generatedAt: <ISO-8601>
reversa:
  version: "x.y.z"
kind: topology_decision
producedBy: designer
hash: "sha256:<hash of the body below the front-matter>"
---

# Topology Decision

> Conscious decision on how to organize the new system: preserve the legacy topology, adopt a modern topology, or apply a hybrid.
> This artifact is mandatory reading for the Designer itself (to decompose bounded contexts) and for the coding agent (to create the folder tree).

## Detected legacy topology
- **Organizational pattern**: <package-by-layer | package-by-feature | feature-sliced | domain modules | DDD with bounded contexts | monorepo | monolith without clear boundaries | hybrid: ...>
- **Confidence**: 🟢 CONFIRMED | 🟡 INFERRED | 🔴 GAP | ⚠️ AMBIGUOUS
- **Evidence**:
  - <evidence 1, with reference to a `_reversa_sdd/` artifact (architecture.md, inventory.md, dependencies.md)>
  - <evidence 2>
- **Legacy tree map** (summarized):
  ```
  <short tree with main folders/modules>
  ```

## Structural diagnosis
- **Coupling**: <high | medium | low, with evidence>
- **Cohesion per module**: <high | medium | low, with evidence>
- **Orphan / dead modules**: <list, or "none">
- **Redundant layers**: <list, or "none">
- **Boundary violations**: <list, or "none">
- **Paradigm/style mixing**: <description, or "homogeneous">
- **Overall assessment**: <healthy | problematic | partially problematic>

## Proposed modern topology
- **Pattern**: <hexagonal | vertical slices | feature-sliced | DDD with bounded contexts | package-by-feature | capability modularization | monorepo with pnpm/turborepo | ...>
- **Justification**: <why this pattern fits the target stack, the domain, the team size, and the chosen migration strategy>
- **Expected concrete gains**:
  - <gain 1: e.g. isolated testability per feature>
  - <gain 2: e.g. independent deployment per bounded context>
  - <gain 3: e.g. faster onboarding>
- **Cost / risk**:
  - <cost 1: e.g. team learning curve>
  - <cost 2: e.g. reorganization effort>
- **Proposed tree outline**:
  ```
  <short tree with folders/modules in the modern pattern>
  ```

## Options presented to the user
1. **Preserve the legacy topology** (conservative)
   - Consequences: maintains the current team's mental map; perpetuates any structural debt; reduces migration risk.
2. **Adopt the proposed modern topology** (transformational)
   - Consequences: breaks with structural debt; requires learning; maximizes gains from the target stack.
3. **Hybrid** (balanced)
   - Consequences: <describe which edges preserve the legacy and which adopt the modern approach, with justification per edge>

## User's decision
- **Choice**: <1 | 2 | 3>
- **User's justification**: <free text>
- **Decided at**: <ISO-8601>

## Legacy → new mapping
| Legacy module / folder | New bounded context | Type | Observations |
|---|---|---|---|
| <legacy A> | <new X> | preserved | <obs> |
| <legacy B + C> | <new Y> | merged | <justification> |
| <legacy D> | <new Y1, Y2> | split | <justification> |
| (empty) | <new Z> | new | <justification> |
| <legacy E> | (discarded) | removed | see `discard_log.md` |

## Pending implications for the Designer's next steps
| Designer step | Implication | How to honor |
|---|---|---|
| Bounded contexts | <implication> | <expected action> |
| target_architecture | <implication> | <expected action> |
| target_domain_model | <implication> | <expected action> |
| target_data_model | <implication> | <expected action> |

## Notes
<Any additional point the coding agent needs to know to create the folder tree and respect the chosen topology.>
