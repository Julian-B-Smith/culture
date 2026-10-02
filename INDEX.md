# INDEX — Culture

Read in full at session start; pull only matching LIBRARY entries.
Tags: parity-and-float · perf · sonification · emergence-dynamics

- [L0001] parity-and-float — goldens regenerate byte-identically from the JS reference on Node (macOS arm64)
- [L0002] parity-and-float — goldens miss float32 slips in hidden state; use cpp_deep for anything touching float32 storage
- [L0003] perf — bench at 440×280 only after tiers form: 4,000 steps, seeds 1–3, Release
- [L0004] parity-and-float — V8 trig = fdlibm with FMA on Apple Silicon, plain on x86; use the explicit-fma port; suspect other V8 libm calls of the same split
