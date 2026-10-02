// Which fdlibm flavor does this node's V8 run for Math.sin/Math.cos?
// "fma"   = built with fused multiply-add contraction (clang default on arm64,
//           e.g. Apple Silicon) — the flavor core/src/fdlibm.hpp reproduces.
// "plain" = no contraction (baseline x86-64 builds).
// The two disagree in ~0.6% of results (D-027); this argument is one of them.
// CLI prints the flavor; require() returns it.
const b = new DataView(new ArrayBuffer(8));
b.setFloat64(0, Math.sin(0.5094474573388854));
const bits = b.getBigUint64(0).toString(16);
const flavor = bits === '3fdf3664da86a9df' ? 'fma' : bits === '3fdf3664da86a9de' ? 'plain' : 'unknown:' + bits;
if (require.main === module) console.log(flavor);
module.exports = flavor;
