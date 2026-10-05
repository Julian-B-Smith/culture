# reference/v6 — the v6 prototype (presentation and sound reference)

From `culture-handoff_v6.zip` (2026-10-05, D-037). Open `culture.html` in a
browser: it is self-contained. Frozen and sha256-pinned. It supersedes v3.

- **Simulation:** v0 semantics plus **Spores**, i.e. `emergeAt` (SPEC §10,
  P-042/P-047). Its `core.js` is also optimized, with output bit-identical to
  v0 on the goldens. The canonical simulation is the C++ core (D-030, D-031),
  so this core is the reference for `emergeAt` only.
- **`tools/golden.js --inputs`** and **`golden/default-seed-7-inputs.jsonl`**:
  the replay format for input logs, produced with v0 semantics. This is a
  format specification, not a C++ oracle (D-037).
- **Presentation (P2):**
  - `ui.js`, `osd.js` (TV menu, sub-menus, SCOPES), `crt.js`, `recorder.js`;
  - `logo.js` (an opening logo; an embedded WebP, checked free of metadata);
  - `texture.js`.
- **Sound (P3 reference):** `sound.js`, `timbre.js`, `rhythm.js`,
  `drums.js`, `engines.js`. They use unseeded `Math.random`, which the port
  must replace with a seeded generator.
- **Decisions:** P-020…P-053 in `DECISIONS.md`.
