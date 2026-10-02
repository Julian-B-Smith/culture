# Culture

A cellular automaton in which **natures succeed one another**, the way
cultures grow, compete and give way in a dish. It starts as Conway's Life.
When the frontier ruleset produces a configuration more improbable than
anything in its own history, a new Life-like rule is derived from that
configuration and spreads across the torus, contesting ground with what came
before. It never reuses a rule. Color families react to each other, long reigns
mutate, crowding slows things down, borders harden, sites remember harm, and an
ambient sonification makes each ruleset a voice.

*Last verified: 2026-10-01 — `./verify full` green (reference + goldens only; no C++ yet).*

## Try it

Open [reference/culture.html](reference/culture.html) in a browser. That is the
working prototype and, for now, the whole product.

## Status

| Part | State |
|---|---|
| JS reference (`reference/`) | ✅ working prototype; normative for the port |
| Golden traces (`golden/`) | ✅ 4 traces, sha256-pinned, regenerate byte-identically |
| C++ core `libculture` + trace CLI | ⏳ not built (ROADMAP P1) |
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

Needs Node >= 18 and `shasum`. See CLAUDE.md §Domain for what each target runs.
