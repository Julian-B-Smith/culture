# Culture: project brief

## What it is

Culture is a cellular automaton in which **natures succeed one another**, the way cultures grow, compete and give way in a dish. It starts as Conway's Life. When the frontier ruleset produces a configuration more improbable than anything in its own history, a new Life-like ruleset is derived from that configuration and spreads across the torus, contesting ground with what came before. The process recurses without end and never reuses a rule.

On top of that:
- **Color families** carry innate reactions toward other colors: push back, feed on, spark with.
- **Mutation pressure** grows with how long one ruleset has dominated.
- **A crowding brake** gives complex states time to play out.
- **Contested borders** harden.
- **Sites remember harm**, and resist the kind of harm they recently suffered.
- **An ambient sonification** treats each ruleset as a voice whose spectrum is its rule, with the box mapped onto the stereo field.
- **Timbres and rhythm**: each ruleset gets a sound class from how it looks (drone, breath, rumble, arpeggio, crystal), and the largest tiers play drum parts whose syncopation follows the rule's disorder, held back by a conductor that builds suspense (SOUND.md; P-043 to P-046).

The user's aim: build systems that set up a deterministic but unpredictable space to explore, rather than something meticulously constructed. The interplay between tiers is the point. Behaviors that wipe the board (explosive rules, instant flips) have consistently been treated as defects.

## Where it stands

There is a working browser prototype, `reference/culture.html`, a single self-contained file. Open it in any browser.
- `reference/core.js` is the deterministic simulation core.
- `reference/sound.js` is the Web Audio engine.
- `reference/ui.js` is the shell.

The core has no clock and no unseeded randomness.

## Spores

The user can click to release a new nature at a chosen cell (**spores**, P-042, P-047, SPEC §10), on a budget shared with forced emergence. A Spores switch, on by default, turns this off for pure watching. Spores make Culture partly playable, and they make runs depend on input, so every spend is logged and the trace tool can replay a log.

## What this phase is for

1. **Port to C++** with bit-exact parity against the golden traces.
2. **Build a native viewer with sound**, at larger scale.
3. **Keep going toward the long-term synthesis:** recursive coarse-graining, where emergence is triggered by block-level autonomy instead of rarity and each new layer's rule is learned from observed behavior. See PORT_PLAN.md, phase 5.

## Open questions for the spin-up survey

Ask the user these. They are not decided.

1. **Form factor.** Standalone app, audio plugin (JUCE / CLAP), a module in the FOUNDATIONS ecosystem, a visual instrument, or several of these sharing one core?
2. **Platforms.** macOS only, or cross-platform? Is Apple Vision Pro a target?
3. **Rendering and windowing stack.** For example SDL + OpenGL/Metal, raylib, JUCE, sokol, or a WebGPU-capable native layer.
4. **Audio stack.** JUCE, miniaudio, or FOUNDATIONS plumbing? Does the user's FDN reverb (Reverb Station) replace the convolution reverb?
5. **Parity strictness.** Is bit-exact parity a hard gate for phase 1? (Recommended: yes for integer state.)
6. **Search timing.** Is deterministic latency the default for live play, and what latency L?
7. **Priority after the port:** synthesis (coarse-graining), scanner sound and instrument mode, branching history, recording and export, or scale (GPU)?
8. **Agent architecture rung** (single thread, thread plus subagents, or organ fleet). The port is well specified and serial; a single thread with targeted subagents is probably enough.
9. **Repo name and visibility.**

## Ground rules carried over

- AI interprets and proposes; deterministic code decides. Seeded RNG, reproducible outputs, no wall-clock time in the core.
- Every phase has a `./verify` gate, and gates are never weakened. The golden traces are the oracle, and they change only through a recorded decision.
- `DECISIONS.md` is append-only. Seed it from this packet's log (D-001 to D-019, then prototype decisions imported as P-020 to P-053; see DECISIONS.md).
- Do not reintroduce stacked lattice layers (D-006) without a new reason from the user.
