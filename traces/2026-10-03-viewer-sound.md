# viewer-sound — the dev viewer plays the v0 sound engine, fed by C++

- **Queue item:** ROADMAP P3 (first step, listening), D-033.
- **Why:** the human asked why there was no sound. Audio had not been ported; the human chose interim viewer sound now and P3 next, with the stack chosen by ear.
- **Evidence consulted:** reference/sound.js (every world field it reads: stats, tier lineage, scalars; voices keyed by object identity); SOUND.md; ROADMAP P3.
- **What changed:**
  - `viewer/stream.cpp`: frame v2, with lineage, hash, origin, per-tier stats and sound scalars.
  - `viewer/server.js`: serves `reference/sound.js` unmodified.
  - `viewer/index.html`: v2 parser, a serial-keyed tier-object adapter, Sound/Volume controls, pause suspends audio.
  - Docs: D-033, ROADMAP P3 current (no longer blocked on P2), viewer README.
- **Checked in the browser pane:** audio context running; 5 voices; output RMS 0.046 through an analyser on the master bus; pitches 65.4 / 66.0 / 65.8 / 79.5 Hz match the engine's just-intonation walk; pause suspends and resume restores audio; no console errors besides expected aborted-stream messages.
- **Alternatives rejected:** porting sound.js changes into the frozen file (it is pinned and frozen, D-030); starting P3 before listening (the human chose to decide the stack by ear).
- **Verify:** `./verify fast` exit 0 before commit.
- **Open questions:** the audio stack (P3 gate). The by-ear judgement cannot be made from the pane: the human must listen.
