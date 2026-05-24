---
schemaVersion: 1
kind: migration_strategies
description: Advisory catalog of migration strategies with applicability criteria. Used by the Strategist.
---

# Migration Strategies

> Catalog of canonical migration strategies with applicability criteria, cost, risk, time, examples, and references.
> Updating this catalog is a maintenance task independent of the Strategist agent.

## Strategies

### Strangler Fig
- **Description**: The new system grows around the legacy, capturing functionality incrementally until the legacy can be shut down.
- **When it applies**:
  - Production system that cannot be stopped.
  - Need for incrementality.
  - Routing between old and new is possible (proxy / API gateway).
- **Cost**: medium.
- **Risk**: low (partial rollback is viable).
- **Time**: long (months to years in large systems).
- **Favored appetite**: conservative, balanced.
- **Example**: API gateway redirects `/v2/orders/*` endpoints to the new system while `/orders/*` continues in the legacy.
- **References**: Martin Fowler, "StranglerFigApplication"; Sam Newman, "Monolith to Microservices".

### Big Bang
- **Description**: Complete replacement in a single cutover window.
- **When it applies**:
  - Small system.
  - Tolerated maintenance window.
  - High transformational appetite.
  - Low number of live external integrations.
- **Cost**: low (no maintenance of two versions).
- **Risk**: high (full rollback is expensive; failure takes down the service).
- **Time**: short.
- **Favored appetite**: transformational (in small systems).
- **Example**: internal tool used by 50 people migrated overnight with a documented rollback.
- **References**: described in various migration frameworks; high correlation with historical failures in large systems.

### Parallel Run
- **Description**: Legacy and new run in parallel receiving the same input; output is compared to detect divergences.
- **When it applies**:
  - Critical logic (financial, tax, regulatory).
  - Need for proof of equivalence over a long period.
  - Large paradigm change + transformational appetite (high operational risk).
- **Cost**: high (two stacks operating simultaneously; output comparison).
- **Risk**: medium (risks come from dual operation, not from cutover).
- **Time**: medium.
- **Favored appetite**: balanced.
- **Example**: tax calculation running in legacy and new for 60 days; cutover only after divergence < 0.01%.
- **References**: Michael Nygard, "Release It!"; common in banking and tax systems.

### Branch by Abstraction
- **Description**: Internal refactoring of the legacy to introduce an abstraction that allows swapping the underlying implementation, then replacing it.
- **When it applies**:
  - Internal migration (language or framework changes, but domain stays).
  - Conservative appetite.
  - Team already inside the legacy codebase, with domain knowledge.
- **Cost**: low.
- **Risk**: low.
- **Time**: medium.
- **Favored appetite**: conservative.
- **Example**: extract an `OrderRepository` interface in the legacy, keep both old and new implementations selected by a flag, then remove the old one.
- **References**: Paul Hammant, "Branch By Abstraction".

## Quick comparison

| Strategy | When it applies | Cost | Risk | Time |
|---|---|---|---|---|
| Strangler Fig | production system, cannot stop | medium | low | long |
| Big Bang | small system, controlled window, transformational appetite | low | high | short |
| Parallel Run | critical logic (financial / tax) | high | medium | medium |
| Branch by Abstraction | internal refactoring before migration | low | low | medium |

## Influence of paradigm on strategy selection

- **`conservative` appetite** → favors Branch by Abstraction and Strangler Fig.
- **`balanced` appetite** → favors Strangler Fig and Parallel Run.
- **`transformational` appetite** → allows Big Bang in small systems; Strangler Fig with deep edges in larger ones.
- **Large paradigm change + transformational appetite** → flag `high operational divergence risk` and recommend Parallel Run for validation.

## Utility function (used by the Strategist)

Pseudo-procedure the agent follows when consulting the catalog:

1. Receive `migration_brief` (scope, deadline, constraints) + `derived_appetite` + `paradigm gap`.
2. Filter strategies by applicability (drop out those that clearly do not fit).
3. Score each remaining strategy by fit to appetite and gap.
4. Select the 2 to 3 best candidates.
5. Mark one as `recommended` with an explicit justification.
6. For each remaining strategy, list cons as reasons for non-recommendation.

## Catalog test scenarios

1. brief = production banking system, conservative appetite → recommend Strangler Fig + Branch by Abstraction.
2. brief = internal tool 50 users, transformational appetite → recommend Big Bang.
3. brief = tax system, balanced appetite, high paradigm change → recommend Parallel Run + Strangler Fig.
4. brief = Rails monolith to Go microservices, transformational appetite, large paradigm change → recommend Strangler Fig with deep edges, flag operational risk, suggest Parallel Run for critical domains.
5. brief = .NET WebForms to Blazor, balanced appetite, no large paradigm change → recommend Strangler Fig.
6. brief = legacy system with few integrations, tolerated maintenance window, balanced appetite → recommend Big Bang with a robust rollback plan, Strangler Fig as alternative.
