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
| Full screen on a portrait screen | The box is drawn turned 90° clockwise, and the mapping follows the screen: pan comes from world y (screen left = world bottom), distance from world x (screen top = world left) |

## Event gestures

| Event | Sound |
|---|---|
| Birth | The voice blooms: an extra gain and brightness envelope with a 4 s decay |
| Mutation | The new voice starts at the parent's pitch and glides to its own (τ ≈ 1.4 s) |
| Spark | Starts at the geometric mean of its parents' pitches and glides to its own (τ ≈ 0.9 s) |
| Retreat (`dying`) | Sinks an octave over the retreat's duration and is attenuated; retired when extinct |
| Surprise approaching threshold | Bandpassed noise riser. With `r = lastMax/(record·(1+margin))` (note: without the crowding `thresholdLift`) and `t = clamp((r − 0.55)/0.45)`: gain `0.05·t²`, center `250 + 3800·t²` Hz. When the frontier is still warming up or a retreat is running, r is 1 if a search is pending and 0 otherwise |
| Quiet past the typical epoch | Bus gain × `(1 − 0.45·over)`, far bus × `(1 − 0.3·over)`, reverb wet `0.7 + 0.5·over`, where over = gap/meanEpoch − 1, clamped to 0–1 |

## Tape (VHS audio: its own switch, on by default; P-050)

Crossfaded in over ~0.15 s between the compressor and the master gain. Linear-track VHS character:
- highpass 55 Hz, head-bump peak +2.5 dB at 95 Hz
- tanh saturation, drive 1.8, 2× oversampled
- wow and flutter: an 8 ms delay whose time is modulated by 0.55 Hz (±1.1 ms), 7.3 Hz (±0.09 ms) and 0.13 Hz (±0.7 ms) sines
- lowpass 9 kHz then 11 kHz
- stereo narrowed to 82/18 crossfeed
- hiss (noise, 1.8–8.5 kHz, gain 0.0045) and mains hum (60 Hz at 0.0012, 180 Hz at 0.0005)
- dropouts: built (`dropout()` in sound.js, `glitchY`/`glitchAmt` in the CRT shader) but switched off; see P-034

## Master

Bus → dry (0.55) and convolution reverb (a generated 6.5 s stereo decaying-noise impulse, wet 0.7) → compressor (−18 dB threshold, ratio 3, knee 12) → master gain (slider squared) → output.

## Timbres (P-043 to P-045)

Reference: `texture.js`, `timbre.js`, `engines.js`, and the timbre parts of `sound.js`. Switchable (page button and CRT menu item "TIMBRES"); on by default.

**Fingerprint.** At birth, each rule runs for 160 generations on a seeded 40×40 patch, giving five 0–1 descriptors:
- **density:** share of cells alive.
- **activity:** cells changing per generation, ×3, capped at 1.
- **cluster:** live neighbours per live cell, ÷8.
- **symmetry:** share of live cells whose 3×3 neighbourhood is mirror- or point-symmetric.
- **still:** share of live cells unchanged over the last 10 generations.

The same descriptors are measured live per tier a few times a second, from alternate rows, and smoothed. They move a voice *within* its class.

**Class.** The class is chosen once per tier from the fingerprint and colour (`Timbre.classify`). Tier 0 is always drone. Over viable rules the classes split roughly drone 21%, arpeggio 23%, crystal 23%, breath 21%, rumble 11%.

| Class | Typical rule | Engine |
|---|---|---|
| drone | the middle ground | the original voice (above) |
| breath | churning, asymmetric | noise through 3–5 narrow band-passes on the rule's chord, flickering with activity |
| rumble | dense, clustered, slow | sub tone, saw/square body, fifth, low noise; tremolo from activity; a resonant "growl" band (about 5× the root) so it carries on small speakers |
| arp | sparse, moderately active | short notes stepping through the rule's chord on the shared pulse |
| crystal | symmetric, still | sparse bells; inharmonic partials for cold colours, near-harmonic for warm; −8 dB high shelf at 2.4 kHz, output ×0.6 |

