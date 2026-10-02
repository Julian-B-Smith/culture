# portable-pow — x^1.5 without std::pow (D-032)

- **Queue item:** fixes the failing CI of PR #7 (cross-toolchain check, D-030).
- **Why:** glibc's pow(k, 1.5) differs from the macOS-pinned vector hash, so the core's crowding brake was not guaranteed platform-independent.
- **Evidence consulted:** CI run 37029631393 (`cpp_vectors` pow15 line differs); a mpmath check (300-bit) over k = 0…65,536: macOS pow misrounded at 89 k (first 1,018); the double-double pow15 correctly rounded at all.
- **What changed:** `pow15` in libculture, used by both cores' brake and by the vector test; `tests/vectors.expected` and pins renewed; D-032; ROADMAP PD1 (portable log2 follow-up).
- **Alternatives rejected:** naive `k*sqrt(k)` (differs from correct rounding at 15,694 of 65,537 k); pinning glibc's or macOS's values (bakes in one libm's misrounding).
- **Verify:** `./verify fast` exit 0. Deep goldens byte-unchanged on default 1, chaos 7 and stress 4; no golden re-pinned except the vector file.
- **Open questions:** log2 residual risk (PD1).
