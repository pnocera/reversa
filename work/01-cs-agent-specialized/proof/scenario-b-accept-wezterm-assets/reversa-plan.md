# Exploration Plan — reversa-scenario-b-accept-5f7f153471124d0e993491c7df5364e2

> Created by Reversa on 2026-05-24
> Mark each task with ✅ when completed.
> You can edit this plan before starting: add, remove, or reorder tasks as needed.

---

## Phase 1: Reconnaissance 🔍

- [ ] **Scout** — Folder structure and technology mapping
- [ ] **Scout** — Dependency and package manager analysis
- [ ] **Scout** — Entry point, CI/CD, and configuration identification

## Spec organization decision 🗂️

> Between Scout and Archaeologist, Reversa asks how you want to organize the specs (by module, use case, endpoint, hybrid, by features, or custom). The choice is persisted in `.reversa/config.toml` under the `[specs]` section and will not be asked again on future runs. To re-display the menu, manually remove the section.

## Phase 2: Excavation 🏗️

> Reversa fills this section with the actual modules after Scout completes reconnaissance.

- [ ] **Archaeologist** — Analysis of modules identified by Scout

## Phase 3: Interpretation 🧠

- [ ] **Detective** — Git archaeology and retroactive ADRs
- [ ] **Detective** — Implicit business rules and state machines
- [ ] **Detective** — Permissions matrix (RBAC/ACL)
- [ ] **Architect** — C4 diagrams (Context, Containers, Components)
- [ ] **Architect** — Full ERD and external integrations
- [ ] **Architect** — Spec Impact Matrix

## Phase 4: Generation 📝

- [ ] **Writer** — SDD specs per component
- [ ] **Writer** — OpenAPI (if applicable)
- [ ] **Writer** — User Stories (if applicable)
- [ ] **Writer** — Code/Spec Matrix

## Phase 5: Review ✅

- [ ] **Reviewer** — Cross-review of specs
- [ ] **Reviewer** — Gap resolution with the user
- [ ] **Reviewer** — Final confidence report

---

## Independent Agents

> Run these agents when resources are available — they can run at any phase.

- [ ] **Visor** — Interface analysis via screenshots
- [ ] **Data Master** — Complete database analysis
- [ ] **Design System** — Design token extraction
- [ ] **Tracer** — Dynamic analysis (requires an accessible system)

---

## Next step

After the Discovery Team completes and `_reversa_sdd/` is populated, you can trigger one of the following flows:

- `/reversa-migrate`: orchestrator of the **Migration Team** (Paradigm Advisor → Curator → Strategist → Designer → Screen Translator → Inspector). Generates the new system specs. Output in `_reversa_sdd/migration/` and `_reversa_sdd/screens/`.
- `/reversa-reconstructor`: generates a bottom-up plan to reimplement the software from the legacy specs (one task per session).
