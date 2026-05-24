---
schemaVersion: 1
generatedAt: <ISO-8601>
reversa:
  version: "x.y.z"
kind: target_domain_model
producedBy: designer
hash: "sha256:<hash of the body below the front-matter>"
---

# Target Domain Model

> New system's domain model. Explicit traceability to the legacy (in `_reversa_sdd/domain.md` or equivalent).

## Aggregates

### AGG-Order
- **Aggregate root**: Order
- **Invariants**:
  - <invariant 1>
  - <invariant 2>
- **Accepted commands**: <list>
- **Published events** (if event-driven paradigm): <list>
- **Origin in the legacy**: <ref to `domain.md` or equivalent>

<repeat per aggregate>

## Entities

| Entity | Owning aggregate | Main attributes | Origin in the legacy |
|---|---|---|---|
| <name> | <agg> | <summarized list> | <ref> |

## Value objects

| Value object | Attributes | Validations | Origin |
|---|---|---|---|
| <name> | <list> | <rules> | <ref> |

## Domain events
> Mandatory section if the paradigm is event-driven or hybrid.

| Event | Published by | Consumed by | Schema (summarized) |
|---|---|---|---|
| <OrderCreated> | AGG-Order | Payment, Inventory | <fields> |

## Domain rules
> Mapping of rules from `target_business_rules.md` (MIGRATE only) to the aggregates / services where they now live.

| Rule (ID) | Location in the new domain | Origin (target_business_rules.md) |
|---|---|---|
| BR-MIGRAR-001 | AGG-Order.invariant <name> | BR-MIGRAR-001 |

## Traceability to the legacy

| New element | Origin in the legacy | Mapping type |
|---|---|---|
| AGG-Order | `domain.md § Order` + `sdd/orders.md` | merged |
| <new> | <ref> | 1-to-1 / merged / split / new |

## Notes
<Additional modeling observations.>
