# DECISIONS (seed log from the prototype phase)

These are the decisions made while building the browser prototype on 2026-10-01, in order. Each entry records what was decided, why, and what was tried and rejected. Append new decisions after this file; do not rewrite these.

---

**D-001: Start with a propagating rule-field; aim for recursive coarse-graining later.**
Three ways to make a new "nature" emerge were considered:
1. a rule-field that spreads irreversibly from its origin point
2. a new cell type the old cells can't destroy
3. genuine open-ended evolution, where structures out-compete old ones the way eukaryotes did

The rule-field came first because it can *guarantee* that rules never repeat, and it is quick to make striking. The long-term target is a synthesis: a coarse-graining monitor detects when block-level dynamics become autonomous (Hoel-style causal emergence) and spawns a new CA layer whose cells are those blocks, with a rule learned from their behavior.
Correction recorded at the time: Conway's Life does *not* naturally climb toward higher organisms. Random soups decay to "ash", and Life lacks heredity, robustness and resource competition.

**D-002: The trigger is surprise, measured against the frontier's own history.**
A decaying frequency table over 512 3×3 codes gives each cell a surprise in bits. The trigger is the maximum 5×5 window sum. "Rare" is therefore relative to the current rule, so every tier has its own improbable gateway.

**D-003: The next rule is hashed from the configuration that triggered it.**
Each new law is derived from history (the triggering 7×7 neighborhood plus the lineage counters), not drawn from a global sequence. `usedRules` guarantees no repeats within a world.
Known limit: the Life-like rule space is finite, about 2^16 usable rules. The coarse-graining synthesis removes that ceiling.

**D-004: Record logic: set during warm-up, then only erode.**
Bug found: the record snapped up to the current maximum every step, so a frozen world (for example B45/S45678) never opened a gap and stalled forever. Fix: the record is set only during warm-up, then only decays (`patience`), so a stagnant world still crosses it eventually.

**D-005: Rule screening has three parts.**
- Born-on-1 is excluded; it explodes from single cells.
- Edge-of-chaos activity is measured *late* (generations 250–280), to reject rules that coagulate after a lively transient.
- An invasion-speed test rejects rules faster than `maxSpeed` (default 0.30 c).

Motivation: explosive rules covered the whole world before any intermingling could happen, and the intermingling is where the interesting imagery is. The user's priority throughout: **interplay between tiers is the point.**

**D-006: Layered downward coupling: tried and REJECTED.**
A version stacked each nature as its own lattice layer, with births gated by motion in the layer below and living cells stirring the layer below. The user preferred the single-field look: the layers were noisier and more confusing, and did not improve behavior. Do not reintroduce stacked lattices without a new reason. The reference code for it is not included.

**D-007: Territory changes hands only under sustained contact, and contested ground hardens.**
This replaced instant conversion on contact. Pressure accumulates and leaks; a site converts when pressure exceeds `hold·(1 + wall)`; held ground gains wall up to `hardness`. Result: stable, interlocking frontiers.

**D-008: Hysteresis: sites remember harm.**
The user's idea: states become more resilient to the kind of harm they were recently vulnerable to. Implementation: a site remembers the neighbor count that last killed its cell and may resist that same count next time. Repeated identical harm compounds the resistance; a different kind of harm replaces the memory; everything fades with `forget`. Visible in the Memory view.

**D-009: Extinction happens as a retreat, not a flip.**
A frontier that dies out or freezes for 200 generations goes extinct. First version: all its ground reverted in one frame, which caused full-screen flips. Fixed: ground is returned in reverse claim order, over a duration proportional to its size (30–400 generations), and emergence pauses during the retreat. Quirk: ground reverts to index − 1, not the true parent (SPEC §8).

**D-010: Rule search is time-sliced, now count-based.**
Searching up to 800 candidates synchronously froze the page for 0.3–1.2 s. The search became an incremental job with a dashed ring marking the site. In the handoff version the budget is a candidate count, not milliseconds, so the core never reads a clock (doctrine: no wall-clock in cores). See SPEC §9 for timing modes.

**D-011: Color families and reactions.**
The user's idea: rulesets behave specially toward certain colors. Six families (ash is reserved for tier 0). Each ruleset has push / feed / spark reactions toward the other families, drawn from its seed. **Reactions are keyed to colors, not to specific tiers**, so a newcomer can set off a reaction an old tier has carried since its birth.
- Push back cancels the newer tier's default pressure and lets the older tier take ground. The frontier can be beaten back.
- Feed loosens the birth/survival masks by ±1 near that color, which can reinvigorate a dying epoch.
- Spark births a new ruleset at a living contact.
Spark bursts (7 births from one border in 500 generations) were tamed with a 1500-generation cooldown per pair.

