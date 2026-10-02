// Golden-trace generator for the Culture reference core.
// Usage: node tools/golden.js [--profile default|stress] [--out dir] [seed ...]   (default out: golden/)
// Writes golden/<profile>-seed-<n>.jsonl: a header line, one line per generation, a footer of births.
//
// Semantics ("instant search"): after every step(), any pending rule search is run to
// completion with work(p, Infinity). The browser prototype instead spreads the search over
// frames (3 candidates per frame), which shifts when births land. The C++ port must offer this
// instant-search mode so it can be checked against these traces.
const path = require('path'), fs = require('fs');
const Core = require(path.join(__dirname, '..', 'reference', 'core.js'));

const hl = v => Math.pow(10, v);
// Exactly the browser prototype's default slider values, converted the way ui.js converts them.
const PARAMS = {
  noise: 3 / 10000, hold: 4, hardness: 3,
  memory: Math.pow(0.5, 1 / hl(2.1)), forget: Math.pow(0.5, 1 / hl(1.8)), patience: Math.pow(0.5, 1 / hl(3.4)),
  margin: 0.04, maxSpeed: 0.30, gain: 0.25, crowding: 0.5, mutation: 1.0, spark: 10 / 100000,
  reactions: true, warmup: 300, extinction: 200, retreat: 400, sparkCooldown: 1500, speed: 1,
};
// "stress" turns up sparks and mutation and removes the crowding brake so every birth path,
// extinction and retreat appears within a short trace.
const PROFILES = {
  default: { params: PARAMS, gens: 3000, seeds: [1, 2, 3] },
  stress: { params: { ...PARAMS, spark: 50 / 100000, mutation: 3.0, crowding: 0 }, gens: 5000, seeds: [4] },
};
const W = 220, H = 140;

function fnv(bytes) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const tierBytes = t => new Uint8Array(t.buffer, t.byteOffset, t.byteLength);

function run(seed, PARAMS, GENS, profile) {
  const w = new Core.World(W, H, seed);
  const out = [JSON.stringify({ header: true, profile, seed, W, H, gens: GENS, params: PARAMS, search: 'instant',
    note: 'alive/tier are FNV-1a 32 hashes of the alive Uint8 grid and the tier Uint16 grid (little-endian bytes)' })];
  for (let g = 0; g < GENS; g++) {
    const events = [];
    const e1 = w.step(PARAMS); if (e1) events.push(e1);
    const e2 = w.work(PARAMS, Infinity); if (e2) events.push(e2);
    const clean = events.map(e => { const o = {}; for (const k of Object.keys(e)) o[k] = e[k]; return o; });
    out.push(JSON.stringify({
      gen: w.gen, alive: fnv(w.alive), tier: fnv(tierBytes(w.tier)),
      tiers: w.tiers.length, frontier: w.frontier, extinct: w.extinct.length, active: w.active,
      record: +w.record.toPrecision(10), lastMax: +w.lastMax.toPrecision(10), lastArg: w.lastArg,
      retreat: !!w.retreat, search: !!w.search,
      cells: w.tiers.map(t => t.cells),
      ...(clean.length ? { events: clean } : {}),
    }));
  }
  const births = w.tiers.slice(1).concat(w.extinct).sort((a, b) => a.gen - b.gen)
    .map(t => ({ idx: t.idx, gen: t.gen, rule: Core.ruleStr(t.rule), el: Core.ELEMENTS[t.el],
      kind: t.mutatedFrom != null ? 'mutation' : t.parents ? 'spark' : 'surprise', tries: t.tries, extinctAt: t.extinctAt ?? null }));
  out.push(JSON.stringify({ footer: true, births }));
  return out.join('\n') + '\n';
}

const args = process.argv.slice(2);
const pi = args.indexOf('--profile'), oi = args.indexOf('--out');
const profiles = pi >= 0 ? [args[pi + 1]] : Object.keys(PROFILES);
const outDir = oi >= 0 ? path.resolve(args[oi + 1]) : path.join(__dirname, '..', 'golden');
const flagged = new Set([pi, pi + 1, oi, oi + 1].filter(i => i >= 0));
const explicit = args.filter((a, i) => !flagged.has(i)).map(Number);
fs.mkdirSync(outDir, { recursive: true });
for (const name of profiles) {
  const P = PROFILES[name];
  for (const seed of explicit.length ? explicit : P.seeds) {
    const file = path.join(outDir, `${name}-seed-${seed}.jsonl`);
    fs.writeFileSync(file, run(seed, P.params, P.gens, name));
    console.log('wrote', file);
  }
}
