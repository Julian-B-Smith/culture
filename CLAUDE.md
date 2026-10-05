# Agent Charter — Culture

Everything above §Domain is the invariant harness layer. Do not edit it
per-project. Project-specific facts live in §Domain and in ROADMAP.md.
**The global doctrine (imported via `~/.claude/CLAUDE.md`) applies on top of
this charter and is not restated here** — this file carries only what doctrine
doesn't: the operational contract of THIS harness. (Context budget: slimmed
2026-07-16, Decision 28.)

## Truth contract

- **ROADMAP.md is the single source of truth.** Task state, acceptance
  criteria, invariants, and open questions live there and only there. If the
  conversation and ROADMAP.md disagree, ROADMAP.md wins; if ROADMAP.md is
  wrong, fixing it is the first task.
- **Passing ≠ done.** Done = `./verify full` green AND the ROADMAP acceptance
  criteria satisfied AND a trace entry written in `traces/`. Never collapse
  these into each other.
- **Grounded refusal is a success class.** "I cannot do this within the brief
  because X" with evidence is a correct output. Guessing to appear productive
  is a failure.

## Provenance

- Every nontrivial claim about the codebase must cite its evidence: a file
  path and line, a verify run, or a ROADMAP entry. No provenance → phrase it
  as a hypothesis, not a fact.
- Every merged change gets an entry in `traces/` (see the provenance skill):
  what changed, why, evidence consulted, verify result + git hash.

## Delegation policy (lead session)

- The lead plans, delegates, integrates, and is the **only** writer of
  ROADMAP.md. Subagents never touch it.
- Delegation briefs are self-contained: subagents start with zero conversation
  history. Every brief states (1) files in scope, (2) acceptance criteria
  copied verbatim from ROADMAP.md, (3) the verify target, (4) what is
  explicitly out of scope.
- Use built-in Explore for codebase reconnaissance. Use `implementer` for
  scoped changes, `verifier` for oracle runs, `critic` (Opus) for adversarial
  review of anything architectural, irreversible, or touching an invariant.
- One queue item per implementer dispatch. Parallel dispatches only for items
  with disjoint file scopes.
- Do not start work on an item whose acceptance criteria are missing or
  ambiguous. Surface the gap to the human; that is the deliverable.

## Oracle discipline

- Run `./verify fast` after any change set; `./verify full` before declaring
  a queue item done. Report oracle output verbatim — never summarize a failure
  into vagueness.
- A red oracle halts forward work. Fix or revert; do not stack changes on red.
- Never weaken a gate (skip a test, relax a threshold, mark xfail) without an
  explicit human decision recorded in ROADMAP.md.

## Human gates

Stop and ask before: deleting files, changing the public interface of
anything, editing `./verify` or the gates it runs, adding a dependency,
any git operation beyond add/commit on the working branch, and anything §Domain
lists as protected.

---


## §Domain — Culture

**What this is.** A cellular automaton in which Life-like rulesets succeed one
another: a surprise-triggered birth derives a new rule from the configuration
that triggered it, and that rule contests ground on a torus. Color reactions,
mutation, crowding brake, hardened borders and site memory sit on top, with an
ambient sonification. Form: `libculture` (pure C++20 core) + headless trace CLI
+ one native macOS viewer with sound. Interplay between tiers is the point;
board-wiping behavior is a defect (D-005). Packet: `docs/handoff/`.

**Stack & entrypoints.** C++20 `libculture` is the **canonical**
implementation (D-030): `core/` (optimized) and `core/ref/` (the frozen naive
core every optimized core must match). The JS prototype (`reference/`) is
frozen at tag `v0-js-parity`, where it was proven bit-identical. Node >= 18 is
still needed for `tools/compare.js`. CMake with `-G "Unix Makefiles"` (CLT
only, no Xcode/Ninja); always pass absolute build paths. Render and audio
stacks are undecided (ROADMAP P2/P3 gates). Target layout: PORT_PLAN.md.
`-ffp-contract=off` in CMakeLists.txt is load-bearing: FMA contraction changes
double rounding and breaks parity.

**Domain invariants.**
- `core/` is pure: no clock, no threads, no I/O, no unseeded randomness. Seeded
  mulberry32; **RNG call order is contract** (SPEC §2).
- All arithmetic in double; float32 only where SPEC §1 stores float32, rounded
  at store. Integer trace fields match exactly; only record/lastMax get
  compare.js's relative tolerance — never loosen the integer checks.
- The simulation's semantics are SPEC (v0) plus the DECISIONS entries that
  change it (P4 onward). A semantic change lands in `core/` AND `core/ref/` in
  the same commit, with regenerated and re-pinned goldens.
- Audio and UI only read the world (SOUND.md); the sim is deterministic whether
  or not they run. Offline audio renders of a fixed seed are bit-reproducible.
