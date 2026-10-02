# Culture

A cellular automaton in which **natures succeed one another**, the way
cultures grow, compete and give way in a dish. It starts as Conway's Life.
When the frontier ruleset produces a configuration more improbable than
anything in its own history, a new Life-like rule is derived from that
configuration and spreads across the torus, contesting ground with what came
before. It never reuses a rule. Color families react to each other, long reigns
mutate, crowding slows things down, borders harden, sites remember harm, and an
ambient sonification makes each ruleset a voice.

*Last verified: 2026-10-02 — `./verify full` green. The C++ simulation matches the JS reference bit for bit: all four goldens, plus every per-site array, internal scalar and sound statistic each generation (sound-stat trig checked against node's Apple Silicon V8 build, D-027). 2.0–2.2 ms/step at 440×280.*

## Try it

Open [reference/culture.html](reference/culture.html) in a browser. That is the
working prototype; the native viewer does not exist yet.

Headless C++ core (macOS Command Line Tools or Linux, CMake >= 3.20):

```bash
cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release && cmake --build build
```

Then `build/culture_trace --out /tmp 1` writes a golden-format trace, and
`build/culture_trace --bench 440x280 --gens 4000` times the step.

## Status

| Part | State |
|---|---|
| JS reference (`reference/`) | ✅ working prototype; normative for the port |
| Golden traces (`golden/`) | ✅ 4 traces, sha256-pinned, regenerate byte-identically |
| C++ core `libculture` + trace CLI | ✅ bit-exact with the reference (P1); 2.0–2.2 ms/step at 440×280 (mean, Apple Silicon, Release) |
| Native viewer | ⏳ not built; render stack undecided (P2) |
| Native sound | ⏳ not built; audio stack undecided (P3) |
| Coarse-graining synthesis | ⏳ research goal (P5) |

Current phase and acceptance criteria: [ROADMAP.md](ROADMAP.md).

## Map

| Path | What |
|---|---|
| `reference/` | browser prototype: `core.js` (deterministic sim), `sound.js`, `ui.js`, `culture.html` (all-in-one) |
| `golden/` | golden traces + `PINS.sha256` (protected) |
| `tools/` | `golden.js` (regenerate traces), `compare.js` (check a port trace) |
| `core/` | `libculture`: the C++ port of `reference/core.js` |
| `trace/` | `culture_trace`: trace writer, `--bench`, `--deep` |
| `tests/` | JS-vs-C++ unit vectors, trig check, the deep-state tracer |
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