**Colour.** Each family has a temperature (ember +1, gold +0.75, moss +0.1, ash −0.15, violet −0.6, tide −1). Moss is "organic" and ash is "dusty". Warm voices are rounder, lower and saturated, and their chords avoid harmonics 7, 11 and 13. Cold voices are narrower and glassier, and their chords trade 5 and 10 for 3 and 6. Moss wanders and plucks; ash adds a dusty tick.

**Chord per rule.** Surviving on n neighbours contributes harmonic n+1, and birth on n contributes harmonic n+2. Harmonics are folded into three octaves above the voice's root (the just-intonation walk).

**Shared field** (`Timbre.Field`):
- **Pulse:** one beat for every note engine and the drums. The tempo drifts between 66 and 108 bpm with mean activity; the beat grid is re-anchored, never jumped.
- **Consonance check:** a new note must form a simple ratio with everything sounding. That means a fraction within 6 cents with numerator × denominator ≤ 40, so 3/2 and 7/4 pass while 9/8 and 45/32 fail. Otherwise the voice tries its other chord tones or rests.
- **Note budget:** 14 notes a second across all voices (7 on phones). Louder voices get priority when it runs short.

**Audibility** (P-044). A tier keeps a voice while it holds 60 cells (or 0.2% of the world, whichever is smaller), and always for its first 12 seconds. Level is cover^0.35 × 0.12, plus a birth swell of 0.09 decaying over 7 s, times the density factor as before.

**Fullness and space** (P-044). `fill` is the smoothed share of the world alive, and `full = min(1, fill/0.25)`.
- The voice bus is scaled by 0.6 + 0.4·full (on top of the quiet thinning).
- A second room adds a 10 s, darker, one-pole-smoothed tail (5 s on phones), with 90 ms pre-delay and a 4.2 kHz low-pass. Its send is 0.05 + 0.7·(1 − full)².

**Stereo** (P-045). Panners are replaced by an ear model:
- **Timing:** a source to one side reaches the far ear up to 0.66 ms late.
- **Level:** the far ear is up to 45% quieter.
- **Shadow:** the far ear is low-passed, from 18 kHz down to 5 kHz.
- **Per-voice offset:** each voice has a fixed random offset of up to ±0.3 ms between the ears.

Phones keep the plain panner. The ear model mimics the panner's interface (`.pan.value`, `.pan.setTargetAtTime`, with a 0.3 s minimum glide).

## Rhythm (P-046)

Reference: `drums.js`, `rhythm.js`, and the rhythm parts of `sound.js`. Switchable (page button, CRT menu item "DRUMS", full-screen "Drums" button, D key); on by default. It plays only while timbres are on.

**Parts.** The four largest voiced tiers (two on phones) each play a part, built once from the tier's hash, class, fingerprint and colour (`Rhythm.part`).

| Class | Plays |
|---|---|
| drone | kick |
| rumble | toms, plus kick ghosts when disordered |
| breath | snare or clap, plus shaker (not for cold colours) |
| arp | usually nothing; one in five gets a sparse hat |
| crystal | rim or clave (cold), conga or cowbell (warm), rim or clave (otherwise) |

**Disorder.** 0.45·activity/0.5 + 0.25·(0.5 − symmetry)/0.3 + 0.4·(1 − still), clamped to 0–1.
- **Ordered** (below 0.3–0.45): 16-step loops on the grid. Four on the floor, a backbeat on steps 4 and 12, straight eighths, and 5-over-16 or 3-over-8 patterns.
- **Middle:** Euclidean patterns rotated off the downbeat, with ghost notes. Ghost probability is 0.35 × disorder.
- **Chaotic:** loops of 7, 9, 11 or 13 steps that cycle against the bar.

**Feel.**
- **Swing:** 0.12 for warm colours, plus 0.18 × organic, plus 0.08 × disorder unless cold, as a fraction of a sixteenth.
- **Looseness:** 3 ms + 12 ms × disorder + 8 ms × organic.
- **Tone:** 0.5 − 0.25 × temperature, ± random.

**Gravity.** On a 16-step bar:
- **Kicks** are drawn to step 0 (strength 1) and step 8 (strength 0.5).
- **Snares and claps** are drawn to steps 4 and 12.
- **Push-off:** kicks are pushed off 4 and 12 while a snare part plays, and snares off 0 while a kick part plays.
- **Neighbours:** hits next to a well fall in, and hits on a well are accented.

