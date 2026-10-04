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

**D-030: The C++ core is canonical; the JS reference is frozen (2026-10-02, human decision by poll).**
P4's changes alter the simulation, so the goldens had to be regenerated. The human did not want to stay bound to the JS implementation and asked for a golden reference in C++. Adopted, all five parts:
(1) **Freeze the parity point.** Tag `v0-js-parity` (commit 543fced) is the last commit where libculture is proven bit-identical to `reference/core.js`. The JS goldens are archived unchanged in `golden/js-v1/`. `reference/` and the JS-side tools (`tests/js/`) are frozen and pinned.
(2) **C++ goldens, including hidden state.** `golden/*.jsonl` are now written by `culture_trace`. `golden/deep/*.txt` pin every hidden array, scalar and sound statistic each generation for six runs (default 1–3, stress 4, chaos 7 and 11). At the hand-over both were proven identical to the JS: compare.js PASS at `--float-rel 0` against js-v1, and the deep files byte-identical to `tests/js/deep.js` output, trig included. `tests/vectors.expected` likewise equals the JS vectors.
(3) **`core/ref/` is the in-C++ second implementation.** It is the straightforward port, without D-026's optimizations: `%` wrapping, plain neighbor scans, no fast paths. Every optimized core must match it bit for bit; it is never optimized; semantic changes land in both cores in one commit.
(4) **Cross-toolchain parity.** CI (Linux, GCC, glibc) checks the same pins, which were generated with Apple clang.
(5) **Property tests** (`tests/properties.cpp`): determinism (two worlds, same seed, interleaved) and never-repeat. The originally proposed translation invariance was withdrawn: noise flips, per-cell RNG draws in raster order, the spark scan, and float summation order are positional by design, so it cannot hold bit-exactly. P4 adds a direct unit test of the #5 window wrap instead.
Each new gate was proven to fire on a plant: `0.8f` in `core/` turns deep[opt] red (cpp_parity stays green); the same plant in `core/ref/` turns deep[ref] red; disabling the used-rule check fails never-repeat ("B37/S23 used twice").
The browser prototype is frozen as the historical v1 demo. A WebAssembly build of libculture, so that a web viewer runs the one canonical core, is in the backlog.
What changed in meaning: the oracle now guarantees "no unintended change", not "matches an independently written spec". Rejected: changing both JS and C++ (keeps the JS's semantics and costs binding every change), and C++ without `core_ref` (optimizations would be checked only against pins).

**D-031: P4: the SPEC §8 quirks and the rule-screen review, decided (2026-10-02, human decisions by poll).**
Evidence comes from `analysis/quirks.cpp` (`culture_quirks`). It observes the canonical core read-only over 16 seeds × 20,000 gens (default) and 8 × 10,000 (stress): 658 births and 102 extinctions before the changes.
**Changed** (both cores, goldens regenerated and re-pinned in the same commit):
- **#1 Retreating ground goes to the site's previous owner.** Before: it always went to tier idx−1. That tier was not the dying tier's parent in 38 of 102 retreats, covering 23–25% of returned ground. Now each site records who held it before it was claimed (index plus birth serial, so a reused index is detected) and reverts to that owner while it lives, otherwise to idx−1. This restores D-009's intent ("gives its ground back"). Measured after the change (stress): 25.7% of retreating cells return to a previous owner other than idx−1.
- **#5 Surprise windows wrap the torus.** Before: centres excluded a 2-cell edge band (4.62% of sites) and windows did not wrap. Now `surpriseWindowMax` sums 5×5 windows over a wrapped grid for every site. The summation order is part of the bit-exact contract, so both cores call this one function. Unit-tested: blocks centred on corners and edges are found exactly; the old loop picks a site with sum 9 of 25. After the change (stress), 11 of 177 births were centred in the former band.
- **#8 Spark cooldowns are keyed by birth serials,** not tier indices, and the serial is the identity for consumers (sound voices, UI). Before: 98 births reused an extinct index, and one inherited a dead tier's cooldown.
**Kept and documented** (no change):
- #2: spark, mutation and retreat steps skip the surprise pass (1.3–3% of gens).
- #3: the record freezes while a search is pending. Never in instant mode; under live L = 30 it pauses decay for 30 gens per birth against a 2,512-gen half-life.
- #4: a failed search multiplies the record by 1.05 (3 in 400k gens).
- #6: `elx` is drawn for mutants (one discarded draw).
- #9: the cooldown is stamped with the post-increment gen.
- #10: float32 storage at the SPEC §1 sites. This is the precision contract.
**Removed:** #7, the always-true reign guard. Dead code, with no output change; the C++ never had it.
**Screen review:**
- No explicit B2 exclusion: 0 of 658 accepted rules had B2, because the invasion-speed cap already rejects them, and an explicit rule would only reshuffle the search stream.
- No complement equivalence: 0 of 658 births had their complement already used, and a complement rule behaves differently on a mostly-dead background.
- Eppstein's growth/decay pre-screen and calibration against Yin 2026 are deferred to a measured experiment rather than changed blind.
**Canonical:** the C++ core (D-030). SPEC.md stays as received (v0). The current semantics are SPEC plus D-031.
**D-032: x^1.5 is computed portably; std::pow left the core (2026-10-02).**
The first CI run of PR #7 failed `cpp_vectors`: glibc's `pow(k, 1.5)` hashed differently from the macOS-pinned value over k = 0…65,536. This is the cross-toolchain check of D-030 doing its job. Earlier runs passed only because the vectors were compared with node on the same machine. Measured with mpmath (300-bit) on macOS: `pow` is not correctly rounded at 89 integers (first k = 1,018), and glibc evidently differs somewhere too. The core now uses `pow15` (core/src/core.cpp): a double-double product x·√x that depends only on IEEE `sqrt` and `fma`. It is correctly rounded at every k in 0…65,536, so it gives the same bits on every platform. On every reachable value (excess = active − 2 ≤ 98, since an active tier holds ≥ 1% of the world) it equals macOS `pow` and V8, so **no golden or deep golden changed**. Only the pinned vector hash did, because it had pinned macOS's 89 misrounded values.
Residual risk, recorded rather than hidden: the surprisal score still uses `std::log2`. 400,000 score-domain samples agree between macOS and glibc after the float32 store, but a 1-ulp double difference can in principle cross a float32 rounding boundary (roughly 2^-29 per evaluation). Over very long runs that could make the two platforms diverge. ROADMAP carries a follow-up: vendor a correctly rounded log2 (e.g. CORE-MATH), proven equal to the goldens, the way trig (D-027) and pow (here) were made portable.

**D-033: Interim viewer sound; P3 is next, stack chosen by ear (2026-10-03, human decision by poll).**
The human noticed the viewer was silent. Sound had not been ported (P3 was parked on the audio-stack decision deferred at spin-up). Chosen: both. (1) Now: the dev viewer plays the **frozen v0 engine** (`reference/sound.js`, served unmodified) fed by the C++ core. The stream (frame v2) carries the per-tier stats, lineage and scalars the engine reads, and the page keeps one stable object per tier (keyed by birth serial), because the engine keys voices by object identity. This is a listening reference, **not P3**: it uses Web Audio, unseeded noise and impulse, and no bit-reproducible render. (2) Next: P3 proper, with the audio stack (miniaudio / Reverb Station FDN / JUCE) decided after listening. P3 no longer waits on P2: the engine only consumes snapshots, so it can be built and offline-rendered first.
Checked in the browser pane: audio context running, 5 voices on the stress profile, output RMS 0.046. Voice pitches 65.4 Hz (Conway's C2), mutants at 66.0 and 65.8 Hz, a just step at 79.5 Hz. Pause suspends the audio, Resume restores it.

**D-034: Rule search runs off the simulation thread, with deterministic latency (2026-10-03, human request).**
The human asked for the search worker carried in ROADMAP P2. The core stays single-threaded and clock-free; it gained a separable search:
- `searchCandidates`, the reference's candidate loop moved out of `work()` unchanged.
- `runSearch(SearchJob)`, pure and thread-safe, reading only a snapshot taken when the search starts (the search state, used rules, and a mutant parent's rule). The snapshot equals the live World because no birth can happen and no rule can change while a search is pending.
- `World::workLatency(p, L, resolve)`: a search triggered at generation g lands at exactly g + L. Cancellation is checked every generation, as in sliced mode, and a failed search applies its consequences at g + L.
Adapters may compute `resolve` on a worker thread launched when `latencyJob()` appears.
**Proofs (all in ./verify):** instant and sliced goldens unchanged by the refactor. L = 0 equals instant mode every generation (default, stress, chaos). A worker-thread run equals a synchronous run every generation, and every birth lands at start + 30. New deep goldens (`latency`, `chaos-latency`) agree for the optimized and naive cores. A planted off-by-one landing time turned all three latency gates red while core/ref stayed green.
**Viewer:** worker mode with L = 30 is the default. In the browser pane the first birth landed at gen 893 = 863 (its instant-mode gen) + 30.
**Measured on an idle machine:**

| World | Speed | Worst frame gap: worker | Worst frame gap: instant |
|---|---|---|---|
| 220×140 | 1× | 32 ms | 54 ms |
| 220×140 | 4× | 34 ms | 179 ms |
| 440×280 | 2× | 20 ms | 98 ms |
| 550×350 | 4× | 27 ms | 111 ms |

All hold 60 fps at target speed.
**Open (human):** L counts generations, so its wall-clock headroom shrinks with speed. At 16× (960 gens/s) 30 gens is 31 ms and searches can still stall (154 ms max at 220×140). A larger L fixes this but changes which world a seed produces in live play. A speed-dependent L would make speed change the world, which is rejected as a principle.

**D-035: Search latency stays at L = 30 (2026-10-03, human decision by poll).**
Resolves the question D-034 left open. L is counted in generations: it gives 500 ms of slack at 1× but only 31 ms at 16×, where long searches can still stall the viewer (154 ms measured). Kept at 30: births stay close to the surprise that caused them, and the stalls only affect 8–16×. Rejected: L = 120 (changes which world a seed produces in live play); L as a viewer option (deferred, though the core already takes L as a parameter).

---

## Prototype decisions v2–v3 (handoff v3 packet, 2026-10-04)

Recorded by the human while evolving the JS prototype, after this repo's own
log had already used D-020 to D-035. To keep every D-number unambiguous they
are imported verbatim here as **P-020…P-035**: P-0nn is the packet's D-0nn.
They concern presentation only (view, sound, recording, controls); the
packet's core.js and goldens are byte-identical to this repo's. Where packet
docs cite them, the citation now reads P-0nn (docs/handoff/, D-036).

**P-020: Full screen fills phones in either orientation.**
In full screen the box is sized to the screen. On a portrait screen it is turned 90° so the world's long side runs along the screen's long side, and the stereo mapping turns with it so the sound still matches what is on screen. A Fit/Fill toggle chooses between showing the whole world (letterboxed) and covering the screen (cropping the torus edges). iPhone browsers have no element full-screen API, so there the box fills the window or the artifact viewer instead. View-only change: the core and golden traces are unaffected.

**P-021: Lighter audio on phones.**
The user heard clicks on a phone but not on a laptop: audio-thread underruns on a busier, weaker device. The engine now requests larger audio buffers (`latencyHint: 'playback'`) everywhere, since an ambient piece doesn't need low latency. On touch devices it also caps voices at 6, uses a 3.5 s reverb impulse instead of 6.5 s, and updates parameters at 10 Hz instead of 15. Not yet confirmed by ear on the phone.

**P-022: Sharing defaults.**
So that people seeing it for the first time aren't confused, the prototype now opens with markers off and the world at 330×210 (440×280 was tried first and stepped down one size for phones). View defaults only; the golden traces still use 220×140.

**P-023: Optional CRT filter.**
A toggle renders the world through a cheap two-pass WebGL filter. Pass 1, at world resolution: phosphor persistence (each cell keeps the brighter of its new color and 0.42× last frame's). Pass 2, at screen resolution: barrel curvature, slight color fringing, bloom, one scanline per world row (faded out when rows are too small on screen), an aperture-grille mask, vignette, grain and faint flicker. Off by default. View only; the port's renderer can reuse the same two passes.

**P-024: Full screen is requested for the whole page, not the box.**
On the user's computer, leaving full screen left a frozen, unclickable full-screen image. The box is now always laid out by the page's own full-screen styling, and browser full screen is requested for the document root rather than the box element. Leaving browser full screen by any route (Esc, system button) also leaves the page's full-screen view, and the hide-controls timer can no longer fire after exit. Fix not yet confirmed on the user's machine.

**P-025: Square worlds.**
A Wide/Square shape choice. Square sizes (132² to 440²) match the wide sizes' cell counts. Full screen never rotates a square world. Changing shape starts a new world.

**P-026: Replay recorder.**
The user's idea, borrowed from high-speed nature photography: hold the recent past so you never have to anticipate an event. With "Keep last 15 s" on, a new MediaRecorder starts every 5 s (7.5 s on touch devices) on an offscreen copy of the view (CRT and markers included, plus the sound mix), and old ones are dropped, so one encoder has always been running for 15–20 s. Record keeps that encoder and discards the rest; Stop finalizes it into one MP4 or WebM, offered through the viewer's download prompt (the `downloads` capability), or shown in a video player where that isn't available. Output is 1920 px wide or 1080² (1280 / 720² on touch). Each encoder writes a complete file, so no trimming or remuxing is needed, at the cost of the backlog being 15–20 s rather than exactly 15. In the port, a true ring buffer of encoded frames (keyframe every second) can make it exact.

**P-027: CRT rebuilt around a beam model.**
The user found the first CRT pass unconvincing. Causes: a faint mask (off-stripes only dimmed to 72%), fixed scanlines, math done on display values instead of linear light, and generic linear smoothing. The screen pass now works in linear light (gamma 2.2 in and out); each world row is a beam whose vertical gaussian widens with brightness (bright rows swell into the gaps, dim rows stay thin); cells blend horizontally with a gaussian spot; the phosphor mask is strong (off-channels at 18%, compensated after) with three layouts: Trinitron grille, TV slot (default) and monitor dots; slot breaks are aligned to scanline gaps to avoid beating; an unmasked glow is added after the mask. The mask is laid out in the picture's own curved cell coordinates with a whole number of triads per cell (one at the default size) and slot breaks on the row gaps; an earlier screen-pixel mask beat against the cell pitch and drifted off the rows toward the curved edges. Below about 3 screen pixels per cell the mask fades out. Note for the port: `flat` is a reserved word in GLSL ES and silently disabled the filter once.

**P-028: VCR layer, tied to the CRT view.**
The user asked for tape artifacts in the sound, only while CRT is on, plus anything that adds fidelity. Sound: a crossfaded tape path (band limits, head bump, saturation, wow and flutter, narrowed stereo, hiss, faint hum; see SOUND.md). Picture: a slight per-row timebase wobble, head-switching skew in the bottom rows, and dropouts every 8–30 s that tear a band of the picture and dip the sound at the same moment. All view and audio only; the simulation is untouched.

**P-029: Size in the full-screen controls; full-screen exit hardened again.**
Full-screen controls gained world size ◂ ▸ (starts a new world). The user still saw stuck screens after leaving full screen, which could not be reproduced here (four enter/exit cycles left the page clean and clickable). Hardening: the CRT's drawing buffer now resizes only after the on-screen size holds still for 8 frames, instead of every frame through a full-screen transition; old GPU buffers are deleted when the world size changes (they leaked before); a lost GPU context swaps in a fresh canvas instead of leaving a frozen picture; on exit the CRT buffer is rebuilt immediately at the new size.

**P-030: CRT on-screen menu.**
With CRT on in full screen, the controls become a 1990s-television on-screen menu: a blocky VT323 list in a translucent blue box, the selected row in inverse, ‹ › adjusters and a volume bar, plus a channel-style readout ("CH 00", fixed, and the GEN counter). It is drawn to its own canvas and composited in the CRT shader before the phosphor mask, so it gets the tube's curvature, scanlines and phosphors. Pointer hits are mapped through the same barrel curve (and the 90° turn on portrait screens); arrow keys and Enter work like a remote. The ordinary controls bar is hidden while it is active and returns when CRT is off. If the menu is awake during a recording, it is recorded too.

**P-031: Silent hotkeys.**
E forces an emergence and R starts or stops recording, without waking the controls or the on-screen menu, so they can be used mid-take. A blinking camcorder-style "● REC 0:00" tally shows while recording; it is a page overlay and never appears in the recorded video.

**P-032: The menu opens on M; movement shows a hint strip.**
In CRT full screen, moving the mouse or tapping no longer opens the menu box. It brings up a strip of green VCR lettering along the bottom (PLAY ▶, E EMERGE, R REC, M MENU, F EXIT), each entry clickable. The menu opens on M or its strip entry, closes on M, Esc, a click outside it, or after 10 s idle, like a television's. On touch screens the strip drops the key letters, uses larger lettering and wraps to two lines; the menu box widens to nearly the full screen width; and on an upright phone (picture turned 90°) all menu text is drawn turned back so it reads upright. Also fixed: the REC tally could show on pages without a global [hidden] rule.

**P-033: S for sound.**
S switches sound on or off without waking the controls, like E and R. The hint strip gains "S SOUND ON/OFF" (SOUND ON/OFF on touch screens).

**P-034: Dropouts off, gentler curvature; prototype signed off.**
The shared picture-and-sound tape dropouts were authentic but too distracting in practice, so they no longer fire (the code paths remain for a future "worn tape" setting). The tube's barrel curvature was reduced by about a third (0.055/0.075 → 0.035/0.05), with the pointer-mapping curve changed to match. The user considers the prototype ready to share.

**P-035: The hint strip doesn't move when states change.**
Toggling sound changed SOUND OFF to SOUND ON, and that one character decided whether the strip wrapped to a second line. Each entry now has a fixed slot sized for its longest wording (PAUSE/PLAY, REC/STOP, SOUND OFF/ON), with the text centred in it. With a keyboard the strip always stays on one line, shrinking its lettering to fit if needed; on touch screens it wraps at a stable point (three and three).

**D-036: Handoff v3 imported; the v3 prototype is the presentation reference (2026-10-04, human decisions by poll).**
The human evolved the prototype (v2, then v3) and supplied `culture-handoff_v3.zip`. Triage against the repo:
- **Byte-identical, so no impact on the canonical C++, the oracle or D-031:** `core.js`, all four goldens, `golden.js`, `compare.js`, SPEC, PORT_PLAN.
- **Changed:** the v3 presentation modules, BRIEF/README (decision range, module list) and SOUND.md (the tape path, portrait stereo mapping, a phone-clicks note), plus the 16 decisions above.
Decided:
- v3's `reference/` files go to **`reference/v3/`**, frozen and sha256-pinned, as the presentation reference for P2 and P3. `core.js` is not duplicated, since it is identical to `reference/core.js` (sha256 equal). v1 stays as the v0 snapshot.
- `docs/handoff/` BRIEF, README and SOUND are updated to the v3 packet as received (git keeps v1). One edit: SOUND.md's "see D-034" now reads P-034, and BRIEF/README's "D-001 to D-035" note the P-series.
- The packet's decisions are imported as P-020…P-035.
- The superseded local files are deleted after byte-identity checks: `culture_v2.html` (superseded by v3), `culture_v3.html` (= `reference/v3/culture.html`), `culture-handoff_v3.zip` (contents imported or identical), and the original `culture-handoff/` and `Culture.html` (v1, in git and tag `v0-js-parity`). Their `.gitignore` lines go too.
Next, by the same poll: bring v3's presentation to the dev viewer, over the canonical core.
