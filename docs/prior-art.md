# Prior art — Culture

*ROADMAP PA0 (Decision 30 bookend). Compiled 2026-10-02 by the lead session from
four parallel read-only research agents (Sonnet), one per area, then
spot-verified by the lead. Re-scan before any public release or binary
distribution (ROADMAP PA1, which adds a patent/IP pass).*

**How to read the marks.** ✔ = the lead opened the source this session and
confirmed authors, year and the specific claim used here. · = found by a research
agent in search results and summarized from abstracts or snippets; the claim is
plausible but not checked at method level. Nothing here was read in full. The
"not found" findings below come from a few hours of searching, so they mean "not
found by us", not "does not exist". That limit matters most for the novelty
claims, because those are the conclusions we would most like to be true.

---

## Bottom line

**What looks new in Culture** (nothing close found in any of the four areas):

1. **A new rule is triggered by the world's own surprise record.** The trigger
   fires when surprisal at the frontier beats that ruleset's own history. Novelty
   and surprise are well studied as *selection* signals (novelty search, Bayesian
   surprise), but we found no CA that uses one to *mint a new law in-world*.
2. **The rule is derived by hashing the configuration that triggered it,** then
   screened, under a never-repeat invariant. Hash Chemistry hashes *entities*, not
   rules. Heterogeneous Life-like CAs mutate rules at random.
3. **Rule ownership is territorial.** Rulesets own ground and contest it through
   contact pressure, hardened borders and site memory (hysteresis). In every
   rule-heterogeneous system we found, rules are carried *per cell* and spread by
   inheritance at birth.
4. **The rule *is* the timbre.** Birth/survival bits map to harmonics, so a mutant
   sounds kin to its parent. Pitch is inherited along the lineage as just-
   intonation steps. Sonification work found either maps cell states or
   statistics to sound, or gives species voices whose timbre is unrelated to their
   genome.

**What Culture shares with, or can borrow from, prior work:**

- **Rule varies across space.** Flow-Lenia, Genelife and heterogeneous Life-like
  CAs all have it.
- **Rules screened for "interestingness".** Done by Wuensche, Eppstein, Peña &
  Sayama, and Yin.
- **Neighborhood look-up frequencies as an instrument.** Wuensche's input entropy.
- **The P5 synthesis.** Its pieces exist separately: causal-emergence measures
  (Rosas et al. Ψ), coarse-graining CAs (Israeli & Goldenfeld), local causal
  states (Rupe & Crutchfield). We found no recursive, online, deterministic
  version.

**The three closest systems:** Flow-Lenia, Genelife, and Shrestha et al.'s
heterogeneous Life-like CA (compared below).

---

## Closest prior art, compared

| | **Culture** | **Flow-Lenia** (Plantec et al. 2022, 2025) ✔ | **Genelife** (Packard & McCaskill 2024) ✔ | **Heterogeneous Life-like CA** (Shrestha et al. 2024) ✔ |
|---|---|---|---|---|
| Substrate | binary, Life-like B/S rules, torus | continuous, mass-conserving Lenia | binary, Life with genomes | binary, Life-like B/S rules |
| Where the rule lives | a **tier** (a territory of sites) | parameters carried by matter, advected | a genome in each live cell, inherited at birth | a B/S rule in each cell, inherited at birth |
| Where new rules come from | **hash of the triggering 7×7 configuration**, screened; never repeats | rules mix with neighbouring rules where matter meets (operator not checked) | genetic variation | random add/remove/change of a B/S symbol |
| What triggers novelty | the frontier's **own surprise record** is beaten | continuous transport and mixing | birth events | mutation probability per birth |
| How rules compete | contact pressure, hardened borders, site memory; colour reactions; crowding brake | implicit: persistence of mass | implicit, plus optional density regulation | implicit: survival of carrying cells |
| Measured for open-endedness | not yet (see recommendations) | evolutionary activity + other metrics | activity statistics on genes and patterns | unique rules discovered over time |

