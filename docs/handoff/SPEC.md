# Culture: simulation spec

This describes the reference core, `reference/core.js`. Where this document and the code disagree, **the code is normative**: it produced the golden traces. Every behavior below, including the quirks listed at the end, is needed for trace parity.

## 1. World state

The world is a W×H torus. Both axes wrap, and every neighborhood lookup is modulo W and H. The default size is 220×140; the prototype offers 165×105, 220×140, 330×210, 440×280 and 550×350, all at the same aspect ratio.

Per-site arrays (n = W·H). The element types matter for parity.

| Array | Type | Meaning |
|---|---|---|
| `alive`, `next` | uint8 | Life state, double-buffered |
| `tier` | uint16 | Index of the tier whose rule governs this site |
| `pressure` | **float32** | Contact pressure from higher (or pushing) tiers; accumulates and leaks |
| `wall` | **float32** | Border hardening; raises the pressure needed to convert this site |
| `harm` | uint8 | Last harm category at this site: 1–9 = a cell died at neighbor count 0–8 |
| `resist` | **float32** | Acquired resistance to that harm category |
| `claimed` | int32 | Generation this site was taken by its current tier |
| `score` | **float32** | Per-site surprise in bits (frontier cells only) |
| `integral` | float64 | (W+1)·(H+1) summed-area table of `score` |

World scalars: `gen`, `frontierAge`, `record`, `lastMax`, `lastArg`, `starve`, `table` (float64[512]) and `tableTotal`, `meanEpoch` (init 600), `lastBirth` (init 0), `reignTier`/`reignStart`, `active`, `brake`, `thresholdLift`, `warm`, `retreat` (null or `{tier, from, to, t, dur}`), `search` (null or a search job), `sparkLast` (map from pair key to generation), and `usedRules` (set of rule strings, so no rule is ever used twice).

### Tiers

`tiers` is an ordered stack. Index 0 is Conway's Life (B3/S23). The **frontier** is the last index. Each tier record holds:

- `rule`: `{born, survive}` as 9-bit masks over neighbor counts 0–8. Bit c set means the rule applies at count c.
- `el`: color family 0–5 = ash, ember, gold, moss, tide, violet. Tier 0 is ash; new tiers are never ash.
- `react[6]`: reaction toward each family: 0 none, 1 push back, 2 feed on, 3 spark with. The entry for the tier's own family is always 0.
- Lineage: `gen`, `origin[x,y]`, `surprise`, `tries`, `hash`, `speed`, `parents` (spark), `mutatedFrom` (mutation), `from` (the frontier at search start), `quiet`, `reign`.
- Live bookkeeping: `cells` (sites held), `dying` (during retreat), `extinctAt`.

Extinct tiers move to `world.extinct` and their rules stay in `usedRules`. Tier 0 starts with `cells = n` and `speed = 0.25`.

### Arithmetic precision

All arithmetic is in **double**, including parameters, temporaries and constants such as `0.8`. The float32 arrays are rounded only when a value is stored, and later reads use the stored float32 value. For example, `pressure ≥ hold·(1 + wall)` reads both from float32 storage and compares in double. A port that uses `0.8f`, float parameters or float temporaries will drift.

`Math.log2` (score), `Math.pow` (`excess^1.5` and the half-life factors) and `Math.cos`/`Math.sin` (stats only) are V8's implementations, which can differ from a platform libm by one ulp. log2 and pow feed RNG comparisons and thresholds. Two mitigations:
- Pass parameters as exact doubles; the trace header carries them, and they can be emitted as hex floats if needed.
- If parity breaks, check `log2`/`pow` against V8 first, and port V8's fdlibm-derived versions if necessary.

## 2. Randomness

Everything is deterministic from the seed. There are two kinds of PRNG stream, both **mulberry32** (32-bit state; integer ops are exact, output = uint32 / 2^32 as a double):

- **World stream** `world.rng`, seeded with `seed >>> 0`. It is consumed in program order by the constructor (tier-0 genome, then the initial 30% soup in index order), then by `step()` in the order given below.
- **Search stream** `search.rng = mulberry32(h)`, where `h` is the FNV-1a hash of the trigger context (§5). It is consumed by candidate generation, `growth()`, `screen()`, family and genome draws, and disc seeding.

