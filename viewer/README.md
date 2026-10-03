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
- **speed:** as in the prototype: 1× = 60 gens/s (1 generation per frame at
  60 fps), up to 16× = 960 gens/s. The header shows **gens/s achieved /
  target**, so lag is visible: if the machine cannot keep up, the simulation
  slows down while the picture stays at ~60 fps.
- **search:**
  - **worker** (default): each rule search runs on a worker thread and lands
    exactly 30 generations after it started (D-034). The picture never waits
    for a search unless it is still running 30 generations later, which can
    happen at 16× (30 gens = 31 ms).
  - **sliced** runs `work(p, 2)` once per generation: smooth. Each candidate
    is a 280-generation test run of 1–2 ms. The first version ran 8 per
    generation and could spend 250 ms in one frame.
  - **instant** finishes each rule search inside its generation, as the goldens
    do. A birth can stall a frame at large sizes.
  - The three modes land births at different generations, so they are
    different (equally deterministic) worlds. Worker = instant + 30 gens, for
    every search that is not cancelled.
- **view:** *life* shows live cells bright on their tier's dark ground;
  *territory* shows ownership only.
- **Full screen** (button or `F`; `F` or `Esc` exits): the world alone, as
  large as it fits, with a HUD (gen, tiers) that fades when the mouse is idle.
  Where a host refuses real full screen or never completes the request (seen
  in the Claude browser pane), an in-page mode fills the window instead.
- **Space** pauses and resumes.
- **markers** (checkbox or `M`), as in the prototype: rings mark births, and
  a dashed ring marks where a rule search is running (sliced mode only;
  instant searches finish inside a generation).
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

- `stream.cpp`: the frame writer (format documented at the top). Each frame
  it steps toward the target rate within a ~12 ms budget, then always writes
  the frame. It reads the clock to pace, which is allowed: it is an adapter,
  and the core never sees the time. Pacing changes how many generations pass
  between frames, never what happens in them.
- `server.js`: serves the page and `/sound.js` (the frozen engine), spawns one `culture_stream` per viewer with
  whitelisted arguments (no shell), and POST `/control` pauses or resumes it.
- `index.html`: parsing, drawing, ledger, event log.
