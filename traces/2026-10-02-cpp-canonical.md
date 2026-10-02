# cpp-canonical — C++ becomes the golden reference; JS frozen

- **Queue item:** ROADMAP P4 prerequisite (D-030). The P4 changes need regenerated goldens, and the human chose C++ as the canonical source.
- **Why:** Stop binding every future change to the JS implementation, without losing the oracle strength that the JS cross-check provided.
- **Evidence consulted:** D-025 to D-028 and L0002 (what the JS cross-check caught); current gates in ./verify; P4 evidence (culture_quirks).
- **What changed:**
  - **Tag and archive:** tag `v0-js-parity` (543fced); JS goldens moved to `golden/js-v1/`.
  - **C++ goldens and deep goldens:** `golden/*.jsonl` written by C++; six `golden/deep/*.txt` files; `tests/vectors.expected`.
  - **`core/ref/`:** a naive copy generated from core.cpp with D-026's optimizations undone.
  - **Trace tool:** `culture_trace --deep --core ref|opt`.
  - **Property tests:** `tests/properties.cpp`.
  - **Frozen JS tools:** moved to `tests/js/`.
  - **`./verify`:** gates rewritten for C++-canonical (reference regeneration and the JS-live gates removed; pins over 26 files).
  - **Docs:** D-030, L0005, charter, README, CODEMAP, ROADMAP.
- **Hand-over proof:** C++ goldens PASS against js-v1 at `--float-rel 0`, all four. Deep goldens byte-identical to the JS deep output (fma-flavor node, trig included), all six. The vectors equal the JS.
- **Alternatives rejected:** see D-030. Translation invariance was proposed and withdrawn, because it cannot hold bit-exactly given positional RNG and float summation order.
- **Verify:** `./verify full` exit 0 before commit. Plants: `0.8f` in core → deep[opt] red (cpp_parity green); in core_ref → deep[ref] red; repeat check removed → never-repeat red.
- **Open questions:** the first CI run is the cross-toolchain check of the deep goldens (made with Apple clang, checked with GCC). The deep goldens add 5.9 MB to the repo.
