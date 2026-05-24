# Methodology Guide — Spec-Driven Development

## What is SDD?

Spec-Driven Development is the practice of writing a detailed behavioral specification **before** writing any code. The spec answers the **what** the system must do — not the **how** to implement it.

Not to be confused with:
- **TDD** (Test-Driven Development): writes tests before code — complementary to SDD
- **DDD** (Domain-Driven Design): architectural pattern — independent of SDD
- **BDD** (Behavior-Driven Development): focuses on behaviors with Gherkin — a subset of SDD

---

## Core Principles

### 1. Behavior, not Implementation

The spec describes observable behavior, not internal implementation.

❌ Bad: "The system must use Redis to cache sessions"
✅ Good: "The system must keep the user's session active for 30 days on devices where they checked 'remember me'"

The implementation (Redis, JWT, database) is a technical decision for the implementer — not the spec's concern.

### 2. Ambiguity = Future Bug

Every ambiguity in the spec becomes a bug, an alignment meeting, or a PR discussion in the future. Make ambiguities explicit with `⚠️ OPEN:` — a visible open item is better than a silent assumption.

### 3. Non-Goals Are as Important as Goals

"What we will not do" prevents scope creep, aligns expectations, and speeds up decisions. A feature without non-goals tends to grow indefinitely.

### 4. The Spec Is a Living Contract

The spec changes as understanding evolves — and that is healthy. What matters is that changes are recorded (Decision Log) and that all stakeholders are aligned on the current version.

### 5. LLM-Readiness

A good modern spec must be readable by LLMs that will help implement it. This means:
- Numbered requirements (traceable IDs)
- Explicit, not implicit, behaviors
- Edge cases documented (LLMs do not guess boundary cases)
- Business context included (the "why" helps make good implementation decisions)

---

## The SDD Cycle

```
Idea/Problem
      ↓
  Interview  ←──────────────────────┐
      ↓                              │
  Spec Draft                         │
      ↓                              │
  Evaluation (Score)                 │
      ↓                              │
  Score < 80? ──── Yes ──── Identify gaps
      ↓ No
  Spec Approved
      ↓
  Implementation
      ↓
  Spec vs. Code (final validation)
```

---

## When to Write the Spec

| Feature size | Recommendation |
|-------------------|--------------|
| Bug fix | No spec needed |
| Small improvement (< 1 dev day) | Minimal spec: goals + main requirements |
| New feature (1–5 days) | Full spec, but concise |
| Complex feature (> 5 days) | Full spec + review by 2+ people |
| New system | Architecture spec + specs per feature |

---

## Requirement Priorities (MoSCoW)

| Priority | Meaning | Decision if it does not fit the deadline |
|-----------|-------------|-------------------------------|
| **Must** | Mandatory — without this it does not ship | Blocks the release |
| **Should** | Important — but there is a workaround | Deferred to next version |
| **Could** | Nice-to-have | Dropped if necessary |
| **Won't** | Consciously out of scope | Documented as Non-Goal |

---

## Common Anti-Patterns

### "Spec like a big-company PRD"
50-page specs that no one reads. Prefer concise specs that cover the essentials with clarity.

### "Spec as a list of technical tasks"
"Create users table, add POST /auth endpoint, integrate with OAuth..." — that is an implementation plan, not a spec. The spec speaks in behavior.

### "Verbal / Slack spec"
Decisions made in conversation without a record are lost and generate conflicts. Every spec must exist as a written document.

### "Spec that never changes"
Frozen specs that do not reflect the reality of what was implemented. The spec must be updated when the implementation intentionally diverges.

### "Silent Open Questions"
Assuming answers to unanswered questions. Always use `⚠️ OPEN:` and resolve before implementing.

---

## SDD Vocabulary

| Term | Definition |
|-------|-----------|
| **Spec** | Document that describes the expected behavior of a feature |
| **RF** | Functional Requirement — what the system must do |
| **RNF** | Non-Functional Requirement — how the system must behave (performance, security...) |
| **Goal** | Objective the feature must achieve |
| **Non-Goal** | What is explicitly out of scope |
| **Edge Case** | A boundary or non-obvious case the system must handle correctly |
| **Happy Path** | The primary and most common usage flow |
| **Acceptance Criterion** | A verifiable condition that defines when a requirement is implemented |
| **Open Question** | An unresolved doubt that may impact the design |
| **Decision Log** | Record of important decisions and why they were made |