The order of RNG calls is part of the contract. A C++ port must make its calls in exactly the same order, including calls whose results are discarded (for example `elx` is drawn even for mutants).

`hash32(vals)`: FNV-1a over each value's 4 bytes, little-endian, starting at 2166136261 with multiplier 16777619.

## 3. One generation: `step(p)`

All parameters are in `p`; see §7.

**Precompute per tier pair (a, b), a ≠ b:**
- `canPush[a][b]` is true when a is not the dying tier and either:
  - a is newer (a > b) and *not* (reactions are on **and** b pushes back against a's family). With reactions off, a newer tier always pushes; or
  - reactions are on and a pushes back against b's family.
- `sparks[a][b]` requires all of: reactions on; either tier sparks with the other's family; `gen − sparkLast[pair] > sparkCooldown` (pair key = min·4096 + max, missing key treated as −1e9); and `frontierAge > warm/2`.
- **Stale values.** `warm` here, and `brake` in the spark draw of §3.3, are the values computed in §3.5 of the **previous** step. On the first step `warm` is undefined and `p.warmup` is used; `brake` starts at 1. Mutation (§3.6) uses the values from the **current** step's §3.5.
- Fed masks: `bornFed = (born | born<<1) & 0x1FC` and `survFed = (survive | survive<<1 | survive>>1) & 0x1FF`.

**3.1 Life update.** Raster order: y outer, x inner. Count the 8 neighbors in `alive` and read the site's tier rule.
- **Fed:** if reactions are on, the tier feeds on some family, and any live neighbor of a *different* tier belongs to a fed-on family, use the fed masks and increment `fedCount[tier]`.
- **Hysteresis:** if the cell is alive and would die, and `gain > 0`:
  - Let `cat = c + 1`. If `harm == cat`, draw rng; if the draw is `< resist`, the cell survives.
  - Otherwise set `resist = (harm == cat) ? min(1, resist + gain) : gain`, then `harm = cat`.
  - (One RNG draw happens only when `harm == cat`.)
- `resist *= forget` for every site, every step.
- Accumulate the per-tier sound statistics: live count, motion, circular means in x and y (cos/sin tables over 2π·x/W and 2π·y/H).
- Track the frontier's live count and motion.
- All of these are counted on `next` **before** the noise flips of §3.2, and use tier ownership **before** this step's claims. §3.8 extinction depends on this.

**3.2 Noise.** Draw `flips = floor(noise·n + rng())`, then repeat `flips` times: set `next[floor(rng()·n)] = 1`. Then swap the buffers.

**3.3 Territory.** Raster order, reading the new `alive`. For each site with tier t, scan the 8 neighbors in order: NW, N, NE, W, E, SW, S, SE.
- Skip dead neighbors and neighbors of the same tier.
- If `canPush[tj][t]`: increment `push` and set `m = max(m, tj)`.
- **Spark draw:** if the site is alive, `sparks[t][tj]` holds, and no spark site has been chosen yet this step, draw rng; if the draw is `< spark·brake`, record this site and the pair (min, max). (The draw happens inside the neighbor loop, so it is RNG-order-sensitive.)

Then, per site:
- If `push == 0`: `pressure *= 0.8`, set it to 0 when below 0.05 (only when it was > 0), and `wall *= forget`.
- Otherwise: `pressure = pressure·0.8 + push`. Add push to `contest[t]` and `contest[m]`, and add `wall` to `wallT[t]`.
  - If `pressure ≥ hold·(1 + wall)`, queue a claim (site → m).
  - Else `wall = min(hardness, wall + 0.2·gain)`.

Apply all claims after the scan: set the tier, zero `pressure`, `wall`, `harm` and `resist`, and set `claimed = gen`.

**3.4 Retreat.** If a retreat is running: increment `t`, then let `threshold = from − (from − to + 1)·min(1, t/dur)`. Every site of the dying tier with `claimed ≥ threshold` reverts to tier `dying − 1`, with `pressure` and `wall` zeroed. `harm`, `resist` and `claimed` are left as they are. When `t ≥ dur`:
- revert all remaining sites of that tier, changing nothing but `tier`,
- pop the tier into `extinct`,
- clear the retreat, reset the frontier stats, and emit `{extinct}`.

**3.5 Counts, crowding and reign.**
- Count sites per tier.
- `active` = number of non-dying tiers holding at least 1% of n. Let `excess = max(0, active − 2)`.
- `brake = 1/(1 + crowding·0.6·excess^1.5)`.
- `thresholdLift = 1 + crowding·0.05·excess`.
- `warm = warmup·(1 + crowding·excess)`.
- The **reign tier** is the tier with the most sites, with ties going to the lower index. When it changes, `reignStart = gen`.
- Set `tier.cells`.

**3.6 Early exits, in this order:**
1. If a retreat is running or one just finished: `gen++`, `lastMax = 0`, `lastArg = −1`, and return the finish event if there is one. **No** surprise pass and **no** `frontierAge++`.
2. If a spark site was chosen and no search is pending: `gen++`, `sparkLast[pair] = gen`, start a search (§5), and return. Again no surprise pass.
3. **Mutation**, if no search is pending, `mutation > 0` and `frontierAge > warm`. Let D be the reign tier, `share = cells_D/n`, and `reign = (gen − reignStart)/meanEpoch`. Draw rng and compare it with the probability evaluated strictly left to right: `((((mutation·brake)·share)·reign)·reign)/meanEpoch`. If the draw is smaller, pick a live site of D with up to 4000 uniform draws `floor(rng·n)`. If one is found: `gen++`, start a mutation search from D, and return. If none is found, fall through to §3.7.

**3.7 Surprise.** Only live cells of the frontier count.
- Decay the frequency table: every entry of `table` and `tableTotal` is multiplied by `memory`.
- For each live frontier cell, form a 9-bit code from its 3×3 neighborhood. Bit order: NW=1, N=2, NE=4, W=8, self=16, E=32, SW=64, S=128, SE=256.
- With `denom = tableTotal + 512` (taken **before** this step's additions), `score = −log2((table[code] + 1)/denom)`, stored as float32.
- Then add 1 per cell to `table[code]`, and add the cell count to `tableTotal`.
- Build the summed-area table in float64 from the float32 scores, using exactly this recurrence (rounding depends on it): per row, a double running sum `row += score[y][x]`, then `I[(y+1)(W+1) + x+1] = I[y(W+1) + x+1] + row`. Evaluate each window sum left to right as `I[A] − I[B] − I[C] + I[D]`, where A = (y+R+1, x+R+1), B = (y−R, x+R+1), C = (y+R+1, x−R), D = (y−R, x−R) and R = 2. Take the **max 5×5 window sum** over centers with `x ∈ [2, W−3]` and `y ∈ [2, H−3]` (no wrap) whose center site belongs to the frontier. Strictly greater wins, raster order.
- `lastMax`, `lastArg` ← that max and its site. Then `frontierAge++` and `gen++`.

**3.8 Extinction.** `starve` increments while the frontier has fewer than 4 live cells or fewer than 3 changed cells; otherwise it resets to 0. If F > 0 and `starve > extinction`:
- mark the frontier as dying,
- start a retreat with `from` = the latest `claimed` among its sites (at least its birth gen), `to` = its birth gen, and `dur = max(30, round(retreat·cells/n))`,
- emit `{dying}`.

**3.9 Surprise emergence.**
- While `frontierAge ≤ warm`: `record = max(record, best)`, and return.
- If a search is pending: return. The record does not decay in this case.
- If `arg ≥ 0` and `best > record·(1 + margin)·thresholdLift`: start a surprise search (§5).
- Otherwise `record *= patience`.

## 4. Rule screening

Both tests take the search stream.

**`growth(rule, rng, limit)`**: invasion speed.
- Use a 96×96 grid, *not* toroidal; the edges are never updated. Seed the 6×6 block at offsets −3…2 around the center (48, 48) at density 0.45, in row order.
- Run 60 generations. Every 10th generation, before stepping (when `t % 10 == 9`): if `limit` is given and `maxChebyshevRadius − 3 > limit·60 + 2`, return 1 (reject early).
- The result is `max(0, r − 3)/60`. 1.0 is the speed of light; Conway's gliders move at 0.25.

**`screen(rule, rng)`**: edge-of-chaos test.
- 48×48 torus, 35% random soup, 280 generations.
- At t = 80, return not-ok if the number of changed cells is 0 or exceeds 40% of the grid.
- Count changed cells during t = 250…279.
- `density` = final live fraction and `activity` = changes/(30·N²).
- ok when `0.04 < density < 0.5` and `0.01 < activity < 0.2`.

## 5. Births: search and placement

**`emerge(site, surprise, p, parents?, mutateFrom?)`** starts a search job. The hash input is: seed, number of tiers, number of extinct tiers, the parents term (`p0·977 + p1 + 1`, or 0), the mutation term (`mutateFrom + 7919`, or 0), then seven 7-bit row words of the 7×7 neighborhood of `alive` around the site (wrapping). Rows run dy = −3…3. Within a row, bits are shifted in for dx = −3…3, so dx = −3 is the most significant bit (bit 6) and dx = +3 is bit 0. The job remembers the current frontier as `parent`.

**`work(p, maxCandidates)`** runs at most `maxCandidates` candidates. If the frontier changed or a retreat started, the job is cancelled. Each candidate:
- **Mutation:** start from D's rule. Flip 1 bit (probability 0.6) or 2 bits. Each flip draws `bit = floor(rng·16)`: values 0–6 flip born bit `bit + 2`; values 7–15 flip survive bit `bit − 7`.
- **Otherwise:** born bits 2–8 each with probability 0.28, then survive bits 0–8 each with probability 0.4.
- Reject when born is empty, when the rule is already in `usedRules`, when `growth > maxSpeed`, or when `screen` fails.

After 800 tries without success, the search ends. For a mutation, `lastBirth = gen`. In both cases `record *= 1.05`. A search **cancelled** by `work()` (frontier changed or retreat started) does neither.

**On success:**
1. Add the rule to `usedRules`.
2. Draw the family: `elx = 1 + floor(rng·5)`, redrawn up to 6 times while it equals either spark parent's family.
3. **Genome:**
   - Mutants copy their parent's family and reactions. Draw rng; if it is < 0.35, draw `e = floor(rng·6)`, and only if e is not the parent's own family draw `react[e] = floor(rng·4)`. (When e equals the parent's family, the third draw is skipped.)
   - Otherwise `genome(rng, elx)`: for each other family, `u < 0.5` gives none, `< 0.68` push, `< 0.88` feed, else spark.
4. Push the tier record.
5. `meanEpoch = 0.7·meanEpoch + 0.3·max(50, gen − lastBirth)`, then `lastBirth = gen`.
6. Stamp a disc of radius 6 around the site (wrapping), in the order dy outer, dx inner over −6…6, keeping `dx² + dy² ≤ 36`. Each disc site gets the new tier, `harm = resist = wall = 0` and `claimed = gen`, and is set alive with probability 0.35. Live cells are never cleared.
7. Reset the frontier stats and emit `{tier, gen, x, y}`.

`forceEmerge(p)` starts a surprise search at `lastArg` when no search is pending, no retreat is running, and `lastArg ≥ 0`.

## 6. Events

`step()` and `work()` return at most one event each:

| Event | Meaning |
|---|---|
| `{searching, x, y, gen, spark}` | A search started |
| `{tier, gen, x, y}` | A birth was placed |
| `{dying, gen}` | A retreat began |
| `{extinct, gen}` | A retreat finished |

## 7. Parameters

These are the browser defaults, converted the way `ui.js` converts slider values. A half-life slider value v becomes the per-step factor `0.5^(1/10^v)`.

| Param | Default | Internal |
|---|---|---|
| noise | 0.03 %/gen | 0.0003 |
| hold (contact needed) | 4 | 4 |
| hardness | ×4 | 3 |
| gain (resistance per harm) | 25 % | 0.25 |
| forget (memory of harm) | half-life 10^1.8 ≈ 63 gen | 0.5^(1/10^1.8) |
| memory (statistics) | half-life 10^2.1 ≈ 126 gen | 0.5^(1/10^2.1) |
| patience (record) | half-life 10^3.4 ≈ 2512 gen | 0.5^(1/10^3.4) |
| margin | 4 % | 0.04 |
| maxSpeed | 0.30 c | 0.30 |
| crowding | 50 % | 0.5 |
| mutation | 1.0× | 1.0 |
| spark | 1.0 per 10k contacts | 0.0001 |
| reactions | on | true |
| warmup / extinction / retreat / sparkCooldown | fixed | 300 / 200 / 400 / 1500 |
| speed (UI only) | 1× | steps per frame; ¼ to 12 |

## 8. Known quirks (preserve for parity, then decide)

These are behaviors of the reference that may not be intended. Port them faithfully first. Each one is a candidate for a deliberate DECISIONS entry later.

1. **Retreat reverts to `dying − 1`, not to the true parent.** For spark and mutation births, the tier below in the stack may be unrelated to the dying tier.
2. **Spark, mutation and retreat steps skip the surprise pass and do not advance `frontierAge`.** On spark and mutation steps `lastMax` and `lastArg` keep their previous values. On retreat steps they are reset to 0 and −1.
3. **The record freezes while a search is pending.** The early return comes before `record *= patience`.
4. **A failed search multiplies the record by 1.05**, which slightly delays the next surprise birth.
5. **The surprise window excludes a 2-cell border** and does not wrap, even though the world is toroidal.
6. **`elx` is drawn even for mutants**, so it consumes search-stream randomness.
7. **The reign check `D === tiers.indexOf(reignTier)` is effectively always true.**
8. **Tier indices are reused after extinction.** The UI keys colors by birth order to work around this. Anything keyed by tier index (sound voices, `sparkLast`) can alias across a retreat.
9. **`sparkLast` keys use the generation after the increment.**
10. **Float types are mixed** (§1). Use float32 exactly where the reference does, or the traces will drift.

## 9. Search timing modes

The reference supports two call patterns, and the port should support both:

- **Instant** (golden traces): after every `step()`, call `work(p, ∞)`. A birth lands in the same generation as its trigger.
- **Sliced** (browser): call `work(p, k)` once per animation frame, with k = 3. A birth lands some frames later, so the trace depends on the frame and speed schedule and is not reproducible across machines.

For the port, a third mode is recommended: **deterministic latency**. Run the search on a worker thread, but apply its result at exactly `trigger gen + L` generations, blocking if it isn't ready. This gives fluid real-time playback and reproducible worlds at the same time. See PORT_PLAN.md.

## 10. Spores (user-placed emergence)

**`emergeAt(x, y, p)`** wraps `x` and `y` onto the torus and, when no search is pending and no retreat is running, calls `emerge(y·W + x, lastMax, p)`. It returns the search event, or null when refused. Everything downstream (hashing, search, screening, placement) is §5 unchanged. Note that the hash's 7×7 window is centred on the chosen cell, which need not belong to the frontier tier.

**Budget (shell, not core).** The budget lives in the UI layer, not in `World`:
- `ready` when no spent emergence is pending, `gen ≥ readyGen`, and the world has no search or retreat.
- Spending (a spore or `forceEmerge`) when not ready is refused. When ready, the call is made; if it returns an event, the shell records the tier count and marks the emergence pending.
- Each frame, once the world's search has ended: if the tier count grew, `readyGen = gen + 900`; either way the pending mark clears. So a search that finds no rule costs nothing.
- A new world resets the budget.

**Switch.** A Spores switch (page button, CRT menu item "SPORES"), on by default. Off, clicks do nothing and forced emergence bypasses the budget, as before spores existed.

**User-made tiers.** When a spent emergence is born, the shell marks the new tier `byUser` (it is always the last tier, since searches never overlap). The core never reads this mark. The drum conductor (SOUND.md, Rhythm) counts only tiers without it, so spores and forced births don't rush the drums' build-up.

**One-time hint.** The first time a browser shows full screen with spores on, the corner reads CLICK (or TAP) THE WORLD TO RELEASE A SPORE for 7 seconds. Whether it has been shown is remembered in localStorage when available.

**Input log and replay.** Every successful spend, budgeted or not, is logged as `{ gen, kind: "spore" | "force", x, y }`, where gen, x and y are those of the search event. The page exposes `window.cultureRun()` → `{ seed, size: [W, H], inputs }`. `tools/golden.js --inputs run.json` replays a log: each input is applied when the world reaches its generation, before the next `step()`, and in instant-search mode its search runs to completion at once. A refused input is recorded as `{ input, refused: true }`. `golden/default-seed-7-inputs.jsonl` is the oracle for this path; the other traces use no input and are unchanged.

A log taken from the browser describes a scenario rather than an exact replay, because the browser's sliced search depends on frame timing (§9). For exact replays, the port records and replays in one of its deterministic search modes.
