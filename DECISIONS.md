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

**D-025: Deep-state parity is a verify gate (2026-10-02; pending human confirmation with the P1 PR).**
The golden traces hash only the alive and tier grids. Planting SPEC §1's own example mistake (`0.8f` in the pressure decay) left all four goldens passing; a float-only `resist·forget` was caught only by stress-seed-4, at gen 4342. So `./verify` now also diffs per-generation hashes of the hidden per-site state (pressure, wall, resist, harm, claimed, score, frequency table) between the JS reference (`tests/deep.js`, generated live) and the C++ core (`culture_trace --deep`): default-seed-1 in `fast`, the other three in `full`. It caught the `0.8f` plant at gen 866. Nothing new is stored or pinned; the goldens remain the frozen oracle and the reference remains normative.
Rejected: adding deep hashes to the golden format (would change pinned files and the compare tool for no gain while the JS reference can be run live).

**D-026: Performance approach for P1 (2026-10-02).**
Measured split at 440×280 before tuning: life update 2.1 ms, territory 2.1 ms, the rest 0.7 ms. Two changes, both exact by construction and both re-proved by every parity gate: (1) torus wrap tables instead of `%`, with per-step scratch buffers reused; (2) in the life and territory passes, skip the neighbor scan when the 3×3 neighborhood is a single tier (the JS loop provably does nothing there and draws no randomness), with hot-loop state behind local pointers and branch-free stats (adding `nx·v` with nx = 0 leaves a double sum unchanged). Result: 2.0–2.2 ms/step (budget 4 ms; reference ≈ 12 ms). Wrap tables alone changed nothing measurable; the neighbor-scan skip was the win. SIMD was not needed and was not attempted.
The bench runs 4,000 steps per seed because a short run is still single-tier and flatters the number (3.1 ms at one tier vs 4.1–5.0 ms with 5–8 tiers, before tuning).

**D-027: The stereo-stat trig is vendored fdlibm, Apple Silicon (FMA) flavor (2026-10-02, human decision by poll).**
The critic found the per-tier stereo stats (`stats.cos/sin/cosY/sinY`, read only by sound) diverged from the reference: platform `std::cos`/`std::sin` differ from V8 in 4.5% of 2.24M sampled results (10–20% of table entries). V8's `Math.sin`/`Math.cos` is fdlibm (`v8::base::ieee754`, no `libm_*` trig in node 24.10), but fdlibm alone still differed in 0.56%. Cause: Apple Silicon V8 is compiled by clang with the default `-ffp-contract=on`, which fuses `a*b+c` inside fdlibm into FMAs. fdlibm compiled that way matched V8 exactly (0 / 2.24M). So "V8's cos" is two functions: x86-64 builds (no FMA) give the plain flavor. Neither is correctly rounded (V8 was correctly rounded on only 96.7% of random samples), so only the same algorithm matches.
The human chose: reproduce the FMA flavor, with every contraction written as `std::fma` (`core/src/fdlibm.hpp`), so the C++ gives the same bits on every platform and compiler under `-ffp-contract=off`. Verified 0 differences at -O2 and -O0. The C++ hash over those 2.24M values is pinned in `tests/trig.expected` and checked everywhere; node is compared too where `tests/trig_flavor.js` reports the fma flavor, and `./verify` prints a visible n/a line elsewhere (e.g. Linux CI) instead of failing.
Rejected: plain fdlibm (would match x86 node and CI, not the primary platform); recording a platform difference (the human preferred a fix at the cause).
The simulation itself never depended on trig. Its other libm calls were measured alongside this decision: `pow(k, 1.5)` equals V8 bit for bit for every k in 0…65,536 (all reachable `excess`), and `-log2` scores equal V8 after the float32 store on 400,000 score-domain samples (macOS libm differs from V8 as a double in about 0.1% of such arguments, 1,896 of 2M in the critic's sample, and the float32 store absorbed every one). Both are now cross-implementation vectors in `./verify`, so CI reports what glibc does.

**D-028: D-025 confirmed and extended; critic fixes (2026-10-02, human decision by poll).**
The human confirmed the deep-state gate and the critic's extension: the deep line now also carries the sound stats, the internal scalars as raw bits (record, lastMax, brake, thresholdLift, warm, meanEpoch, tableTotal), the counters (reignStart, lastBirth, frontierAge, starve), tier/extinct counts, and retreat/search state; and a "chaos" case (37×23, sliced search `work(p, 2)`, `forceEmerge` every 15 gens, spark 0.002, mutation 5, extinction 30) runs in `fast` (seed 7) and `full` (seed 11). Seed 7 covers 626 retreat generations, 2,926 with a pending search, 5 extinctions and 45 tiers. Each deep run must produce exactly <gens> lines on both sides: during this work, two outputs that were both empty (both tracers had rejected a malformed argument) diffed as "identical" in an ad hoc check.
Also from the review: the FP-parity flags moved onto the `culture` CMake target (they no longer depend on the directory a consumer builds from) and `core.cpp` refuses `-ffast-math` with `#error`; `World` rejects W or H < 6 (birth discs would write out of bounds; the JS silently drops those writes, so there is no reference behavior); the trace CLI asserts a little-endian host; `cpp_build` reconfigures unless the cached build type is Release.
Each new gate was proven to fire on a plant: `0.8f` in pressure decay → cpp_deep red (cpp_parity still green); one unfused fdlibm term → cpp_trig red; an empty JS deep trace → line-count failure.

**D-029: PA0 closed; four prior-art recommendations adopted (2026-10-02, human decision by poll).**
The human judged PA0 complete after reading `docs/prior-art.md` (PR #5) and adopted all four of its recommendations:
(1) **P5 design basis:** Rosas et al. 2020 Ψ per 8×8 block from plug-in counts. Gated by a seeded null baseline, and by offline validation against an independent structure detector before it may trigger anything. Later layer rules are a modal lookup table admitted by Israeli & Goldenfeld's closure test.
(2) **Rule-screen review joins P4:** B2 exclusion, complement equivalence, Eppstein's growth/decay pre-screen, and calibration against Yin 2026. Decided together with the SPEC §8 quirks so that any golden regeneration happens once.
(3) **New item PE1:** Bedau–Packard activity statistics over the tier lineage, measured (Layer-E), never gated.
(4) **Wording rule in the charter:** "surprisal"; "block predictability gain"; open-endedness is measured, not claimed.
P4 is the current phase. Rejected: P2 first (the render stack is still undecided), and PE1 first (it does not unblock anything).
