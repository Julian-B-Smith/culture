# viewer — dev visualizer for the canonical core

A browser view of the C++ core as it runs: `culture_stream` steps a World and
writes binary frames; `server.js` (Node built-ins only) relays them to a canvas
page. It shows exactly what libculture does, current DECISIONS included. The
frozen v0 prototype (`reference/culture.html`) shows the old JS semantics.

**This is a dev tool, not the P2 viewer.** P2's render and audio stacks are
still the human's decision (ROADMAP P2).

**Sound** (button; browsers only start audio from a click): the frozen v0
engine, `reference/sound.js`, served unmodified and fed by the C++ core
through an adapter in `index.html` (D-033). It is a listening reference for
P3, not P3: Web Audio, unseeded reverb impulse and noise, no reproducible
render. Pause suspends it too.

## Run

```bash
cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build --target culture_stream
node viewer/server.js
```

Then open http://localhost:5180. In Claude Code the dev server is the `viewer`
entry of `.claude/launch.json`.

## Controls

- **seed / size / profile:** which world. The same seed, size, profile and
  search mode give the same world every time. Changing any of them restarts.
- **speed:** generations per frame at 30 fps.
- **search:**
  - **sliced** runs `work(p, 8)` once per generation: smooth.
  - **instant** finishes each rule search inside its generation, as the goldens
    do. A birth can stall a frame at large sizes.
  - Sliced births land a few generations later than instant ones, so the two
    modes are different (equally deterministic) worlds.
- **view:** *life* shows live cells bright on their tier's dark ground;
  *territory* shows ownership only.
- **Full screen** (button or `F`; `F` or `Esc` exits): the world alone, as
  large as it fits, with a HUD (gen, tiers) that fades when the mouse is idle.
  Where a host refuses real full screen or never completes the request (seen
  in the Claude browser pane), an in-page mode fills the window instead.
- **Space** pauses and resumes.
- The side panel stays put: the tier list and the event log each scroll in
  their own box, so a long run with dozens of tiers never pushes the controls
  out of sight. The tier box keeps its scroll position as it updates.
- The world always scales to fill the space it has (fractional zoom, crisp
  pixels). Integer-only zoom had left a 550×350 world at 1× on a laptop.
- **Pause** stops the simulation process itself (the server sends SIGSTOP), so
  resuming continues exactly where it stopped. When the page only stopped
  reading, the core ran on until the OS buffers filled (~1,500 gens).

Colours follow the prototype: family hue plus a per-tier shift keyed by birth
serial, so a reused tier index still gets a fresh colour (D-031). Rings mark
births.

## Files

- `stream.cpp`: the frame writer (format documented at the top). It reads
  the clock to pace frames, which is allowed: it is an adapter, and the core
  never sees the time.
- `server.js`: serves the page and `/sound.js` (the frozen engine), spawns one `culture_stream` per viewer with
  whitelisted arguments (no shell), and POST `/control` pauses or resumes it.
- `index.html`: parsing, drawing, ledger, event log.