- Instant search mode always exists (goldens use it); live default is
  deterministic latency L = 30 (D-021), implemented as `World::workLatency`
  with the pure `runSearch` (D-034). Threads belong to adapters, never to
  `core/`; a worker-thread run must equal the synchronous run.
- No stacked lattice layers (D-006) without a new reason from the human.
- Wording (D-029): the trigger is **surprisal** (Shannon), not Bayesian
  "surprise"; the P5 map is **block predictability gain**, never "causal" or
  "downward causation". "Rules never repeat" is guaranteed; open-endedness is
  only ever measured.
- Performance work never changes results: optimized code must equal
  `core/ref/` and the pinned deep goldens. Never optimize `core/ref/`.
  Measure in Release only.

**Protected paths** (human gate + DECISIONS entry + re-pin): `golden/`
(incl. `deep/`, `js-v1/`, `PINS.sha256`), `core/ref/`, `tests/*.expected`,
`tools/`, the frozen JS set (`reference/`, `tests/js/`), `docs/handoff/`
(packet as received), `./verify`.

**Verify targets.** `fast` (~60 s warm):
- kit integrity, leak gate, structure;
- sha256 pins over every oracle file (`golden/PINS.sha256`);
- compare.js self-test (a planted divergence must FAIL);
- C++ Release build; vectors and trig vs pinned;
- default-seed-1 and the Spores input log (`cpp_inputs`) vs pinned;
- deep hidden state vs pinned for BOTH cores (default 1, chaos 7, chaos-latency 7, default 7 + inputs);
- properties: determinism, never-repeat, window wrap, latency L = 0 = instant, worker = synchronous, spores.

`full` adds the other three goldens, deep for both cores on default 2–3, stress 4, chaos 11 and latency 1, and the 440×280 bench < 4 ms on seeds 1–3. CI runs `fast` on Linux/GCC against pins made with Apple clang, which makes it a cross-toolchain gate.
Trig in the core is `core/src/fdlibm.hpp` (explicit-fma fdlibm, D-027) —
never `std::cos`/`std::sin`.

**Delegation (rung 2).** Read-only subagents for cross-checks and research;
`verifier` (Haiku) for oracle runs; `critic` (Opus) on anything touching an
invariant. Every agent's model is pinned in its frontmatter.

## Mailbox

- **`integrations/` in THIS repo is the only place briefs to Culture land.**
  If a brief is not here, it is not ours to answer.
- **Responses to OUR briefs live in the PROVIDER's tree** (e.g.
  `<provider>/integrations/culture/`), not here. Nothing signals us when one
  arrives; pull and read them deliberately.
- **Other repos' exchanges may be READ freely, but never ACTED on** and never
  raised to the human as ours. If one genuinely concerns Culture, file our own
  brief.
<!-- /kit:mailbox:2.1.0 -->

<!-- KNOWLEDGE-LOOP:START -->
## Self-Improving Knowledge Loop

Each session: read accumulated knowledge before acting, write distilled knowledge
after. This meta-layer sits on top of my primary role and never overrides it.

### Every session
1. **ORIENT** — Read INDEX.md in full (kept small on purpose). Pull ONLY the matching
   entries from LIBRARY.md into context. Never load all of LIBRARY by default.
2. **ACT** — Do the work, applying retrieved lessons. If a lesson proves wrong,
   correcting it outranks adding a new one.
3. **REFLECT** — Ask: "What did I learn that a future session needs and could not
   cheaply re-derive?" A lesson qualifies only if durable, evidenced (tied to a
   concrete trigger), and non-obvious. If nothing qualifies, write nothing.
4. **WRITE (atomic)** — Append the lesson to LIBRARY.md and a one-line pointer to
   INDEX.md in the same change. New lessons enter as `tier: candidate`; promote to
   `canonical` only when a second occurrence is SHOWN independent — a different
   root cause, not the same shared file, prompt, or tool seen twice; say why in
   the promotion note — or on human review. Recurrence alone never promotes.

### Write gate (anti-poisoning)
This loop feeds its own output back as input, so a wrong lesson, written once, is
retrieved and reinforced forever. Therefore: prefer not writing over writing
unverified; every lesson states what would falsify it; if a retrieved lesson
contradicts present evidence, trust the evidence and demote the lesson.

### Consolidation (periodic)
When LIBRARY exceeds ~30 entries, merge duplicates, delete superseded entries,
promote recurring candidates, tighten tags. Refactor it like code; don't grow it
like a log.

### LIBRARY entry template
`[Lxxxx] <title> | tier | added: YYYY-MM-DD | tags: … | lesson: … | evidence: … | falsifier: … | supersedes: …`
<!-- KNOWLEDGE-LOOP:END -->
