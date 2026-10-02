// Compare a port's trace against a golden trace and report the first divergence.
// Usage: node tools/compare.js golden/default-seed-1.jsonl path/to/port-seed-1.jsonl [--float-rel 1e-6]
// Integer fields (hashes, counts, indices, events) must match exactly. record/lastMax are
// compared with a relative tolerance, because they are printed to 10 significant digits.
const fs = require('fs');
const [, , goldPath, portPath, ...rest] = process.argv;
if (!goldPath || !portPath) { console.error('usage: node tools/compare.js <golden.jsonl> <port.jsonl> [--float-rel 1e-6]'); process.exit(2); }
const ri = rest.indexOf('--float-rel');
const rel = ri >= 0 ? Number(rest[ri + 1]) : 1e-6;
const read = p => fs.readFileSync(p, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const G = read(goldPath), P = read(portPath);
const exact = ['gen', 'alive', 'tier', 'tiers', 'frontier', 'extinct', 'active', 'lastArg', 'retreat', 'search'];
const floats = ['record', 'lastMax'];
const close = (a, b) => a === b || Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));
let lines = 0;
for (let k = 1; k < G.length; k++) {
  const g = G[k], p = P[k];
  if (g.footer) {
    if (!p || !p.footer) { console.log(`FAIL: port trace ended early or has no footer (line ${k + 1})`); process.exit(1); }
    if (JSON.stringify(g.births) !== JSON.stringify(p.births)) { console.log('FAIL: births footer differs'); console.log(' golden', JSON.stringify(g.births)); console.log(' port  ', JSON.stringify(p.births)); process.exit(1); }
    break;
  }
  if (!p) { console.log(`FAIL: port trace ended at line ${k + 1} (golden gen ${g.gen})`); process.exit(1); }
  for (const f of exact) if (g[f] !== p[f]) { console.log(`FAIL at line ${k + 1} (gen ${g.gen}): ${f} golden=${g[f]} port=${p[f]}`); process.exit(1); }
  for (const f of floats) if (!close(g[f], p[f])) { console.log(`FAIL at line ${k + 1} (gen ${g.gen}): ${f} golden=${g[f]} port=${p[f]}`); process.exit(1); }
  if (JSON.stringify(g.cells) !== JSON.stringify(p.cells)) { console.log(`FAIL at line ${k + 1} (gen ${g.gen}): cells golden=${JSON.stringify(g.cells)} port=${JSON.stringify(p.cells)}`); process.exit(1); }
  if (JSON.stringify(g.events || []) !== JSON.stringify(p.events || [])) { console.log(`FAIL at line ${k + 1} (gen ${g.gen}): events golden=${JSON.stringify(g.events)} port=${JSON.stringify(p.events)}`); process.exit(1); }
  lines++;
}
console.log(`PASS: ${lines} generations match`);
