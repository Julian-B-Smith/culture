# CODEMAP — Culture

Where things are. The project map (reference, goldens, tools, packet docs)
lives in [README.md §Map](README.md#map); this file adds the harness.

- `CLAUDE.md`: charter (invariant harness layer + §Domain + knowledge loop).
- `ROADMAP.md`: phase-gated plan; the single source of task state.
- `DECISIONS.md`: append-only log; D-001…D-019 from the prototype, D-020+ from spin-up on.
- `INDEX.md` / `LIBRARY.md`: knowledge loop.
- `verify`: the oracle (`./verify fast|full|report`). `.kit/`: vendored kit gates (do not edit).
- `golden/PINS.sha256`: sha256 pins over every oracle file (C++ and deep goldens, expected outputs, the frozen JS set), checked by `golden_pin_gate`.
- `project.manifest.json`: spin-up survey answers.
- `traces/`: one entry per merged change.
- `.claude/`: hooks, agents (implementer=sonnet, verifier=haiku, critic=opus), provenance skill.
- `.github/workflows/ci.yml`: runs `./verify fast` on Linux.
- `core/` (canonical) + `core/ref/` (frozen naive oracle), `trace/`, `tests/`, `analysis/`, `CMakeLists.txt`; see README §Map. C++ is canonical since D-030.
- Planned (P2+): `audio/`, `app/` per docs/handoff/PORT_PLAN.md.
