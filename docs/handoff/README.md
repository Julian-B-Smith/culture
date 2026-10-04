# Culture: handoff packet

This packet hands the Culture prototype to Claude Code for a C++ port and onward development.

## Start here

1. Read **BRIEF.md**: what the project is, where it stands, and the open questions for spin-up.
2. Read **SPEC.md**: the simulation, step by step. `reference/core.js` is normative.
3. Read **DECISIONS.md**: the design history, including what was tried and rejected.
4. Read **PORT_PLAN.md**: phased plan, acceptance criteria and verify gates.
5. Read **SOUND.md**: the sonification spec.

## Contents

```
README.md          this file, including the kickoff prompt
BRIEF.md           vision, current state, spin-up questions, ground rules
SPEC.md            exact simulation spec, parameters, RNG order, known quirks
SOUND.md           sonification spec and port notes
DECISIONS.md       seed decision log D-001 … D-019; prototype decisions P-020 … P-035 (renumbered on import, D-036)
PORT_PLAN.md       phases 0–5 with acceptance criteria
reference/
  culture.html     the full browser prototype, one self-contained file; open it in a browser
  core.js          deterministic simulation core (Node-loadable: require('./core.js'))
  sound.js         Web Audio sonification
  recorder.js      replay recorder: rolling encoders so Record can start 15–20 s in the past
  crt.js           optional CRT look: two-pass WebGL filter (phosphor persistence; then beam, phosphor mask, glow, curvature)
  osd.js           on-screen television menu, drawn into the CRT picture in full screen
  ui.js            browser shell
tools/
  golden.js        regenerate golden traces:  node tools/golden.js [--profile default|stress] [--out dir] [seed…]
  compare.js       check a port trace:         node tools/compare.js golden/<file>.jsonl <port>.jsonl
golden/
  default-seed-{1,2,3}.jsonl   3,000 gens each, prototype defaults, instant search
  stress-seed-4.jsonl          5,000 gens; sparks and mutation up, no crowding brake.
                               Covers surprise, spark and mutation births, extinction and retreat
```

Trace format: one header line (params, size, seed), then one line per generation, then a footer listing every birth. Each generation line holds FNV-1a hashes of the alive and tier grids, tier counts, frontier, active, record, lastMax, the per-tier cell counts, and any events.

Requirements: Node 18 or later for the tools. There are no npm dependencies.

## Kickoff prompt for Claude Code

> This folder is a handoff packet for **Culture**, an open-ended cellular automaton with an ambient sonification, prototyped in the browser. Read README.md, BRIEF.md, SPEC.md, DECISIONS.md, PORT_PLAN.md and SOUND.md in that order. Then run the spin-up survey for a new project, using BRIEF.md's open questions as additional survey items, and wait for my answers before scaffolding. When scaffolding: copy `reference/`, `tools/` and `golden/` into the new repo unchanged; seed DECISIONS.md from the packet's log; and make phase 0 of PORT_PLAN.md the first roadmap phase. Treat `reference/core.js` as normative and the golden traces as the oracle. Do not regenerate or edit anything in `golden/` without a recorded decision.

## Facts worth knowing up front

- The world is a **torus**.
- **Float32 vs. float64 matters** for parity (SPEC §1).
- **RNG call order is part of the contract** (SPEC §2).
- The golden traces use **instant search**, where a birth lands in the same generation as its trigger. The browser uses sliced search, so a browser run will not match a golden trace frame for frame.
- SPEC §8 lists ten **known quirks**. Port them faithfully first, then decide on each with the user.
