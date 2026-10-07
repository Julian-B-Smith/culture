# Culture v6: notes for the C++ port (Julian-B-Smith/culture)

From the owner's prototype session, 2026-10-05. The port last imported handoff **v3** (its D-036, 2026-10-04, at commit 3386fa8). This packet is cumulative: it carries v4, v5 and v6, which are the packet's decisions **D-036 to D-053**. These notes override the BRIEF's fresh-start wording ("seed DECISIONS from this packet"). The repo already has its own log, so import this packet the way D-036 imported v3.

## 1. Numbering

The packet's D-036…D-053 collide with the repo's D-036 onward. Import them verbatim as **P-036…P-053**, beside P-020…P-035, and cite them as P-0nn in `docs/handoff/`.

## 2. What is byte-identical, and what is not

| Packet file | Against the repo | Meaning |
| --- | --- | --- |
| `golden/default-seed-1..3`, `stress-seed-4` | equal to `golden/js-v1/` | The JS oracle is unchanged. **Do not copy these over `golden/`**: those are the C++ goldens with D-031's semantics. |
| `tools/compare.js` | identical | nothing to do |
| `tools/golden.js` | changed | adds `--inputs run.json` (input-log replay); the default path is unchanged |
| `reference/core.js` | changed | see §3; this is the first import where the presentation reference's core differs from `reference/core.js`, so it needs its own pinned copy (e.g. `reference/v6/core.js`) |
| `golden/default-seed-7-inputs.jsonl`, `run-seed-7.json` | new | see §3 |
| SPEC | adds §10, Spores | the only semantic addition |
| PORT_PLAN | adds bullets to P2 (spores, menu, scopes, speed limit) and P3 (timbres, rhythm, a seeded generator for the sound layer) | |
| SOUND, BRIEF, README | large changes | timbres, rhythm, drums, stereo, tape switch |

## 3. The core: one addition, one optimization that doesn't matter here

- **Optimization (P-053).** The JS step loops were rewritten for speed with bit-identical output (all JS goldens pass). It has no meaning for the C++ core, which is already about 6× faster than the optimized JS. Ignore it.
- **Spores (P-042, P-047, SPEC §10).** One new public entry point, `emergeAt(x, y, p)`: wrap x and y onto the torus and, when no search or retreat is running, call the existing private `emerge(site, lastMax, p, nullptr, -1)`. That's all the core gains. The budget (900 generations between spent emergences, shared with forced emergence, refunded when a search finds nothing), the Spores switch, the `byUser` mark and the hint are shell state, not `World` state.
  - **No existing trace changes,** because nothing calls `emergeAt` without input. Existing goldens and deep goldens should not move.
  - **The input-log golden is NOT a C++ oracle.** `default-seed-7-inputs.jsonl` was produced by the frozen JS semantics (v0). The C++ core runs SPEC + D-031 (retreat to previous owner, wrapped surprise windows, serial-keyed cooldowns), so the C++ run of the same log will differ after the first retreat or edge-band birth. Treat that file as a **specification of the replay format**: inputs applied when the world reaches their generation, before the next `step()`, with instant search, and refused inputs recorded as `{ input, refused: true }`. Then generate and pin a C++ input-log golden for both cores, in the repo's own process.
  - Per the repo's invariants, `emergeAt` lands in `core/` and `core/ref/` in the same commit, and `culture_trace` gains the `--inputs` option.
  - **Identity:** mark user-made tiers by birth serial (D-031 #8), not index.

## 4. P3 (sound, the current phase): the reference has moved

The dev viewer plays the frozen **v0** engine (D-033). The owner's ear has since moved to a much larger v6 sound layer: timbre classes, a shared tempo field, the rhythm layer with a conductor, a lead kick on a ducked sub bus, ear-model stereo, and a separate VHS switch (SOUND.md; P-043 to P-046, P-050). If the human's by-ear sign-off is to mean anything, it should be against v6. Worth a decision at the P3 gate.

The v6 sound modules use unseeded `Math.random` in about 40 places (sound, timbre, rhythm, drums, engines). P3's acceptance requires an offline render of a fixed seed to be bit-reproducible. The port therefore needs a seeded generator for the sound layer, separate from the core's mulberry32, so that sound never consumes the core's RNG (PORT_PLAN P3).

## 5. Presentation only (P2 material)

P-036 to P-041: opening title and logo, CRT on by default, sound on the first Enter, full-resolution recordings. P-048 to P-052: the menu fits short screens, the website's fixes merged in, sub-menus, SCOPES pages with a dimmed picture. P-053's speed cap measures the device and is a browser concern; the C++ viewer can decide its own.

**`SITE-NOTES-v6.md` is for the website agent.** Nothing in it applies here.
