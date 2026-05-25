PHASE 8 NOT APPROVED

Blocking proof gaps and required fixes:

**1. Missing canonical Scenario B transcript**
- Plan requires `work/01-cs-agent-specialized/proof/scenario-b-transcript.md`. The folder has six specialized `scenario-b-{accept,decline}-...-{install,codex}-transcript.md` files but no canonical roll-up at the required path.
- Fix: produce a single `scenario-b-transcript.md` consolidating the authoritative run, with: starting state (installed, no `[integrations.cs_agent]` block, no dismissal), Scout `surface.json` excerpt showing `signals[]` containing `cs_agent_profile_detected`, orchestrator prompt text, acceptance, synchronous snapshot+inventory results, and second-run timing.

**2. Scenario B transcripts encode the obsolete pre-Scout gate (contradicts current Phase 4 contract)**
- All scenario-b codex transcripts (accept + decline, wezterm + published) contain language like "Before Scout starts, obey the Content Server specialization gate" and the agent runs `content-server detect` and edits `config.toml` *before* Scout walks (see `scenario-b-accept-wezterm-codex-transcript.md` lines 34, 91, 101, 120–138). Phase 4 (agents/reversa/SKILL.md) puts the migration prompt **after Scout, before Archaeologist**, gated on `surface.json.signals[]` containing `cs_agent_profile_detected`.
- Fix: re-run Scenario B with the corrected lifecycle and capture (a) Scout completing first and writing the `cs_agent_profile_detected` signal, (b) orchestrator reading `surface.json` and only then prompting, (c) acceptance leading to synchronous snapshot + inventory before Archaeologist starts. Delete or clearly mark the stale transcripts as superseded so future readers do not treat them as current contract evidence.

**3. No second-run fast-path proof**
- Phase 8 step 6 requires running `/reversa` again and verifying the enabled fast path under 60 seconds. No transcript or timing artifact captures the second run. Grep for "second run", "fast path", "60 seconds", "enabled fast" returned none.
- Fix: add a timed second `/reversa` run in `scenario-b-transcript.md` (or a separate `scenario-b-second-run.md` linked from it) showing wall-clock elapsed under 60 s and confirming snapshot is reused (no re-prompt, no re-snapshot unless TTL expired).

**4. Scenario A first-run does not prove Scout skipped `srcdir` via snapshot evidence**
- `scenario-a-transcript.md` invokes `content-server snapshot` and `content-server inventory` directly via `node bin/reversa.js`; it does not show Scout itself reading the snapshot and skipping `profile.paths.srcdir`. `scenario-a-codex-run-transcript.md` only captures Scout's completion text and the Archaeologist pause; it does not include a `surface.json` or audit-log excerpt evidencing that `E:\CS253_workdir\srcmodules` was skipped from the walk.
- Fix: extend `scenario-a-transcript.md` with the Scout-produced `surface.json` (or equivalent audit line) showing the snapshot was consumed and `srcdir` was excluded from the walked roots — the gate G that ties snapshot to walk-skip.

**5. Hard gates G1–G17 not enumerated**
- Phase 8 exit criteria requires "all hard gates G1–G17 pass or have a concrete defect filed". The proof folder contains no gate-by-gate pass/fail roster mapping each gate to the artifact that proves it.
- Fix: add a `gates-G1-G17.md` (or extend the canonical transcripts) explicitly checking each gate off against a named artifact line, or filing a defect with link to the failing evidence. Without this, G2/G6/G7/G13/G14/G17 in particular have no traceable sign-off in the proof folder.

`sample-inventory.md` is fine: single begin/end marker pair, exact CS Profile block shape, all five sub-sections (Profile / Graph / Modules / Reference Confidence / Unresolved References) present.

Minimum to flip to APPROVED: items 1–4 above (real Scout-after lifecycle, canonical Scenario B file, second-run timing, srcdir-skip evidence in Scenario A) plus the G1–G17 roster from item 5.
