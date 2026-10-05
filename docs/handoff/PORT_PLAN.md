# Port plan: Culture → C++

The phases are gated: each phase ends when its `./verify` gate is green **and** its acceptance criteria are met. The architecture recommendations below are defaults. Confirm or override them in the spin-up survey (see BRIEF.md, "Open questions").

## Target architecture (recommended)

```
culture/
  core/      # libculture: pure C++20, no dependencies, no clock, no threads, no I/O
  trace/     # headless CLI: runs seeds, writes golden-format JSONL
  audio/     # sonification engine; reads core snapshots, never writes
  app/       # shell: window, renderer, controls, audio device
  reference/ # the JS prototype, kept runnable as the oracle
  golden/    # traces from the reference
  tools/     # golden.js, compare.js
```

- **The core is a library with an explicit step API.** It owns `World`, `step(params) → Event?` and `work(params, maxCandidates) → Event?`. It produces a read-only per-generation snapshot: per-tier stats plus the scalars the UI and audio need.
- **Determinism is non-negotiable.** Seeded mulberry32, the same RNG call order as the reference, float32 exactly where the reference uses it (SPEC §1), and no wall-clock time anywhere in `core/`.
- **Threading.** The simulation runs on its own thread. The rule search runs on a worker in **deterministic-latency** mode: its result is applied at exactly `trigger gen + L`, and the simulation blocks if the result isn't ready. Instant mode (L = 0, synchronous) must also exist, for verification. The UI and audio consume snapshots through a lock-free single-producer/single-consumer queue or a triple buffer.
- **Rendering.** Upload the alive and tier grids as textures and color them in a fragment shader (palette lookup by tier → family hue). That leaves headroom for much larger worlds.
- **Audio.** Port SOUND.md onto the audio stack chosen at spin-up. Keep it a pure consumer of snapshots.

## Phase 0: Harness

- Repository scaffolding via `/spinup`. Use this packet as the brief and seed `DECISIONS.md` from the packet's log.
- `./verify fast`:
  - reference self-check: `node tools/golden.js --profile default --out <tmp> 1` reproduces `golden/default-seed-1.jsonl` byte for byte. Never regenerate into `golden/` except by a recorded decision
  - unit tests
- `./verify full`: adds all port traces compared against all goldens with `tools/compare.js`.
- **Accept when:** the reference runs headless in CI; the goldens regenerate byte-identically; the compare tool runs.

## Phase 1: Headless core, bit-exact

Port `reference/core.js` to `core/`, building it up in this order:
1. RNG and hash
2. `screen` and `growth`
3. life update and noise
4. territory
5. surprise
6. search and placement
7. extinction and retreat
8. crowding and reign
9. sparks and mutation

Add unit tests per component. Both screening functions are pure given an RNG state, so they can be tested against the JS directly with a small `node -e` harness.

- `trace/` CLI writes the same JSONL format as `tools/golden.js`, including the footer.
- **Accept when:**
  - all four golden traces (`default-seed-1..3`, `stress-seed-4`) PASS `tools/compare.js` for their full length, including the births footer
  - a 440×280 world steps at under 4 ms in a release build. The reference takes about 12 ms; see "Performance" below
- If exact parity breaks on a transcendental function (`log2`, `pow`, `cos`): the record/lastMax comparison has a relative tolerance, but integer fields must still match. Fix the cause; never loosen the integer checks. If the cause is a platform libm difference, record it in DECISIONS with the evidence.

## Phase 2: Viewer

- Spores (SPEC §10): pointer to cell through rotation and the CRT curvature, the shared budget, the readout, the Spores switch and the input log.
- The television menu as the one control surface in full screen, CRT or flat, with its sub-menus and SCOPES pages (P-049, P-051, P-052), and a speed limit measured on the device (P-053).

- A window rendering Life and Memory views; birth rings, the search ring, and the markers toggle; the lineage panel; the surprise / quiet / reign meters; every control from the prototype (sizes, speeds ¼×–12×, crowding, mutation, spark, borders and memory, reactions); full screen with an auto-hiding HUD.
- Search-timing mode is selectable: instant, deterministic latency (default L ≈ 30 generations), or sliced (prototype feel).
- **Accept when:** side by side with `reference/culture.html` at the same seed and instant mode, the viewer shows the same world; a 550×350 world runs at 60 fps at 1×.

## Phase 3: Sound

- Port SOUND.md, including timbres and rhythm. Same mappings and gestures; seeded reverb impulse and noise, and a seeded generator for the sound layer's randomness (flicker, jitter, slicing, the conductor).
- **Accept when:** a 10-minute run has no clicks or dropouts at 10 voices; an offline render of a fixed seed is bit-reproducible; and the user signs off by ear on register spread and riser level (both untuned in the prototype).

## Phase 4: Decide the quirks

Go through SPEC §8 with the user. Each quirk is either kept (and documented) or changed in a new DECISIONS entry. Any change regenerates the goldens from the reference updated to match, or from the C++ core once it becomes the new reference. Record which one is canonical.

## Phase 5 and beyond: Toward the synthesis

The original goal (DECISIONS D-001) is **recursive coarse-graining**:
1. Monitor block-level (for example 8×8) dynamics.
2. Measure when a block's future is predictable from block-level information alone (effective information / causal emergence).
3. Show it first as a heatmap over the world, and check whether "autonomy" lights up where tiers form.
4. Then let autonomy, not just rarity, trigger emergence. The new layer's cells are the blocks, and its rule is learned from their observed behavior. This removes the finite Life-like rule-space ceiling (D-003).

Other candidates, to be prioritized by the user:
- the scanner sound layer and an instrument mode (tempo, scale quantization, MIDI/OSC out)
- recording and export
- branching history: a tree of world states (the user's standing principle)
- presets
- GPU compute for very large worlds

## Performance notes

Per-step cost in the JS reference at 220×140 is about 3.5 ms. Where it goes:
- three full-grid passes with modulo neighbor indexing
- the per-tier T×T tables rebuilt every step
- the 4,000-draw mutation site search

Cheap wins in C++:
- padded grids or precomputed wrap indices instead of `%`
- rebuilding `canPush` and `sparks` only when tiers change. Note: `sparks` depends on `gen` and `frontierAge`, so recompute the readiness part every step.
- SIMD neighbor counts

None of these may change results; the golden traces are the guard.
