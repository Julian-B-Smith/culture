// Texture analysis for timbres. Two kinds of measurement:
//  - fingerprint(rule, hash): what a rule looks like on its own, measured once at birth by running
//    it on a small seeded patch. Deterministic, so a tier's sound class never flips.
//  - Live.measure(world): what each tier looks like right now in the world, a few times a second,
//    smoothed. Used to move a voice continuously within its class.
// Descriptors are all 0..1:
//   density   live cells / area
//   activity  cells changing per generation / area (the rate of movement)
//   cluster   how many live neighbors a live cell has (blobs high, dust low)
//   symmetry  how often a live cell's 3×3 neighborhood is mirror-symmetric (geometric shapes high)
//   still     how much of the pattern stays put (crystals and still lifes high, churn low)
const Texture = (() => {
  // Color temperature by family: warm > 0, cold < 0. Moss is the organic family; ash is dusty grey.
  const COLOR = [
    { temp: -0.15, organic: 0.2, dust: 1 }, // ash
    { temp: 1.0, organic: 0.2, dust: 0 },   // ember
    { temp: 0.75, organic: 0.1, dust: 0 },  // gold
    { temp: 0.1, organic: 1.0, dust: 0 },   // moss
    { temp: -1.0, organic: 0, dust: 0 },    // tide
    { temp: -0.6, organic: 0.1, dust: 0 },  // violet
  ];

  function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Neighborhood statistics over a grid (torus). `owner`/`want` optionally restrict to one tier.
  // Returns sums so callers can pool several tiers in one pass.
  function sym3(a, W, H, x, y) {
    const xm = (x + W - 1) % W, xp = (x + 1) % W, ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
    const nw = a[ym + xm], n = a[ym + x], ne = a[ym + xp], w = a[y0 + xm], e = a[y0 + xp], sw = a[yp + xm], s = a[yp + x], se = a[yp + xp];
    const count = nw + n + ne + w + e + sw + s + se;
    // Mirror left-right, mirror top-bottom, or point symmetry (180° turn).
    const lr = nw === ne && w === e && sw === se, tb = nw === sw && n === s && ne === se, pt = nw === se && n === s && ne === sw && w === e;
    return { count, sym: (lr || tb || pt) ? 1 : 0 };
  }

  // Run the rule on a seeded 40×40 patch and describe what it settles into.
  const fpCache = new Map();
  function fingerprint(rule, hash) {
    const key = rule.born + ':' + rule.survive + ':' + hash;
    if (fpCache.has(key)) return fpCache.get(key);
    const N = 40, rng = mulberry32(hash ^ 0x5bd1e995);
    let a = new Uint8Array(N * N), b = new Uint8Array(N * N), prev = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) a[i] = rng() < 0.35 ? 1 : 0;
    let act = 0, steady = 0, samples = 0;
    for (let t = 0; t < 160; t++) {
      if (t === 150) prev.set(a);
      let changed = 0;
      for (let y = 0; y < N; y++) {
        const ym = ((y + N - 1) % N) * N, y0 = y * N, yp = ((y + 1) % N) * N;
        for (let x = 0; x < N; x++) {
          const xm = (x + N - 1) % N, xp = (x + 1) % N;
          const n = a[ym + xm] + a[ym + x] + a[ym + xp] + a[y0 + xm] + a[y0 + xp] + a[yp + xm] + a[yp + x] + a[yp + xp];
          const al = a[y0 + x], nx = al ? (rule.survive >> n) & 1 : (rule.born >> n) & 1;
          b[y0 + x] = nx; if (nx !== al) changed++;
        }
      }
      const tmp = a; a = b; b = tmp;
      if (t >= 130) { act += changed; samples++; }
    }
    // After 10 more generations, how much of the live pattern is exactly where it was.
    let live = 0, same = 0, nb = 0, sy = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!a[i]) continue;
      live++; if (prev[i]) same++;
      const s = sym3(a, N, N, x, y); nb += s.count; sy += s.sym;
    }
    const fp = {
      density: live / (N * N),
      activity: Math.min(1, act / samples / (N * N) * 3),
      cluster: live ? nb / live / 8 : 0,
      symmetry: live ? sy / live : 0,
      still: live ? same / live : 0,
    };
    fpCache.set(key, fp);
    return fp;
  }

  // Live descriptors per tier, smoothed. Scans every `stride`-th row each call (rotating), so a
  // full picture builds up over a few calls without a heavy frame.
  class Live {
    constructor() { this.d = new Map(); this.prev = null; this.row = 0; }
    measure(world, stride = 2) {
      const { W, H } = world, al = world.alive, tr = world.tier, nT = world.tiers.length;
      if (!this.prev || this.prev.length !== al.length) { this.prev = new Uint8Array(al); return; }
      const live = new Float64Array(nT), area = new Float64Array(nT), nb = new Float64Array(nT), sy = new Float64Array(nT), ch = new Float64Array(nT);
      for (let y = this.row % stride; y < H; y += stride) for (let x = 0; x < W; x++) {
        const i = y * W + x, t = tr[i];
        if (t >= nT) continue;
        area[t]++;
        if (al[i] !== this.prev[i]) ch[t]++;
        if (!al[i]) continue;
        live[t]++;
        const s = sym3(al, W, H, x, y); nb[t] += s.count; sy[t] += s.sym;
      }
      this.row++;
      this.prev.set(al);
      for (let t = 0; t < nT; t++) {
        if (area[t] < 8) continue;
        const T = world.tiers[t];
        const now = {
          density: live[t] / area[t],
          activity: Math.min(1, ch[t] / area[t] * 3),
          cluster: live[t] ? nb[t] / live[t] / 8 : 0,
          symmetry: live[t] ? sy[t] / live[t] : 0,
        };
        const old = this.d.get(T);
        if (!old) { this.d.set(T, now); continue; }
        for (const k in now) old[k] += (now[k] - old[k]) * 0.2;
      }
    }
    get(T) { return this.d.get(T); }
    reset() { this.d.clear(); this.prev = null; }
  }

  return { fingerprint, Live, COLOR };
})();
if (typeof module !== 'undefined') module.exports = Texture;