Four other systems are relevant:

- **Adams 2020 ✔** has two elementary CAs that change their rules as a function
  of the whole system's state. Open-endedness came from random interaction
  functions.
- **Pavlic et al. 2014 ✔** "self-referencing CA" generates its iteration rules
  from its own state, the nearest "rule from configuration" idea. It has no
  record-based trigger, no screen and no territories.
- **Hash Chemistry** (Horiguchi & Sayama 2026 ✔; Sayama 2024 ·) uses
  deterministic hashing to score entities with spatial competition. The
  "deterministic hash opens a vast possibility space" idea is shared; the
  object hashed differs.

---

## 1. Life-like rule space, screening, and rule-changing CAs

| Work | What it is | Relation to Culture |
|---|---|---|
| Eppstein 2010, "Growth and Decay in Life-Like CA", arXiv:0911.2890 · | Classifies rules by whether some pattern can escape any bound and whether some can die out. Both "yes" predicts spaceships. | A principled, cheap pre-screen Culture could add ahead of its simulated screen. |
| Eppstein's glider database (LifeWiki "GliderDB") · | Known gliders and spaceships across Life-like rules. | Ground truth for checking the 0.30c invasion cap. |
| Wolfram 1984, Physica D 10 · | The four behaviour classes. | Culture's density/activity window is a class-4 proxy. |
| Langton 1990, Physica D 42 · | λ and the "edge of chaos". | The screen is a behavioural stand-in for a λ band. |
| Mitchell, Hraber & Crutchfield 1993, Complex Systems 7 · | Failed to reproduce "evolution drifts to the edge of chaos". | Caution: the screen is a heuristic. Its effect is **measured, not guaranteed**. |
| Reia & Kinouchi 2014, PRE 89, arXiv:1407.1006 ✔ | Life sits at the **border of extinction**, a near-critical absorbing transition, not the edge of chaos. | Challenges the screen's framing. Low-density, near-extinction targets may fit better. |
| Wuensche 1999, Complexity 4(3) ✔ | Automatic rule classification by the **variance of input entropy**: the entropy of rule-table look-up frequencies over a moving window (w = 10), in 1D. Rare look-ups mark interacting particles. | The closest instrument to Culture's surprise score. Culture differs in three ways: an exponentially decaying table rather than a moving window, per-cell surprisal over 5×5 windows rather than one entropy, and it *triggers* rather than classifies. |
| Peña & Sayama 2021, Artificial Life 27(2) · | Scans the Life-like space by late-time density plus a conditional-entropy complexity measure Δ. | Direct precedent for Culture's late density screen. Δ could be a second screen axis. |
| Yin 2026, arXiv:2603.25239 ✔ | Exhaustive census of all 262,144 outer-totalistic Moore rules: 20,152 (7.69%) support pattern proliferation. | The current census of exactly Culture's rule space. Use it to calibrate the screen and to estimate how much of the space Culture can ever reach (D-003's ceiling). |
| LifeWiki, "Life-like cellular automaton" · | 2^18 rules. On/off complement symmetry pairs them; B2 rules tend to explode; lowest birth ≥ 4 is bounded. | Two checks for Culture: B2 is known explosive but is not excluded by the "no B1" guard, and complement-equivalent rules are not identified. |
| Sipper 1997, cellular programming (LNCS 1194) · | Non-uniform CAs: a rule per cell, evolved for a computational task. | The canonical "rule varies in space", but task-driven, static and 1D. |
| Medernach et al. 2013, HetCA, GECCO · | Per-cell rules evolved by genetic programming for long-term dynamics. | Per-cell genome plus fitness loop. Culture has territorial tiers and no fitness. |
| Kumar et al. 2024, ASAL, arXiv:2412.17799 ✔ | Foundation-model search over ALife substrates. Found Life-like CAs as open-ended as Life. | An offline outer-loop search with a model judge. Culture keeps models out of the loop (doctrine: AI/deterministic boundary). |
| Immigration Game / QuadLife (LifeWiki "Colourised Life") · | Colour as a passive overlay on Life. | The common multi-colour reference. Culture's colours carry reactions. |

