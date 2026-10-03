# search-worker — rule search off the simulation thread, deterministic latency

- **Queue item:** ROADMAP P2 carried item (search worker), D-034; requested by the human.
- **Why:** instant searches stalled the viewer (up to 179 ms at 4×). The PORT_PLAN design runs them off-thread and lands each result at trigger + L, so the world stays a pure function of the seed.
- **Evidence consulted:** core.cpp work()/emerge(); SPEC §5, §9; PORT_PLAN P2; the viewer pacing probe.
- **What changed:**
  - **Core (both cores):** `Search::startGen`; free `searchCandidates`/`runSearch`; `SearchJob`/`SearchOutcome`; `World::workLatency`, `latencyJob`, `place`. `work()` now calls `searchCandidates`, with identical RNG order.
  - **Tests:** properties latency-0 and latency-threads (Threads linked for tests and the viewer only).
  - **Trace tool:** profiles `latency` and `chaos-latency`, with deep goldens; pins renewed (28 files).
  - **Viewer:** worker mode is the default (orphaned futures parked until done, so a cancelled search never blocks the loop).
  - **Docs:** D-034, ROADMAP, charter, viewer README.
- **Verify:** `./verify full` exit 0 before commit.
  - Instant and sliced goldens unchanged.
  - Plant (landing at start + L + 1): deep[opt] chaos-latency red, latency-0 red at gen 863, latency-threads red with 0 of 11 births on time; core/ref stayed green.
  - Browser pane: first birth at gen 893 = 863 + 30, 60 fps at 480 of 480 gens/s.
- **Measured (idle machine, worst frame gap, worker vs instant):**

  | World | Speed | Worker | Instant |
  |---|---|---|---|
  | 220×140 | 1× | 32 ms | 54 ms |
  | 220×140 | 4× | 34 ms | 179 ms |
  | 440×280 | 2× | 20 ms | 98 ms |
  | 550×350 | 4× | 27 ms | 111 ms |

  At 220×140 16×: 154 ms for the worker vs 158 ms for instant.
- **Alternatives rejected:** threads inside core/ (violates core purity); a speed-dependent L (speed would change the world); `std::async` futures dropped on cancel (their destructor blocks, so they are parked instead).
- **Open questions:** `./verify fast` now takes ~55 s (latency properties add ~30 s). The choice of L was resolved by poll before merge: keep 30 (D-035).
