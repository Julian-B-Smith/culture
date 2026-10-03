# Culture

A cellular automaton in which **natures succeed one another**, the way
cultures grow, compete and give way in a dish. It starts as Conway's Life.
When the frontier ruleset produces a configuration more improbable than
anything in its own history, a new Life-like rule is derived from that
configuration and spreads across the torus, contesting ground with what came
before. It never reuses a rule. Color families react to each other, long reigns
mutate, crowding slows things down, borders harden, sites remember harm, and an
ambient sonification makes each ruleset a voice.

*Last verified: 2026-10-02 — `./verify full` green. The C++ core is canonical (D-030). At the hand-over (tag `v0-js-parity`) it was proven bit-identical to the JS prototype, and its goldens now pin every hidden value each generation. 2.0–2.2 ms/step at 440×280.*

## Try it

Open [reference/culture.html](reference/culture.html) in a browser. That is the
original prototype, frozen at v0. The C++ core is canonical now and will diverge
from it as decisions land (D-030). A WebAssembly web build of the real core is
in the backlog; the native viewer does not exist yet.

Headless C++ core (macOS Command Line Tools or Linux, CMake >= 3.20):

```bash
cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release && cmake --build build
```

Then `build/culture_trace --out /tmp 1` writes a golden-format trace, and
`build/culture_trace --bench 440x280 --gens 4000` times the step.

**Watch the canonical core run** (dev visualizer, [viewer/README.md](viewer/README.md)):

```bash
cmake --build build --target culture_stream && node viewer/server.js
```

then open http://localhost:5180.

## Status

| Part | State |
|---|---|
| C++ core `libculture` + trace CLI | ✅ **canonical** (D-030); 2.0–2.2 ms/step at 440×280 (mean, Apple Silicon, Release) |
| `core/ref/` naive core | ✅ frozen; every optimized core must match it bit for bit |
| Golden traces (`golden/`, `golden/deep/`) | ✅ written by C++, sha256-pinned; deep goldens cover all hidden state |
| JS prototype (`reference/`) | 🧊 frozen at `v0-js-parity`; goldens archived in `golden/js-v1/` |
| Native viewer | ⏳ not built; render stack undecided (P2) |
| Native sound | ⏳ not built; audio stack undecided (P3) |
| Coarse-graining synthesis | ⏳ research goal (P5) |

Current phase and acceptance criteria: [ROADMAP.md](ROADMAP.md).

## Map

| Path | What |
|---|---|
| `reference/` | frozen v0 browser prototype: `core.js`, `sound.js`, `ui.js`, `culture.html` |
| `core/` | `libculture`, the canonical simulation; `core/ref/` is the frozen naive core |
| `golden/` | C++ golden traces, `deep/` hidden-state goldens, `js-v1/` archived JS goldens, `PINS.sha256` (protected) |
| `tools/` | `compare.js` (check a trace against a golden); `golden.js` (frozen JS generator) |
| `trace/` | `culture_trace`: trace writer, `--bench`, `--deep [--core ref]` |
| `tests/` | pinned vectors and trig, property tests; `js/` holds the frozen hand-over tools |
| `viewer/` | dev visualizer: `culture_stream` + `server.js` + a canvas page (not the P2 viewer) |
| `docs/handoff/` | the packet as received: BRIEF, SPEC, SOUND, PORT_PLAN |
| `DECISIONS.md` | append-only design log, D-001 onward |
| `ROADMAP.md` | phases and gates; outranks every other doc |
| `CLAUDE.md` | agent charter; §Domain lists the invariants |
| `INDEX.md` / `LIBRARY.md` | knowledge loop (durable lessons) |
| `traces/` | one entry per merged change |
| `verify` | the oracle: `./verify fast` / `full` / `report` |

## Oracle

```bash
./verify fast
```

Needs Node >= 18, CMake >= 3.20, a C++20 compiler and `shasum`. See CLAUDE.md §Domain for what each target runs.
