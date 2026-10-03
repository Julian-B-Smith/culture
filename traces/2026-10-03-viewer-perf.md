# viewer-perf — why the viewer felt laggier than the prototype, and the fix

- **Queue item:** unqueued: the human reported the C++ viewer felt laggier than the JS prototype, and asked for a markers toggle.
- **Why:** C++ steps faster than the JS (benchmark at 220×140: 1.0 ms vs the reference's ~3.5 ms), so the viewer was wasting it.
- **Evidence consulted:** a frame-cost harness (scratch) over the viewer loop; the official bench; `ps` during the report; a headless pacing probe that reads culture_stream's real output and timestamps frames.
- **Findings:**
  1. **Machine load.** Load average was 120 on 8 cores: OneDrive, Spotlight, Ableton Live, the Claude renderer, plus two culture_stream processes (the human's tab and the agent's pane). It inflated every number, so the absolute values below are pessimistic.
  2. **Search too greedy.** Sliced search did 8 candidates per generation (1–2 ms each). At 16 gens/frame, frames reached 250 ms; the prototype did 3 per frame.
  3. **Lockstep.** The simulation and frames ran in lockstep, so a fixed spf per frame meant one slow generation froze the picture.
  4. **Frame rate.** 30 fps against the prototype's 60, so 1× was half the prototype's speed.
- **What changed:** budgeted pacing (step toward spf × 60 gens/s within ~12 ms, always emit the frame, drop the deficit); 60 fps; sliced search 2 per generation; header shows achieved / target gens/s; markers toggle (checkbox, `M`) with the prototype's dashed search ring; the sound speed parameter matches the new meaning; a keyboard-handler crash on non-element targets fixed.
- **Measured after** (headless probe, same loaded machine):

  | Size | Speed | Search | fps | gens/s achieved / target |
  |---|---|---|---|---|
  | 220×140 | 1× | sliced | 59 | 59 / 60 |
  | 550×350 | 1× | sliced | 59 | 59 / 60 |
  | 220×140 | 16× | sliced | 54 | 508 / 960 |
  | 550×350 | 4× | sliced | 51 | 132 / 240 |

  In the browser pane, stress profile at 4×: 60 fps, 238 / 240 gens/s, search ring shown.
- **Not fixed (carried to ROADMAP P2):** high-speed targets and rare 120–725 ms stalls. The fixes are a search worker with deterministic latency and a multithreaded step, both core-API work for P2.
- **Verify:** `./verify fast` exit 0 before commit.
- **Open questions:** an idle-machine re-measure would separate load from design.
