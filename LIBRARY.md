# LIBRARY — Culture

Durable, evidence-backed lessons. Format and write gate: CLAUDE.md §Knowledge Loop.

[L0001] Goldens regenerate byte-identically from the JS reference on this toolchain | candidate | added: 2026-10-01 | tags: parity-and-float | lesson: `node tools/golden.js` reproduces all four golden traces byte-for-byte on Node v24.10.0 (macOS arm64), so the reference itself is a stable oracle and a golden mismatch on this machine points at the code under test, not at Node. | evidence: spin-up session 2026-10-01, cmp of regenerated default-seed-1 and stress-seed-4 against golden/, then ./verify full (reference_selfcheck, all four). | falsifier: a different Node version or platform (e.g. CI's Linux lts) producing different bytes for any seed — then record which, and pin the Node version. | supersedes: —
