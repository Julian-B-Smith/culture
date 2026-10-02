# ROADMAP — Culture

Single source of truth. Only the lead session (or the human) edits this file.
State lives here; conversations are ephemeral. Phase detail and rationale:
[docs/handoff/PORT_PLAN.md](docs/handoff/PORT_PLAN.md) (this file wins on conflict).

## Status

- **Phase:** P4 — decide the quirks (current, chosen 2026-10-02). Done: P0, P1, PA0 (all 2026-10-02). P2 waits on the render-stack decision; PE1 is ready and independent.
- **Oracle (C++ canonical since D-030):**
  - **What the gates check:** pinned C++ goldens and deep goldens, run for
    both the optimized core and the frozen naive `core/ref`; vectors and trig
    against pinned values; determinism and never-repeat properties; the
    440×280 bench in `full`.
  - **Cross-toolchain:** CI checks the same pins on Linux/GCC.
  - **Gap:** the oracle now proves "no unintended change", not "matches a spec
    written independently"; intended changes are DECISIONS entries with
    re-pinned goldens.
- **Last human ratification:** 2026-10-01 — spin-up manifest ratified by poll.

## Invariants under active protection

See CLAUDE.md §Domain. At risk during P1: RNG call order, float32
store-rounding, SPEC §8 quirks (port faithfully, decide in P4).

## Phases

Each phase closes when `./verify full` is green **and** its acceptance criteria
hold **and** a `traces/` entry is written.

### PA0 — Prior-art landscape (Decision 30 bookend)
- **Status:** done 2026-10-02, judged complete by the human (trace: traces/2026-10-02-pa0-prior-art.md; result: docs/prior-art.md; adoptions: D-029)
- **Acceptance:** `docs/prior-art.md`, dated and cited, covering: Life-like rule
  spaces and rule-changing CAs, open-ended evolution in CA (Lenia, Flow-Lenia,
  Evoloops), causal emergence / effective information (Hoel) and coarse-graining
  CAs, CA sonification. Each entry says how Culture differs or what it borrows.
- **Shape:** fan-out read-only research subagents (rung 2), lead synthesizes.

### P0 — Harness
- **Status:** done (trace: traces/2026-10-02-p0-close.md)
- **Acceptance:**
  1. The reference runs headless and the goldens regenerate byte-identically:
     `./verify full` green locally. ✅ 2026-10-01
  2. The compare tool runs and demonstrably fires: `compare_selftest` in `fast`. ✅
  3. The same `./verify fast` is green in GitHub Actions on the first push/PR. ✅ 2026-10-02, run 36959155390 (Linux, Node v24.21.0)
- **Out of scope:** any C++.

### P1 — Headless core, bit-exact
- **Status:** done 2026-10-02 (trace: traces/2026-10-02-p1-core.md)
- **Scope:** `core/` (libculture), `trace/` CLI, unit tests, CMake.
- **Build order:** RNG+hash → screen+growth → life update+noise → territory →
  surprise → search+placement → extinction+retreat → crowding+reign →
  sparks+mutation (PORT_PLAN P1). Unit tests per component; screening functions
  cross-checked against JS with a `node -e` harness.
- **Acceptance:**
  1. All four goldens (`default-seed-1..3`, `stress-seed-4`) PASS
     `tools/compare.js` for full length including the births footer — wired
     into `./verify full`; default-seed-1 also in `fast`. ✅ with
     `--float-rel 0`, plus deep hidden-state parity (D-025, D-028).
  2. A 440×280 world steps in < 4 ms in a Release build (reference ≈ 12 ms),
     measured by a bench target recorded in the trace. ✅ 2.0–2.2 ms mean
     (`cpp_bench`, seeds 1–3, 4,000 steps, search excluded).
  3. Any transcendental-function divergence is fixed at the cause; a platform
     libm difference is recorded in DECISIONS with evidence. Integer checks are
     never loosened. ✅ trig vendored as explicit-fma fdlibm (D-027);
     pow and log2 measured equal to V8 at the precision the core uses.

### P2 — Viewer
- **Status:** blocked on the render-stack decision (P1 done)
- **Carried from the P1 review:** the 60 fps budget is a frame budget, so judge
  the step's tail, not its mean: at 440×280 p99 is 2.6–4.0 ms but single steps
  reach 5–60 ms (retreat and birth generations), and an instant search can
  take 74–274 ms (critic). That is the case for the worker thread and
  deterministic latency L = 30. `World` state is public and mutable; give the
  UI and audio a read-only snapshot rather than the `World` itself.
- **Blocking open question (ask the human at the gate):** rendering/windowing
  stack (SDL3, sokol, JUCE, raylib, …) — decide after a small spike (D-021).
- **Acceptance:** PORT_PLAN P2 — all prototype controls and views; search timing
  selectable (instant / deterministic L=30 default / sliced); side by side with
  `reference/culture.html` at the same seed in instant mode shows the same
  world; 550×350 at 60 fps at 1×.