## 2. Open-ended evolution (OEE)

| Work | What it is | Relation to Culture |
|---|---|---|
| Chan 2019, "Lenia", arXiv:1812.05433 · | Continuous CA with 400+ catalogued species. | One law per world; Culture changes the law. |
| Chan 2023, GECCO companion, arXiv:2304.05639 · | Large Lenia runs with local genotypes: diversity, then convergence to fast expanders. | The same failure mode Culture's crowding brake and speed cap target. Chan's remedy is conserved resources; Culture's are brakes and screens. |
| Plantec et al. 2025, Artificial Life 31(2), arXiv:2506.08569 · | Flow-Lenia's evolutionary dynamics, measured with evolutionary activity. | A measurement toolkit reusable per tier. |
| Michel et al. 2025, arXiv:2505.15998 · | A curiosity-driven automated explorer over Flow-Lenia universes. | A model for exploring Culture's parameter space offline. |
| Rafler 2011, SmoothLife, arXiv:1111.1567 · | Continuous generalization of Life. | Shares only the lineage. |
| Langton 1984; Sayama & Nehaniv 2025, Artificial Life 31(1), arXiv:2402.03961 · | Self-reproducing loops and evoloops: heredity in patterns on a fixed rule. | The opposite design. Culture's heredity is at the rule level. |
| Hutton 2002 (Squirm3); Hutton 2007, Artificial Life 13(1) · | Evolvable replicators in a CA chemistry. | Evolution within a fixed rule. |
| Turney 2021, Artificial Life 27(1), arXiv:2009.11368 · | Evolution in Life only through an external Immigration-game selection loop. | Supports D-001's correction that Life does not climb on its own. |
| Yang 2023, arXiv:2305.19504 · | A searched binary rule ("Outlier") with self-replication at two scales. | A single rule showing multi-scale replication. Relevant to P5. |
| Bedau & Packard 1991, Artificial Life II · | Evolutionary activity statistics. | **Borrow**: tiers are natural components. Does activity accumulate or only churn? |
| Taylor et al. 2016, Artificial Life 22(3) · | OEE is plural; separates observed hallmarks from mechanisms. | "Rules never repeat" is a **guaranteed** mechanism. Open-endedness is a **measured** hallmark (doctrine: never conflate). |
| Dolson et al. 2019, MODES, Artificial Life 25(1) · | Change, novelty, complexity and ecology metrics, with C++ code. | Ready-made Layer-E metrics over the tier lineage tree. |
| Soros & Stanley 2014, Chromaria (ALIFE 14) · | Four hypothesized necessary conditions for OEE. | A checklist. The screen resembles a minimal criterion. |
| Lehman & Stanley 2011, Evol. Comp. 19(2) · | Novelty search. | Culture's trigger is a novelty archive whose archive is the frontier's own history, and it mints a law rather than selecting a candidate. |
| Itti & Baldi 2009, Vision Research 49(10) · | Bayesian surprise as KL divergence. | Culture uses Shannon surprisal from decaying counts, not KL. |
| Cyclic CA, Greenberg-Hastings (Fisch, Gravner, Griffeath) · | Cyclic dominance and excitable media. | Classic competing species, but with a fixed dominance cycle. |

## 3. Causal emergence and coarse-graining (input to P5)

