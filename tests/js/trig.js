// JS side of the trig check: Math.cos/Math.sin over the same arguments as
// `culture_vectors --trig`, hashed the same way. Only meaningful when
// tests/trig_flavor.js says "fma" (see core/src/fdlibm.hpp).
let h = 2166136261;
const d = new DataView(new ArrayBuffer(8));
const add = x => { d.setFloat64(0, x, true); for (let k = 0; k < 8; k++) { h ^= d.getUint8(k); h = Math.imul(h, 16777619) >>> 0; } };
for (let S = 1; S <= 1200; S++) for (let k = 0; k < S; k++) { const a = 2 * Math.PI * k / S; add(Math.cos(a)); add(Math.sin(a)); }
for (let k = -200000; k <= 200000; k++) { const a = k * 1e-4 * 1.0000001; add(Math.cos(a)); add(Math.sin(a)); }
console.log(`trig ${h >>> 0}`);
