// Deep-state trace, JS side (D-025). Per generation: hashes of the hidden
// per-site arrays the golden traces do not cover (pressure, wall, resist,
// harm, claimed, score) and the frequency table; hashes of the sound stats;
// the internal scalars as raw double bits; retreat and search state. The
// goldens hash only alive/tier, so a float32 rounding slip in pressure (SPEC
// §1's own example) passes all four of them — measured 2026-10-02 by planting
// `0.8f`, which this trace caught at gen 866.
// build/culture_trace --deep prints the same lines; ./verify diffs them.
// Generated live from reference/core.js; nothing here is pinned or stored.
//
// Usage: node tests/deep.js <default|stress|chaos> <seed> <gens>
// "chaos" exercises the call patterns the goldens never use (critic M2): a
// small odd-sized world, sliced search (work(p, 2), the browser's pattern),
// forceEmerge every 15 gens, and high spark/mutation/extinction rates.
// The trig-derived stats column prints "-" when this node's V8 is the plain
// fdlibm flavor (tests/trig_flavor.js); ./verify then masks the C++ side too.
const path = require('path'), fs = require('fs');
const Core = require(path.join(__dirname, '..', 'reference', 'core.js'));
const flavor = require(path.join(__dirname, 'trig_flavor.js'));
const [profile, seed, gens] = [process.argv[2], +process.argv[3], +process.argv[4]];
// Params come from a golden header: JSON prints doubles in shortest
// round-trip form, so they parse back to the exact values golden.js used.
const header = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'golden', f), 'utf8').split('\n', 1)[0]).params;
const PROFILES = {
  default: { params: header('default-seed-1.jsonl'), W: 220, H: 140, slice: Infinity, force: 0 },
  stress: { params: header('stress-seed-4.jsonl'), W: 220, H: 140, slice: Infinity, force: 0 },
  chaos: { params: { ...header('default-seed-1.jsonl'), spark: 0.002, mutation: 5, extinction: 30 }, W: 37, H: 23, slice: 2, force: 15 },
};
const P = PROFILES[profile];
if (!P) { console.error('profile must be default|stress|chaos'); process.exit(2); }
const p = P.params;

const FNV0 = 2166136261;
function fnv(bytes, h = FNV0) {
  h >>>= 0;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
const u8 = t => new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
const chain = arrs => arrs.reduce((h, a) => fnv(u8(a), h), FNV0);
const hx = h => (h >>> 0).toString(16).padStart(8, '0');
const dv = new DataView(new ArrayBuffer(8));
const bits = x => { dv.setFloat64(0, x); return dv.getBigUint64(0).toString(16).padStart(16, '0'); };

const w = new Core.World(P.W, P.H, seed);
const out = [];
for (let g = 0; g < gens; g++) {
  w.step(p);
  w.work(p, P.slice);
  if (P.force && w.gen % P.force === 0) w.forceEmerge(p);
  const s = w.stats;
  out.push([w.gen,
    hx(fnv(u8(w.pressure))), hx(fnv(u8(w.wall))), hx(fnv(u8(w.resist))), hx(fnv(w.harm)),
    hx(fnv(u8(w.claimed))), hx(fnv(u8(w.score))), hx(fnv(u8(w.table))),
    hx(chain([s.live, s.move, s.fed, s.contest, s.wall])),
    flavor === 'fma' ? hx(chain([s.cos, s.sin, s.cosY, s.sinY])) : '-',
    bits(w.record), bits(w.lastMax), bits(w.brake), bits(w.thresholdLift), bits(w.warm), bits(w.meanEpoch), bits(w.tableTotal),
    w.reignStart, w.lastBirth, w.frontierAge, w.starve, w.tiers.length, w.extinct.length,
    w.retreat ? `${w.retreat.tier}:${w.retreat.t}:${w.retreat.dur}` : '-',
    w.search ? `${w.search.tries}:${w.search.h}` : '-',
  ].join(' '));
}
console.log(out.join('\n'));
