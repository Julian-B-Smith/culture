# tests/js — frozen JS-side handover tools (D-030)

These ran the JS reference (`reference/core.js`) beside the C++ core while the
JS was the normative implementation (P1). At tag `v0-js-parity` they proved
libculture bit-identical to the reference: vectors, trig, deep hidden state.
The C++ goldens in `golden/` and `golden/deep/` were checked identical to their
output at the hand-over (traces/2026-10-02-cpp-canonical.md).

C++ is canonical now, so `./verify` no longer runs them. They are kept, with
`reference/` and `golden/js-v1/`, so the hand-over proof can be re-run by
checking out `v0-js-parity`.