Strength is G = max(0.5, 1 − 0.6 × disorder), resolved per bar from (hash, bar, lane, position). Hits on a well resist thinning with at least G·(0.5 + 0.5·intensity). Measured over 200 bars: ordered rules have a kick on 1 in 100% of bars, chaotic rules in 48% (34% without gravity); chaotic rules have snares on both 2 and 4 in 61% of bars (30% without).

**Thinning.** Intensity is full^1.4 × (1 − 0.6·over). Each hit survives with probability min(1, (0.15 + 0.85·intensity)·(0.6 + 0.6·velocity)) × sparse, where sparse is 0.6 for ash and 1 otherwise.

**Lead kick and ducking.**
- **Choosing the lead:** the loudest tier with a kick part leads. It is re-chosen at the top of a bar only when another tier is 30% louder.
- **The lead kick:** goes, centred, straight to the drum bus at full velocity. Each lead kick dips the voice bus's lows below 150 Hz by up to 6 dB (an inverted low-passed copy added to the dry path; 4 ms attack, about 0.3 s release).
- **The sub bus:** every other kick, centred at half velocity, plus toms, shaker, rim and the rest, goes through a sub bus that dips about 8 dB under each lead kick.
- **Not ducked:** snares, claps and hats go to the drum bus directly.
- **Placement:** each tier's non-kick drums are placed where the tier sits.
- **Drum bus:** gain 0.7, mostly dry to the compressor, with a 0.18 send to the room.

**Kick.** Three layers:
- **Beater:** low-passed noise, 1.4–4 kHz.
- **Body:** a sine dropping from (2.4 + 1.6·punch)× to the root, which is 45–65 Hz.
- **Saturated copy:** the body through tanh.

Punch is per tier: 0.5 ± 0.3, −0.15 × temperature, +0.1 × disorder, clamped to 0–1.

**Slicing** (drill'n'bass). Slicing waits until the conductor admits snares, then applies to non-kick voices.
- **Bursts:** a hit becomes a burst of 3–8 retriggers in one or two steps with probability 0.012 + 0.05 × disorder. Gaps shrink or grow by ×0.78 or ×1.28, pitch bends ±0.45, and the burst swells in or fades out.
- **Rolls:** the snare on step 12 rolls with 6–12 hits to the end of the bar with probability 0.04 + 0.18 × disorder.
- **Switch:** the `SLICE` constant scales everything, and 0 turns slicing off.

**Conductor.** Runs in generations.
- **Gates:** a new world starts silent. Each group waits for a number of emergences (births plus extinctions) drawn per world: textures about 2, snares about 4, kicks about 6 (rough bell curve, ±1–2, ordered so textures ≤ snares ≤ kicks). Snares, claps and toms count as the snare group; hats, shaker, rim and the rest are textures.
- **Sections:** once textures are in, the rhythm plays in sections of 2,400–6,000 generations. Each opens with textures, adds snares after 480–1,200 generations and kicks 600–1,500 after that, then rests for 900–2,700 generations.

**Unused for now.** `drums.js` also holds synthesized "space" percussion: VHS blip, static, tape tick, bubble, skitter, ice, drip. These were tried as textures and set aside until the user builds his own suite.

**For the port.** The sound layer uses `Math.random` for flicker, timing jitter, slicing and the conductor. The simulation core is unaffected, and the golden traces still pass. For Phase 3's bit-reproducible offline render, give the sound layer its own seeded generator.

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
- **Phones click where laptops don't.** The audio thread misses deadlines when the device is busy. The reference asks for `latencyHint: 'playback'` (larger buffers) everywhere and, on touch devices, caps voices at 6, shortens the reverb impulse to 3.5 s and updates parameters at 10 Hz. In the port, size the audio buffer generously and keep the audio thread's work bounded per block.
- **Voice identity.** Tier indices are reused after extinction (SPEC §8, quirk 8). Key voices by tier object or a unique birth ID, not by index.
- **Known untuned spots, to judge by ear:**
  - Register: 65–260 Hz gets muddy with five or more voices. Consider a wider fold or a per-family octave.
  - Riser level.
- **Not built yet:** the scanner layer, where a column sweeps the torus and triggers partials at tempo. It's the natural next sound feature and the bridge toward an instrument mode.
