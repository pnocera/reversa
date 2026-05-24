# Spec Evaluation Rubric

Used by `scripts/spec_scorer.py` and as a guide for manual review.

Total score: **0–100 points**

---

## Dimension 1: Completeness (30 points)

Evaluates whether all essential sections are present and filled.

| Criterion | Points | How to verify |
|----------|--------|----------------|
| Sections 1–6 all present and filled (not just headers) | 10 | Each section has ≥ 2 sentences or 1 list item |
| Functional requirements with IDs (RF-XX) | 8 | At least 3 numbered requirements |
| Acceptance criteria defined for each Must RF | 7 | "Acceptance Criterion" column filled |
| Explicit Non-Goals (section 4) | 5 | At least 2 non-goals listed |

**Penalties:**
- Mandatory section completely absent: -5 per section
- Section with unfilled placeholder (`[brackets]`): -2 per occurrence

---

## Dimension 2: Testability (25 points)

Evaluates whether a QA can write tests from the spec without asking questions.

| Criterion | Points | How to verify |
|----------|--------|----------------|
| Requirements use concrete and measurable verbs | 10 | Absence of "must be good", "must be fast", "must be intuitive" |
| Main flow (happy path) described step by step | 8 | Section 6.2 with ≥ 3 steps |
| Success metrics with numerical values | 7 | Section 3 has at least 1 metric with a numerical target |

**Penalties:**
- Non-testable requirement ("the system must be easy to use"): -3 per occurrence
- Happy path absent: -8

---

## Dimension 3: Clarity (20 points)

Evaluates whether the language is precise and unambiguous.

| Criterion | Points | How to verify |
|----------|--------|----------------|
| No vague terms without definition | 8 | "quickly", "soon", "many", "some" without a value — -2 each |
| Open Questions flagged with ⚠️ or in section 14 | 6 | Ambiguities are explicit, not silent |
| Clear subject in each requirement ("the system", "the user") | 6 | No requirements without an identified subject |

**Penalties:**
- Contradiction between requirements: -5 per contradiction
- Technical term without definition for a non-technical audience: -2 per occurrence

---

## Dimension 4: Scope (15 points)

Evaluates whether the feature's boundaries are clear.

| Criterion | Points | How to verify |
|----------|--------|----------------|
| Non-Goals section (4) clear and useful | 7 | At least 2 non-goals that prevent real scope creep |
| Dependencies and integrations mapped (section 10) | 5 | Every external dependency is listed |
| Rollout / rollback plan present (section 13) | 3 | Strategy and how to revert are defined |

**Penalties:**
- Vague non-goals ("future features"): -2 per occurrence
- Critical dependency not mapped: -3

---

## Dimension 5: Edge Cases (10 points)

Evaluates whether difficult cases have been anticipated.

| Criterion | Points | How to verify |
|----------|--------|----------------|
| At least 3 edge cases listed (section 11) | 5 | Table with ≥ 3 filled rows |
| Error handling with defined message/behavior | 3 | Each error has an expected behavior |
| External dependency failure cases covered | 2 | At least 1 EC for timeout/unavailability |

**Penalties:**
- Zero edge cases: -10 (this dimension scores zero)
- Edge case without defined behavior: -1 per occurrence

---

## Score Classification

| Score | Classification | Meaning |
|-------|--------------|-------------|
| 90–100 | ⭐ Excellent | Ready for immediate implementation |
| 80–89 | ✅ Good | Ready with minor adjustments |
| 65–79 | ⚠️ Adequate | Implementable but with risks |
| 50–64 | 🔶 Incomplete | Needs review before implementing |
| < 50 | ❌ Insufficient | Return to interview / draft |

---

## Quick Review Checklist

Before marking a spec as "Approved", confirm:

- [ ] Can any developer implement it without asking questions?
- [ ] Can any QA write tests without asking questions?
- [ ] Are the non-goals as clear as the goals?
- [ ] Does every error case have a defined behavior?
- [ ] Do all requirements have traceable IDs?
- [ ] Are there no contradictions between requirements?
- [ ] Are open questions documented (not silent)?
- [ ] Are success metrics numerical and verifiable?