**D-012: Mutation within a color, driven by reign length.**
The first version keyed mutation to the time since *any* birth. The user then specified: **the longer an epoch has dominated, the likelier it mutates.** Current rule: per-generation chance ∝ `mutation · brake · share · (reign/meanEpoch)² / meanEpoch`. The reign clock does not reset on mutation, so a reign that survives its mutants throws them off faster and faster. A mutant flips 1–2 rule bits, keeps its parent's color, and sometimes shifts one reaction.

**D-013: Crowding brake.**
The user wanted complex states to have time to play out. A tier holding at least 1% of the world counts as active. Each active tier beyond two lengthens the post-birth pause, raises the surprise threshold, and shrinks spark and mutation chances. At full brake, crowded birth rates measured about 57% lower.

**D-014: Sound is ambient sonification first; instrument mode later.**
The user chose ambient. Ruleset = voice, rule bits = spectrum, a just-intonation walk for pitch, contest = beating, hardening = comb resonance, events = gestures. See SOUND.md.

**D-015: The box is the stereo field.**
x maps to pan, y maps to distance (top = far), and how concentrated a colony is sets its width. The circular mean is used because of the torus; colonies that straddle the wrap sweep through the center.

**D-016: Click fixes.**
Fade from the current value instead of cancelling scheduled values; update audio parameters at about 15 Hz, not 60; give voices only to tiers holding at least 0.2% of the world, at most 10.

**D-017: UI defaults and controls.**
- Default speed 1× (range ¼× to 12×).
- World size slider: 165×105 to 550×350.
- Full screen with an auto-hiding HUD.
- Markers toggle for birth rings and the search circle.
- Per-frame simulation budget of 28 ms.
- The world is a torus.

**D-018: Prepare for a C++ port (this handoff).**
The browser prototype is the reference implementation. Golden traces were generated in instant-search mode for verification.

**D-019: The project is renamed from Succession to Culture.**
The user renamed the project before handoff (2026-10-01). Repo, library and app names follow: `culture/` and `libculture`. "Succession" appears only in this log's history.

---

## Repository era (from spin-up, 2026-10-01)

**D-020: Spin-up survey answers (2026-10-01).**
Polled one question at a time; answers recorded in `project.manifest.json`. Form factor: pure C++20 engine library + headless trace CLI + one native macOS viewer with sound; other form factors may wrap the core later, and the repo is not composite. Architecture rung 2 (lead thread + read-only subagents + an independent verifier on parity claims). Oracle: strict bit-exact goldens, single-platform CI smoke. The JS reference is the pinned oracle for the port (port-pin). Standalone: no consumers or providers, no intake briefs. No audit thread. Long-lived and interactive. Knowledge-loop tags: parity-and-float, perf, sonification, emergence-dynamics.

**D-021: Packet open questions resolved at spin-up (2026-10-01).**
- Platforms: macOS first (Apple Silicon, Command Line Tools only); core and trace CLI stay portable C++20. Vision Pro deferred.
- Parity: bit-exact is a hard phase-1 gate.
- Live search timing: deterministic latency with L = 30 generations; instant mode always exists for verification.
- Priority after the port: synthesis (recursive coarse-graining, D-001).
- Rendering stack: **deferred** to the phase-2 gate. Audio stack and the Reverb Station question: **deferred** to the phase-3 gate. Both are blocking open questions in ROADMAP.
- Repo: github.com/Julian-B-Smith/culture, public.

**D-022: Packet layout in the repo (2026-10-01).**
`reference/`, `tools/` and `golden/` copied unchanged to the repo root (verified byte-identical with `diff -r`). Packet docs (BRIEF, SPEC, SOUND, PORT_PLAN, packet README) live in `docs/handoff/`; this file absorbed the packet's DECISIONS log above. The original `culture-handoff/` folder and the stray top-level `Culture.html` are kept on disk but gitignored. `Culture.html` is **not** byte-identical to `reference/culture.html` (it carries a claude.ai artifact wrapper); `reference/culture.html` is the tracked, normative copy.

**D-023: Golden pinning is a verify gate (2026-10-01).**
`golden/PINS.sha256` pins the four golden traces, `reference/core.js`, `tools/golden.js` and `tools/compare.js`. `./verify fast` goes red if any of them changes. Changing a pinned file requires a new DECISIONS entry that states why and re-pins in the same commit. `fast` also proves the comparator fires (a planted divergence must FAIL) and regenerates default-seed-1 byte-identically; `full` regenerates all four.

**D-024: Manifest ratified; one bootstrap push to main (2026-10-01).**
The human ratified the spin-up manifest by poll. Because the GitHub repo was empty (no base branch for a PR), the human approved a single bootstrap push of the initial commits to `main`. From here on, all work goes branch + PR; merging stays the human's (Decision 66).