### P3 — Sound
- **Status:** blocked on P2
- **Blocking open questions:** audio stack; whether Reverb Station's FDN
  replaces the convolution reverb (that would mean an intake brief).
- **Acceptance:** PORT_PLAN P3 — 10-minute run at 10 voices with no clicks or
  dropouts; offline render of a fixed seed is bit-reproducible; **human signs
  off by ear** on register spread and riser level.

### P4 — Decide the quirks ← current
- **Status:** in progress (each item is a human call)
- **Agenda:**
  1. The ten SPEC §8 quirks.
  2. The rule-screen review (D-029, docs/prior-art.md recommendation 2):
     - exclude B2 rules alongside B1?
     - treat a rule's on/off complement as already used?
     - add Eppstein's growth/decay pre-screen?
     - calibrate the acceptance window against Yin 2026's census of all
       262,144 rules.
     Reia & Kinouchi's "border of extinction" reading of Life is input here.
  Decide both together: any change regenerates the goldens, and one
  regeneration beats two.
- **Acceptance:** each agenda item kept (documented) or changed (new DECISIONS
  entry, goldens regenerated and re-pinned). DECISIONS records which
  implementation (JS or C++) is canonical from then on.

### P5 — Synthesis: recursive coarse-graining (chosen priority, D-021)
- **Status:** blocked on P4 (PA0 done)
- **Design basis (D-029, docs/prior-art.md §3):** Rosas, Mediano et al. 2020 Ψ,
  per 8×8 block, over a quantized block feature (start with live-cell count in
  8–16 bins), from plug-in counts. Deterministic, counts and logs only. Read Sas
  et al. 2025 (bias-corrected estimators) before implementing.
- **Acceptance (first slice):**
  1. Ψ per block computed in a pure, deterministic module, reproducible from the
     seed. Shown as a heatmap and called "block predictability gain", never
     "causal" (D-029 wording rule).
  2. A seeded shuffle null baseline per block. Only blocks above the null count.
     This guards against the upward bias of sparse plug-in estimates.
  3. Offline validation against an independent structure detector (Rupe &
     Crutchfield local causal states, or Lizier local transfer entropy), with a
     recorded finding on whether high-Ψ blocks coincide with forming tiers.
     Until that finding exists, the measure triggers nothing.
- **Later slices, specified at their gates:** autonomy-triggered emergence. The
  new layer's rule is a modal lookup table (block state → most frequent next
  state) built from the counts already held, admitted only when Israeli &
  Goldenfeld's closure test passes.

### PE1 — Measure open-endedness (Layer-E)
- **Status:** open (ready; independent of P2–P5)
- **Why (D-029):** "rules never repeat" is guaranteed by construction; whether
  the world is open-ended is a measured hallmark (Taylor et al. 2016). Never
  conflate the two.
- **Acceptance:**
  1. Bedau–Packard evolutionary activity statistics over the tier lineage
     (components = tiers; activity = persistence-weighted territory): new and
     cumulative activity, diversity, mean activity.
  2. A deterministic offline tool runs them for a fixed seed set.
  3. A report characterizes runs as accumulating vs merely churning.
  Measured, never a `./verify` gate (Layer-E). MODES metrics are the next step
  if activity alone is inconclusive.

### PA1 — Pre-ship prior-art & IP re-scan (Decision 30 bookend)
- **Status:** blocked (before any public release or binary distribution)
- **Acceptance:** `docs/prior-art.md` updated, plus a patent/IP landscape pass.
  Note: the repo is public from day one, so the code itself is already
  disclosed (D-021).

### PD1 — Portable log2 (D-032 follow-up)
- **Status:** open (ready; small)
- **Why:** `std::log2` is the last platform libm call in the core. A 1-ulp
  double difference between libms can, rarely, survive the float32 store and
  make two platforms diverge over very long runs.
- **Acceptance:** a correctly rounded log2 (e.g. CORE-MATH) in the core; its
  outputs proven equal to the goldens and deep goldens (no re-pin needed, or
  a recorded decision if some differ); `std::log2` gone from `core/`
  (grep-gated).

### Backlog (unprioritized; the human orders these)
WebAssembly build of libculture for a web viewer that runs the ONE canonical
core (D-030; the JS prototype is frozen); scanner sound / instrument mode (tempo, scale quantization, MIDI/OSC); branching
history (tree of world states); recording and export; presets; GPU compute for
very large worlds; other form factors (plugin, FOUNDATIONS module).

## Graduation criteria

Infrastructure (P0, P1, P4 mechanics) is agent-queue work: the goldens decide.
Still in the judgment column: the render/audio stack choices, by-ear sound
sign-off (P3), each quirk's keep/change call (P4), and whether a P5 autonomy
heatmap is meaningful.
