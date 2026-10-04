# reference/v3 — the v3 prototype (presentation reference)

From `culture-handoff_v3.zip` (2026-10-04, D-036). Open `culture.html` in a
browser: it is self-contained (all modules inline). Frozen and sha256-pinned.

- **Simulation:** identical to v0. The packet's `core.js` is byte-identical
  to `../core.js`, so it is not stored twice.
- **Presentation (new in v2–v3):**
  - `crt.js`: two-pass WebGL CRT (phosphor persistence, beam, mask, glow, curvature);
  - `osd.js`: a 1990s TV on-screen menu inside the CRT picture;
  - `recorder.js`: replay recorder with a 15 s pre-record buffer;
  - `sound.js`: adds the VHS tape path and phone-light audio;
  - `ui.js`: square worlds, Fit/Fill, portrait rotation, hotkeys E/R/S/M/F, a hint strip.
- **Decisions:** P-020…P-035 in `DECISIONS.md` (the packet's D-020…D-035, renumbered on import).
- **The canonical simulation is the C++ core (D-030).** This folder is the
  reference for how the world should LOOK and SOUND (ROADMAP P2, P3).
