// Cross-implementation unit vectors, JS side. tests/vectors.cpp prints the
// same lines from libculture; ./verify diffs the two outputs. Doubles are
// printed as their exact 64-bit patterns so "equal" means bit-identical.
// Covers the pieces PORT_PLAN P1 asks to test in isolation: RNG, hash,
// ruleStr, screen and growth (both pure given an RNG state).
const path = require('path');
const Core = require(path.join(__dirname, '..', 'reference', 'core.js'));
const bits = x => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16).padStart(16, '0'); };
const out = [];
for (const seed of [0, 1, 42, 0xDEADBEEF, 0xFFFFFFFF]) {
  const r = Core.mulberry32(seed), v = [];
  for (let k = 0; k < 8; k++) v.push(bits(r()));
  out.push(`rng ${seed >>> 0} ${v.join(' ')}`);
}
// hash32 is internal to core.js; this copy is checked against the goldens'
// births indirectly, and against C++ directly here.
function hash32(vals) { let h = 2166136261 >>> 0; for (const v of vals) for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 255; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
for (const vals of [[], [0], [1, 2, 3], [0xFFFFFFFF, 7919, 977, 127]]) out.push(`hash32 ${vals.join(',')} ${hash32(vals)}`);
const rules = [{ born: 8, survive: 12 }, { born: 0b1000100, survive: 0b100110 }, { born: 0x1F0, survive: 0x0F2 }, { born: 0b100, survive: 0 }, { born: 0x48, survive: 0x1FF }];
for (const r of rules) {
  out.push(`ruleStr ${r.born} ${r.survive} ${Core.ruleStr(r)}`);
  for (const seed of [7, 99]) {
    const g = Core.mulberry32(seed); const sp = Core.growth(r, g, 0.3); const after = g();
    out.push(`growth ${r.born} ${r.survive} ${seed} ${bits(sp)} ${bits(after)}`);
    const s = Core.mulberry32(seed); const st = Core.screen(r, s); const after2 = s();
    out.push(`screen ${r.born} ${r.survive} ${seed} ${bits(st.density)} ${bits(st.activity)} ${st.ok ? 1 : 0} ${bits(after2)}`);
  }
}
// libm-sensitive functions the SIM depends on (SPEC §1, critic M1). pow only
// ever sees (excess, 1.5) with small integer excess: check the whole reachable
// range exhaustively. log2 feeds the score, which is STORED as float32, so the
// contract is equality after the float32 store (a 1-ulp double difference that
// rounds to the same float32 is harmless). Hashes keep the output short.
function fnvD(h, x) { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x, true); for (let k = 0; k < 8; k++) { h ^= d.getUint8(k); h = Math.imul(h, 16777619) >>> 0; } return h; }
function fnvF(h, x) { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, x, true); for (let k = 0; k < 4; k++) { h ^= d.getUint8(k); h = Math.imul(h, 16777619) >>> 0; } return h; }
let hp = 2166136261; for (let k = 0; k <= 65536; k++) hp = fnvD(hp, Math.pow(k, 1.5));
out.push(`pow15 0..65536 ${hp >>> 0}`);
// Score-domain samples: q = (t + 1) / denom with denom in [512, ~1e7), t in [0, denom).
let hl = 2166136261; const g = Core.mulberry32(2026);
for (let k = 0; k < 400000; k++) { const denom = 512 + Math.floor(g() * 1e7) + g(); const t = Math.floor(g() * denom); hl = fnvF(hl, -Math.log2((t + 1) / denom)); }
out.push(`log2f32 400000 ${hl >>> 0}`);
console.log(out.join('\n'));