| Work | What it is | Use for P5 and online cost |
|---|---|---|
| Hoel, Albantakis & Tononi 2013, PNAS 110(49) · | Effective information (EI) of a transition matrix. Macro can beat micro. | Needs a transition matrix over block states, so 8×8 blocks must first be quantized. Cheap once built. |
| Hoel 2017, Entropy 19(5) · | Emergence as channel-capacity use. | Conceptual framing only. |
| Comolatti & Hoel 2022, arXiv:2202.01854 · | Many causation measures detect emergence. | Licenses a cheap determinism-style proxy. |
| Eberhardt & Lee 2022, Philosophies 7(2); Dewhurst 2021, Thought 10(1) · | Critiques: EI's maximum-entropy intervention is arbitrary; EI emergence is neither causal nor emergent. | **Warnings**: use observed distributions, and name the heatmap honestly ("block predictability gain", not "downward causation"). |
| Rosas, Mediano et al. 2020, PLoS Comput Biol 16(12) ✔ | Information-theoretic emergence. The practical criterion is Ψ = I(V_t; V_t') − Σ_i I(X_i,t; V_t'). Includes a **Game of Life** case study: V = which particle types are present; Ψ > 0. | **The recommended first measure.** Counts and logs only: deterministic, cheap per block, and observation-based. |
| Sas, Rosas, …, Mediano 2025, arXiv:2601.00013 ✔ | Improved estimators that correct double-counting in emergence measures for large systems. | Read before implementing Ψ. It speaks to the main bias pitfall. |
| Mediano et al. 2022, Phil. Trans. A 380 · | Review of the decomposition approach. | Map of the variants. |
| Barnett & Seth 2023, PRE 108, arXiv:2106.06511 · | Dynamical independence: a macro process its micro past cannot further predict. | Borrow the definition, not the linear-Gaussian estimator. |
| Klein & Hoel 2020, Complexity · | Search for the coarse-graining that raises EI. | Only if blocks become adaptive. |
| Zhang & Liu 2022, Neural Information Squeezer, arXiv:2201.10154 · | Learns the coarse-graining and macro dynamics jointly. | Gradient training is not deterministic in-core, so offline validation only. |
| Balduzzi 2011, arXiv:1105.0158 · | Excess information to detect emergent processes in CAs. | CA-specific. Cost not checked. |
| Israeli & Goldenfeld 2004 (PRL 92), 2006 (PRE 73) · | Coarse-grained CAs that emulate the original, even for irreducible rules. | The existence result behind "a coarse layer with its own rule". Their closure test is a cheap table check. |
| Weeks, Polack & Stepney 2008, ALife XI · | Coarse-graining elementary CAs. | Possible test cases. |
| Bagrov et al. 2020, PNAS 117 · | Multiscale structural complexity. | A cheap complementary score, not about predictability. |
| Hanson & Crutchfield 1997, Physica D 103 · | ε-machines: domains and particles in 1D CAs. | Vocabulary for what the heatmap should light up. |
| Shalizi, Shalizi & Haslinger 2004, PRL 93 · | Local statistical complexity from light-cone causal states. | The nearest analogue to "autonomy lights up where tiers form". Moderate cost. |
| Rupe & Crutchfield 2018, Chaos 28 · | Local causal states expose coherent structures. | An **independent ground truth** to validate the heatmap offline. |
| Lizier, Prokopenko & Zomaya 2008, PRE 77; Lizier JIDT · | Local transfer entropy and information storage. | A cheap per-cell signal: storage marks domain interiors, transfer marks boundaries. |
| Gilpin 2019, PRE 100; Wulff & Hertz 1992, NIPS 5; Mordvintsev et al. 2020, Distill · | Learning CA rules with networks. | Offline references for the "learned layer rule". Out of the deterministic core. |

## 4. Sonification of cellular automata and artificial life

