> Local copy of the advisory catalog. Canonical source at `templates/migration/catalogs/migration_strategies.md`.

# Migration Strategies (local copy)

## Strategies

### Strangler Fig
- **When it applies**: production system, cannot stop; need for incrementality; routing is possible (proxy / API gateway).
- **Cost**: medium. **Risk**: low. **Time**: long.
- **Favored appetite**: conservative, balanced.

### Big Bang
- **When it applies**: small system; tolerated window; transformational appetite; few live integrations.
- **Cost**: low. **Risk**: high. **Time**: short.
- **Favored appetite**: transformational (in small systems).

### Parallel Run
- **When it applies**: critical logic (financial / fiscal / regulatory); needs proof of equivalence over a long period.
- **Cost**: high. **Risk**: medium. **Time**: medium.
- **Favored appetite**: balanced.

### Branch by Abstraction
- **When it applies**: internal migration (language or framework changes, domain stays); conservative appetite.
- **Cost**: low. **Risk**: low. **Time**: medium.
- **Favored appetite**: conservative.

## Recommendation rules

- `conservative` appetite → Branch by Abstraction + Strangler Fig.
- `balanced` appetite → Strangler Fig + Parallel Run.
- `transformational` appetite → Big Bang in small systems; Strangler Fig with deep edges in larger ones.
- large paradigm change + transformational appetite → recommend Parallel Run to validate parity.
- system with regulatory integrations → never recommend Big Bang.

## Pseudo-procedure

1. Filter applicable strategies based on the brief.
2. Score remaining ones by fit to appetite and paradigm gap.
3. Select 2 to 3 candidates.
4. Mark one as recommended with justification.
5. For each other, list cons as reason for non-recommendation.
