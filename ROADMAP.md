# ROADMAP — Culture

Single source of truth. Only the lead session (or the human) edits this file.
State lives here; conversations are ephemeral. Phase detail and rationale:
[docs/handoff/PORT_PLAN.md](docs/handoff/PORT_PLAN.md) (this file wins on conflict).

## Status

- **Phase:** PA0 — prior-art landscape (current, chosen 2026-10-02). P1 closed and merged 2026-10-02 (trace: traces/2026-10-02-p1-core.md). P4 (quirks) is also ready; P2 waits on the render-stack decision.
- **Oracle:** `fast` = kit gates, structure, golden sha256 pins, compare.js
  self-test with a planted divergence, reference regenerates default-seed-1
  byte-identically, C++ build + JS-vs-C++ vectors + fdlibm trig + C++
  default-seed-1 vs golden + deep hidden-state parity (default 1, chaos 7).
  `full` = fast + all four goldens (reference and C++) + deep parity on all
  + chaos 11 + 440×280 bench. **Gap:** CI's node is the plain fdlibm flavor,
  so there the JS-side trig check and trig stats in the deep line are n/a
  (visible in the output, D-027); everything else runs on both platforms.
- **Last human ratification:** 2026-10-01 — spin-up manifest ratified by poll.

## Invariants under active protection

See CLAUDE.md §Domain. At risk during P1: RNG call order, float32
store-rounding, SPEC §8 quirks (port faithfully, decide in P4).

## Phases

Each phase closes when `./verify full` is green **and** its acceptance criteria
hold **and** a `traces/` entry is written.

### PA0 — Prior-art landscape (Decision 30 bookend) ← current
- **Status:** in progress (must close before P5 design is committed)
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

### P4 — Decide the quirks
- **Status:** open (ready; each quirk is a human call)
- **Acceptance:** each SPEC §8 quirk kept (documented) or changed (new DECISIONS
  entry, goldens regenerated and re-pinned). DECISIONS records which
  implementation (JS or C++) is canonical from then on.

### P5 — Synthesis: recursive coarse-graining (chosen priority, D-021)
- **Status:** blocked on P4 and PA0
- **Acceptance (first slice):** block-level (e.g. 8×8) autonomy measure
  (effective information / causal emergence) computed deterministically and
  shown as a heatmap; a recorded finding on whether autonomy lights up where
  tiers form. Autonomy-triggered emergence and learned layer rules are later
  slices, specified at the P5 gate.

### PA1 — Pre-ship prior-art & IP re-scan (Decision 30 bookend)
- **Status:** blocked (before any public release or binary distribution)
- **Acceptance:** `docs/prior-art.md` updated, plus a patent/IP landscape pass.
  Note: the repo is public from day one, so the code itself is already
  disclosed (D-021).

### Backlog (unprioritized; the human orders these)
Scanner sound / instrument mode (tempo, scale quantization, MIDI/OSC); branching
history (tree of world states); recording and export; presets; GPU compute for
very large worlds; other form factors (plugin, FOUNDATIONS module).

## Graduation criteria

Infrastructure (P0, P1, P4 mechanics) is agent-queue work: the goldens decide.
Still in the judgment column: the render/audio stack choices, by-ear sound
sign-off (P3), each quirk's keep/change call (P4), and whether a P5 autonomy
heatmap is meaningful.
