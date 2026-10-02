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

**Stack & entrypoints.** Phase 0: Node >= 18 runs the JS reference
(`reference/core.js`, normative) and the oracle tools (`tools/golden.js`,
`tools/compare.js`). Phase 1+: C++20, CMake with `-G "Unix Makefiles"` (CLT
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
- Port the SPEC §8 quirks faithfully; changing one is a Phase-4 DECISIONS entry.
- Audio and UI only read the world (SOUND.md); the sim is deterministic whether
  or not they run. Offline audio renders of a fixed seed are bit-reproducible.
- Instant search mode always exists (goldens use it); live default is
  deterministic latency L = 30 (D-021).
- No stacked lattice layers (D-006) without a new reason from the human.
- Performance work never changes results; the goldens are the guard. Measure
  in Release only.

**Protected paths** (human gate + DECISIONS entry + re-pin): `golden/`,
`reference/core.js`, `tools/golden.js`, `tools/compare.js`,
`golden/PINS.sha256`, `docs/handoff/` (packet as received), `./verify`.

**Verify targets.** `fast` (~35 s warm): kit integrity, leak gate, structure,
golden sha256 pins, compare.js self-test (planted divergence must FAIL),
reference regenerates default-seed-1, C++ Release build, JS-vs-C++ unit
vectors (incl. pow/log2), fdlibm trig hash, C++ default-seed-1 vs golden,
deep hidden-state parity (default seed 1 + chaos seed 7).
`full` (~2.5 min): fast + the other three goldens (reference and C++), deep
parity on all of them + chaos seed 11, 440×280 bench < 4 ms on seeds 1–3.
Trig in the core is `core/src/fdlibm.hpp` (explicit-fma fdlibm, D-027) —
never `std::cos`/`std::sin`.

**Delegation (rung 2).** Read-only subagents for SPEC/JS cross-checks;
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
