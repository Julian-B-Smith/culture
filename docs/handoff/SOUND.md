# Culture: sound spec

The reference is `reference/sound.js`, which uses Web Audio. It is an **ambient sonification**: the world is listened to, not played. The organizing idea is to map the world's structure to sound, not its individual cells. A ruleset is a voice, a contest between rulesets is dissonance, and an event is a gesture.

The audio engine only reads the world. It reads `world.stats`, which `step()` fills every generation, plus the tier records, `record`, `lastMax`, `frontierAge`, `warm`, `search`, `retreat`, `gen`, `lastBirth` and `meanEpoch`. It never writes to the world. Keep it that way in the port: the simulation must stay deterministic whether or not audio is running.

## Voices

Each tier holding at least 0.2% of the world gets a voice, up to the 10 largest. A dying tier keeps its voice regardless of size. A voice is created when its tier qualifies or when a birth event arrives. When a tier stays below the cutoff for 1.5 s, its voice fades out over 2 s (3 s if dying) and is retired; it comes back if the tier regains ground. A tier that leaves the stack is retired at once. Parameters update at about 15 Hz, with one-pole smoothing (`setTargetAtTime`, time constants 0.4–2 s).

**Spectrum = rule.** The voice's waveform is a single-cycle wave with 20 harmonics:
- harmonic 1 at amplitude 0.6
- for each survive bit c (0–8): harmonic c+1 gets `+1/(c+1)^tilt`
- for each born bit c (1–8): harmonic c+10 gets `+0.35/(c+10)^(0.6·tilt)`

A mutant differs from its parent by one or two partials, so you can hear kinship.

**Pitch: a just-intonation walk.**
- Base C2 = 65.41 Hz. Ratios are folded into [1, 4), a two-octave range.
- Tier 0 has ratio 1.
- A surprise birth steps from its `from` tier by `STEPS[hash % 12]`, where STEPS = 3/2, 4/3, 5/4, 6/5, 5/3, 7/4, 7/6, 8/7, 9/8, 11/8, 9/7, 13/8.
- A mutant sits within a few cents of its parent: `((hash % 31) − 15 + (hash odd ? 9 : −9))` cents. This ratio is not folded.
- A spark birth takes the folded product of its parents' ratios.

Because each step comes from the tier's hash, the tuning wanders and does not return.

**Color family sets timbre.** Spectral tilt (rolloff exponent) and filter Q per family:

| Family | Tilt | Q |
|---|---|---|
| ash | 1.3 | 0.4 |
| ember | 0.55 | 1.6 |
| gold | 0.8 | 2.4 |
| moss | 1.1 | 0.8 |
| tide | 1.5 | 3.2 |
| violet | 0.9 | 5.0 |

**Signal path per voice.**
- Two oscillators, A and B, sharing the wave. Each has its own lowpass filter → gain → stereo panner, so a spread-out tier can sound wide.
- Both gains also feed a feedback comb: delay = 1/f, output gain 0.35, through its own panner, which follows the voice's position.
- Everything sums into `out`, which splits into `near` (to the main bus, which feeds both dry and reverb) and `far` (straight to the reverb).

## State mappings (per voice)

| World quantity | Sound |
|---|---|
| Territory share | Loudness: `(sqrt(cover)·0.16 + bloom·0.06)·(0.35 + 0.65·min(1, 4·liveDensity))`, ×0.6 while dying |
| Motion (changed cells / territory) and feeding | Filter cutoff: `f·(1.5 + 10·min(1, 25·motion) + 6·min(1, 6·fed) + 12·bloom)`, darkened up to 35% when far away |
| Contest pressure / territory | A/B detune: total spread `2 + 28·min(1, 4·contest)` cents, so hot borders beat |
| Wall hardening / territory | Comb feedback: `0.15 + 0.75·min(1, wall/max(0.5, hardness))`, capped at 0.88, so entrenched frontiers ring |
| Circular mean of live cells in x | Stereo position. With mean x fraction fx and resultant length R: `focus = min(1, 2.2·R)`, `pos = (2·fx − 1)·focus`, `width = 0.06 + 0.9·(1 − focus)`. A pans to pos − width, B to pos + width, the comb to pos |
| Circular mean of live cells in y | Distance: top of the box is far (more reverb send, less direct, darker), bottom is near |

## Event gestures

| Event | Sound |
|---|---|
| Birth | The voice blooms: an extra gain and brightness envelope with a 4 s decay |
| Mutation | The new voice starts at the parent's pitch and glides to its own (τ ≈ 1.4 s) |
| Spark | Starts at the geometric mean of its parents' pitches and glides to its own (τ ≈ 0.9 s) |
| Retreat (`dying`) | Sinks an octave over the retreat's duration and is attenuated; retired when extinct |
| Surprise approaching threshold | Bandpassed noise riser. With `r = lastMax/(record·(1+margin))` (note: without the crowding `thresholdLift`) and `t = clamp((r − 0.55)/0.45)`: gain `0.05·t²`, center `250 + 3800·t²` Hz. When the frontier is still warming up or a retreat is running, r is 1 if a search is pending and 0 otherwise |
| Quiet past the typical epoch | Bus gain × `(1 − 0.45·over)`, far bus × `(1 − 0.3·over)`, reverb wet `0.7 + 0.5·over`, where over = gap/meanEpoch − 1, clamped to 0–1 |

## Master

Bus → dry (0.55) and convolution reverb (a generated 6.5 s stereo decaying-noise impulse, wet 0.7) → compressor (−18 dB threshold, ratio 3, knee 12) → master gain (slider squared) → output.

## Notes for the port

- **Seed the reverb impulse and riser noise.** The reference generates them with `Math.random`. Seed them from the world seed or a fixed seed so renders are reproducible.
- **Translating Web Audio:**
  - `PeriodicWave` → wavetable or band-limited additive oscillator
  - `BiquadFilterNode` → RBJ biquads; Web Audio's lowpass Q is in dB-ish units, so match by ear
  - `StereoPannerNode` → equal-power pan
  - `setTargetAtTime` → one-pole smoothing
  - `ConvolverNode` → partitioned convolution, or swap in an algorithmic reverb, since the user has their own FDN reverb (Reverb Station)
- **Click hazards already found:**
  - Cancelling scheduled automation snapped gains back to old values. Fade from the current value instead.
  - Per-frame automation across hundreds of nodes overloaded the audio thread. Update at about 15 Hz and keep the voice cap.
- **Voice identity.** Tier indices are reused after extinction (SPEC §8, quirk 8). Key voices by tier object or a unique birth ID, not by index.
- **Known untuned spots, to judge by ear:**
  - Register: 65–260 Hz gets muddy with five or more voices. Consider a wider fold or a per-family octave.
  - Riser level.
- **Not built yet:** the scanner layer, where a column sweeps the torus and triggers partials at tempo. It's the natural next sound feature and the bridge toward an instrument mode.