| Work | What it is | Relation to Culture |
|---|---|---|
| Burraston & Edmonds 2005, Digital Creativity 16(3) · | The standard survey of CAs in generative music. | Landscape baseline. Mostly note-level or synthesis-level work. |
| Miranda, Chaosynth / CAMUS (c. 1995–2001) · | A CA drives granular synthesis, and CA structure maps to notes. | A CA shapes timbre, but through cell states, not rule identity. |
| Serquera & Miranda 2014, Computer Music Journal 38(4) · | Histogram-mapping synthesis: CA state histograms become a spectrogram. | Spectrum from state statistics. Culture's spectrum comes from the rule's bits. |
| Xenakis, *Horos* (1986); Solomos on CAs in Xenakis · | A 1D CA drives harmonic progressions in a score. | The historical precedent. |
| Beyls 1989/1991, ICMC · | Multiple 2D CAs controlled by λ. | Rule parameters as a musical control. |
| Millen 1990/2004, ICMC; WolframTones 2005 · | Cell-to-note and rule-as-score mappings. | The mapping Culture deliberately avoids. |
| Otomata (Bozkurt 2011) · | A playable CA-like sequencer. | The opposite pole: playable events. |
| McCormack 2001, Eden (ECAL) · | An evolving ecology whose sound affects selection. | Kin conceptually. Culture's audio is read-only and never feeds back. |
| Dahlstedt & Nordahl 2001, Leonardo 34(3), "Living Melodies" · | Coevolving agents; the whole world's sound is the music. | "Listen to the whole world", but with agent-level sound. |
| Hermann, Hunt & Neuhoff 2011, *The Sonification Handbook* · | Parameter-mapping vs model-based sonification. | Culture is structured parameter mapping over aggregates, with a stable timbre per stream. |
| Tenney 1984, harmonic space; Wilson lattices · | Harmonic-distance lattices and stochastic walks. | The ancestor of the just-intonation walk. Culture's walk follows the lineage tree and never returns. |
| particle-life sonification (GitHub MichelReij) · | One voice per particle type: count sets loudness, centroid sets pan. | The nearest practical "species = voice". Hobby code, not peer-reviewed. |

---

## Recommendations (proposals for the human; none adopted)

1. **P5 starting measure.** Use Rosas et al.'s Ψ per 8×8 block over a quantized
   block feature, with plug-in counts.
   - **Main pitfall:** upward bias where counts are sparse. Mitigate with a
     seeded shuffle baseline, few bins and long windows, and read Sas et al. 2025
     first.
   - **Validate offline** against an independent structure detector (Rupe &
     Crutchfield local causal states, or Lizier local transfer entropy) before
     the measure may trigger anything.
   - **The new layer's rule:** a modal lookup table built from the counts already
     held, with Israeli & Goldenfeld's closure test as the gate. Both are
     deterministic.
2. **Rule screen** (a P4-adjacent decision; changing it would change the goldens).
   - Consider Eppstein's growth/decay pre-screen.
   - Check whether B2 rules should be excluded alongside B1, and whether
     complement-equivalent rules should count as "used".
   - Calibrate against Yin 2026's census.
   - Note that Reia & Kinouchi locate Life at the border of extinction, not the
     edge of chaos.
3. **Measure, don't claim, open-endedness.** Add Bedau–Packard activity
   statistics (or MODES metrics) over the tier lineage as a Layer-E evaluation.
   "Rules never repeat" is guaranteed; open-endedness is not.
4. **Wording for any public description.** Call Culture's trigger "surprisal"
   (Shannon), not "surprise" in Itti & Baldi's Bayesian sense. Call the P5 map
   "block predictability gain", not "causal" or "downward causation".

## Gaps and follow-ups

- **Not read at method level:** Flow-Lenia's mixing operator, Genelife's rule
  modification, Peña & Sayama's Δ, Balduzzi's estimator. Read these before
  claiming any specific difference beyond the table above.
- **Surfaced but not checked:**
  - Layered Cellular Automata (arXiv:2308.06370);
  - Glaberish (arXiv:2205.10463);
  - "Conditions for Open-Ended Evolution in Immigration Games" (arXiv:2004.02720);
  - Sprout Life, Evolife;
  - "Causal Emergence 2.0" (arXiv:2503.13395);
  - the SVD-based causal emergence paper (arXiv:2402.15054).
- **Not searched:** hashlife and metapixel (Life-in-Life) constructions as
  hierarchy precedents; ambisonic or spatial mapping of 2D generative worlds
  (searched briefly, nothing found).
- **IP and patents:** deliberately out of scope (PA1). The repo has been public
  since 2026-10-01, which is itself a disclosure date.
