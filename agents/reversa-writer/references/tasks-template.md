# [Unit Name], Implementation Tasks

> Template for the `tasks.md` file. Focuses on an executable sequence of tasks for reimplementing the unit from the legacy code, with traceability to the original code.

## Prerequisites
- [ ] Unit dependencies listed in `design.md` are available
- [ ] Compatible database schema/migrations (if applicable)
- [ ] Required environment variables / configs documented

## Tasks

> Each task references the legacy file from which the behavior was extracted.

- [ ] T-01, [Task description]
  - Legacy origin: `path/file.ext:line`
  - Done criterion: [how to validate]
  - Confidence: 🟢 / 🟡 / 🔴

- [ ] T-02, [Task description]
  - Legacy origin: `path/file.ext:line`
  - Done criterion: [how to validate]
  - Confidence: 🟢 / 🟡 / 🔴

## Test Tasks

- [ ] TT-01, Happy-path test for the main flow (see `requirements.md`, Acceptance Criteria)
- [ ] TT-02, Main error case test
- [ ] TT-03, [Other relevant scenarios]

## Data Migration Tasks (if applicable)

- [ ] TM-01, [Data migration X, with reference to the legacy schema]

## Suggested Order
1. [Which tasks should be done first and why]
2. [Blockers between tasks]

## Pending Gaps (🔴)
[List here the decisions that require human validation before implementation]
