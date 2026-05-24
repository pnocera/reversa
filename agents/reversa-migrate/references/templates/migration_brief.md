---
schemaVersion: 1
generatedAt: <ISO-8601>
reversa:
  version: "x.y.z"
kind: migration_brief
producedBy: orchestrator
hash: "sha256:<hash of the body below the front-matter>"
---

# Migration Brief

> Migration criteria document collected in an interview at the start of `/reversa-migrate`.
> Consumed by the six agents of the Migration Team. Does not ask about paradigm (the Paradigm Advisor's responsibility) or appetite (derived in `paradigm_decision.md`).

## Migration objective
<Why does this migration exist? What changes for the business if it happens or not.>

## Success metrics
- <metric 1, with a clear numeric or qualitative target>
- <metric 2>
- <metric 3>

## Constraints
- **Deadline**: <date or window>
- **Budget**: <range, team, hiring involved>
- **Technical**: <external APIs that cannot change, contracts, regulatory rules>
- **Operational**: <maintenance windows, SLAs during migration>

## Known risk factors
- <risk 1: short description>
- <risk 2>

## Stakeholders
| Name / role | Responsibility in the migration |
|---|---|
| <name> | <responsibility> |

## Target stack
- **Language**: <e.g.: Node.js 20>
- **Framework**: <e.g.: Fastify>
- **Database**: <e.g.: PostgreSQL 16>
- **Messaging** (if any): <e.g.: SQS, Kafka, none>
- **Infra**: <e.g.: AWS Lambda, Kubernetes, on-premise>
- **Other relevant components**: <cache, observability, gateway>

## Declared scope
- **Included**: <legacy modules that are in scope>
- **Excluded**: <modules that are out of scope or will be discontinued>

## Free notes
<Any context the user wants to record for the agents to read.>
