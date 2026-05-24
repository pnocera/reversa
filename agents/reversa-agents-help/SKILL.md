---
name: reversa-agents-help
description: Explains with analogies what each Reversa agent does and when to use it. Activate with /reversa-agents-help.
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  role: help
---

Present exactly the text below, without changes, without summarizing.

---

# Reversa Agents — guide with analogies

Reversa is a team of specialists. Each agent does one thing only — and does it well.

---

## 🎼 Reversa — central orchestrator
**Command:** `/reversa`

An orchestra conductor plays no instrument. They know the entire score and say who comes in when, in what order, at what tempo. Without them, each musician would play their part without connecting to the others.

> Use Reversa to start or resume the full analysis. It handles the sequence for you.

---

## 🗺️ Scout — the real estate agent
**Command:** `/reversa-scout`

The agent does the first walkthrough of the property. Does not open drawers, does not read documents, does not touch anything. Just maps: how many rooms, which neighborhood, what facilities exist, what the overall condition is.

> Use Scout at the beginning. It generates the project inventory — languages, frameworks, modules, dependencies — without entering the code.

---

## 🧬 Soul Extractor: the express biographer
**Command:** `/reversa-extract-soul`

The express biographer visits the subject, reads the agent's notes (Scout), quickly leafs through some family albums and the letter history (git log), and produces a one-page biography: who they are, what they do, and the founding decisions that shaped their entire life. It is not the full story — it is the soul distilled.

> Use Soul Extractor right after Scout when you want an executive synthesis of the system (purpose, central entities, and founding decisions) in a single Spec, without waiting for the full pipeline. Does not replace Archaeologist or Detective.

---

## ⛏️ Archaeologist — the excavator
**Command:** `/reversa-archaeologist`

The archaeologist excavates the terrain patiently, layer by layer. Catalogs each artifact found: size, material, location, shape. Does not interpret the civilization — only describes with precision what is there.

> Use Archaeologist to analyze the code module by module. It extracts functions, algorithms, data structures, and control flows. **Runs one module per session** to conserve tokens.

---

## 🔍 Detective — the Sherlock Holmes
**Command:** `/reversa-detective`

Sherlock Holmes arrives after the archaeologist. Looks at the cataloged artifacts and asks: *"But why is this here? Who put it here? What does this reveal about whoever lived here?"* He does not excavate. He interprets.

> Use Detective after Archaeologist. It extracts implicit business rules, reads the git history like a diary, and reconstructs decisions that nobody documented.

---

## 📐 Architect — the cartographer
**Command:** `/reversa-architect`

The cartographer visits a territory and produces formal maps: floor plan, elevation map, structural blueprint. Someone who has never been there can understand everything just by looking at the maps.

> Use Architect after Detective. It synthesizes everything into C4 diagrams, complete ERD, and an integration map.

---

## 📝 Writer — the notary
**Command:** `/reversa-writer`

The notary transforms what was discovered into formal, precise, and traceable contracts. Every clause has a declared confidence level. The document works as a contract: an AI agent can reimplement the system from it.

> Use Writer after Architect. It generates SDD specs, OpenAPI, and user stories with code traceability.

---

## ⚖️ Reviewer — the spec reviewer
**Command:** `/reversa-reviewer`

The Reviewer takes the Writer's contracts and tries to break them: *"This is a contradiction. This point has no proof. This rule disappears if the user does X."* It does not want to destroy — it wants to ensure that what remains standing is solid.

> Use Reviewer after Writer. It critically reviews the specs, reclassifies confidence, and raises questions for human validation.

---

## 🖼️ Visor — the forensic illustrator
**Command:** `/reversa-visor`

The forensic illustrator works only with images. Receives screenshots of the system and faithfully reconstructs the interface: screens, forms, navigation flows. Does not require the system to be running — just the photos.

> Use Visor when you have screenshots available. It documents the UI without needing access to the system.

---

## 🗄️ Data Master — the geologist
**Command:** `/reversa-data-master`

The geologist maps the subsoil — the layer nobody sees but that sustains everything. Tables, relationships, constraints, triggers, procedures. The invisible foundation on which the application is built.

> Use Data Master when DDL, migrations, or ORM models are available. It fully documents the database.

---

## 🎨 Design System — the stylist
**Command:** `/reversa-design-system`

The stylist catalogs the wardrobe: color palette, typography, spacing, design tokens. The "fashion rules" that govern the system's appearance — what can and cannot be combined.

> Use Design System when CSS files, themes, or interface screenshots are available. It extracts the project's visual tokens.

---

## Recommended sequence

```
/reversa → orchestrates everything automatically

Or manually:
Scout → Archaeologist (N sessions) → Detective → Architect → Writer → Reviewer

Optional at any phase:
Soul Extractor · Visor · Data Master · Design System
```
