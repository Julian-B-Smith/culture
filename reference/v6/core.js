const Core = (() => {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash32(vals) {
    let h = 2166136261 >>> 0;
    for (const v of vals) for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 255; h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function ruleStr(r) {
    let b = '', s = '';
    for (let n = 0; n < 9; n++) { if ((r.born >> n) & 1) b += n; if ((r.survive >> n) & 1) s += n; }
    return 'B' + b + '/S' + s;
  }
  const CONWAY = { born: 1 << 3, survive: (1 << 2) | (1 << 3) };

  // Edge-of-chaos screen, measured late so rules that coagulate after a lively start are rejected.
  function screen(rule, rng) {
    const N = 48;
    let a = new Uint8Array(N * N), b = new Uint8Array(N * N), act = 0;
    for (let i = 0; i < N * N; i++) a[i] = rng() < 0.35 ? 1 : 0;
    for (let t = 0; t < 280; t++) {
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
      if (t >= 250) act += changed;
      if (t === 80 && (changed === 0 || changed > 0.4 * N * N)) return { density: 0, activity: 0, ok: false };
    }
    let sum = 0; for (let i = 0; i < N * N; i++) sum += a[i];
    const density = sum / (N * N), activity = act / (30 * N * N);
    return { density, activity, ok: density > 0.04 && density < 0.5 && activity > 0.01 && activity < 0.2 };
  }

  // Invasion speed: grow a small patch in empty space and measure how fast its edge travels,
  // in cells per generation. 1.0 is the lattice's speed of light; Conway's gliders move at 0.25.
  function growth(rule, rng, limit) {
    const N = 96, c0 = N / 2, T = 60;
    let a = new Uint8Array(N * N), b = new Uint8Array(N * N);
    for (let y = -3; y < 3; y++) for (let x = -3; x < 3; x++) a[(c0 + y) * N + c0 + x] = rng() < 0.45 ? 1 : 0;
    for (let t = 0; t < T; t++) {
      if (t % 10 === 9 && limit !== undefined) {
        let r = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (a[y * N + x]) { const d = Math.max(Math.abs(x - c0), Math.abs(y - c0)); if (d > r) r = d; }
        if (r - 3 > limit * T + 2) return 1;
      }
      for (let y = 1; y < N - 1; y++) {
        const ym = (y - 1) * N, y0 = y * N, yp = (y + 1) * N;
        for (let x = 1; x < N - 1; x++) {
          const n = a[ym + x - 1] + a[ym + x] + a[ym + x + 1] + a[y0 + x - 1] + a[y0 + x + 1] + a[yp + x - 1] + a[yp + x] + a[yp + x + 1];
          b[y0 + x] = a[y0 + x] ? (rule.survive >> n) & 1 : (rule.born >> n) & 1;
        }
      }
      const tmp = a; a = b; b = tmp;
    }
    let r = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (a[y * N + x]) r = Math.max(r, Math.abs(x - c0), Math.abs(y - c0));
    return Math.max(0, r - 3) / T;
  }

  // Every ruleset belongs to one of six color families and carries innate reactions to the others.
  // Reactions are keyed to colors, not to particular tiers, so a newcomer can trigger reactions
  // that older tiers have carried all along.
  const ELEMENTS = ['ash', 'ember', 'gold', 'moss', 'tide', 'violet'];
  const NONE = 0, PUSH = 1, FEED = 2, SPARK = 3;
  function genome(rng, el) {
    const react = new Uint8Array(ELEMENTS.length);
    for (let e = 0; e < ELEMENTS.length; e++) {
      if (e === el) continue;
      const u = rng();
      react[e] = u < 0.5 ? NONE : u < 0.68 ? PUSH : u < 0.88 ? FEED : SPARK;
    }
    return { el, react };
  }

  class World {
    constructor(W, H, seed) {
      this.W = W; this.H = H; this.seed = seed >>> 0;
      this.rng = mulberry32(this.seed);
      const n = W * H;
      this.alive = new Uint8Array(n); this.next = new Uint8Array(n);
      this.tier = new Uint16Array(n);
      this.pressure = new Float32Array(n); // contact from a higher tier, accumulating and leaking
      this.wall = new Float32Array(n);     // hardening of contested ground against conversion
      this.harm = new Uint8Array(n);       // neighbor count (+1) that last killed a cell at this site
      this.resist = new Float32Array(n);   // acquired resistance to that count
      this.claimed = new Int32Array(n);
      this.sparkLast = new Map();          // last generation each pair of tiers sparked a birth
      this.lastBirth = 0; this.meanEpoch = 600; this.reignTier = null; this.reignStart = 0; this.active = 1; this.brake = 1; this.thresholdLift = 1; // births so far set the world's sense of a normal epoch length
      this.retreat = null;
      this.score = new Float32Array(n);
      this.integral = new Float64Array((W + 1) * (H + 1));
      this.tiers = [Object.assign({ idx: 0, rule: CONWAY, gen: 0, origin: null, surprise: 0, tries: 0, cells: n, speed: 0.25 }, genome(this.rng, 0))];
      this.usedRules = new Set([ruleStr(CONWAY)]);
      this.extinct = [];
      this.gen = 0; this.lastMax = 0; this.lastArg = -1;
      this.resetFrontierStats();
      for (let i = 0; i < n; i++) this.alive[i] = this.rng() < 0.3 ? 1 : 0;
    }
    get frontier() { return this.tiers.length - 1; }
    resetFrontierStats() { this.table = new Float64Array(512); this.tableTotal = 0; this.record = 0; this.frontierAge = 0; this.starve = 0; }

    step(p) {
      const { W, H, rng, tiers } = this, n = W * H;
      const nb = this.nb ??= new Int32Array(8); // neighbor indices, reused to avoid per-cell allocation
      const a = this.alive, b = this.next, tier = this.tier, harm = this.harm, res = this.resist;
      // 1. Each cell follows the rule of the tier its site belongs to.
      //    Hysteresis: a site that recently lost a cell at some neighbor count can resist that count.
      let motion = 0, frontierLive = 0;
      const F = this.frontier, T = tiers.length, dying = this.retreat ? this.retreat.tier : -1;
      const el = new Uint8Array(T), feedOn = new Uint8Array(T), bornFed = new Uint16Array(T), survFed = new Uint16Array(T);
      const canPush = new Uint8Array(T * T), sparks = new Uint8Array(T * T);
      // Rules and parameters copied into locals and typed arrays: the cell loops below run
      // hundreds of thousands of times a generation, and object lookups there dominated the cost.
      const bornT = new Uint16Array(T), survT = new Uint16Array(T);
      const reactions = p.reactions, gain = p.gain, forget = p.forget;
      for (let t = 0; t < T; t++) {
        const X = tiers[t]; el[t] = X.el; bornT[t] = X.rule.born; survT[t] = X.rule.survive;
        for (let e = 0; e < 6; e++) if (X.react[e] === FEED) feedOn[t] |= 1 << e;
        // A fed site tolerates one more neighbor at birth and one either way at survival.
        bornFed[t] = (X.rule.born | (X.rule.born << 1)) & 0x1FC;
        survFed[t] = (X.rule.survive | (X.rule.survive << 1) | (X.rule.survive >> 1)) & 0x1FF;
      }
      for (let a2 = 0; a2 < T; a2++) for (let b2 = 0; b2 < T; b2++) {
        if (a2 === b2) continue;
        const A = tiers[a2], B = tiers[b2];
        // Newer tiers press on older ones by default. A tier that pushes back against a color
        // both holds its ground against it and presses into it, so the frontier can be beaten back.
        const upward = a2 > b2 && !(p.reactions && B.react[A.el] === PUSH);
        const back = p.reactions && A.react[B.el] === PUSH;
        canPush[a2 * T + b2] = a2 !== dying && (upward || back) ? 1 : 0;
        const key = Math.min(a2, b2) * 4096 + Math.max(a2, b2);
        const ready = this.gen - (this.sparkLast.get(key) ?? -1e9) > p.sparkCooldown && this.frontierAge > (this.warm ?? p.warmup) / 2;
        sparks[a2 * T + b2] = ready && p.reactions && (A.react[B.el] === SPARK || B.react[A.el] === SPARK) ? 1 : 0;
      }
      this.fedCount = new Uint32Array(T);
      // Per-tier statistics the sound engine listens to.
      const liveT = new Uint32Array(T), moveT = new Uint32Array(T), cosT = new Float64Array(T), sinT = new Float64Array(T);
      const cosYT = new Float64Array(T), sinYT = new Float64Array(T);
      const cosY = this.cosY ??= Float64Array.from({ length: H }, (_, y) => Math.cos(2 * Math.PI * y / H));
      const sinY = this.sinY ??= Float64Array.from({ length: H }, (_, y) => Math.sin(2 * Math.PI * y / H));
      const contestT = new Float64Array(T), wallT = new Float64Array(T);
      const cosX = this.cosX ??= Float64Array.from({ length: W }, (_, x) => Math.cos(2 * Math.PI * x / W));
      const sinX = this.sinX ??= Float64Array.from({ length: W }, (_, x) => Math.sin(2 * Math.PI * x / W));
      for (let y = 0; y < H; y++) {
        const ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const xm = x === 0 ? W - 1 : x - 1, xp = x === W - 1 ? 0 : x + 1;
          const c = a[ym + xm] + a[ym + x] + a[ym + xp] + a[y0 + xm] + a[y0 + xp] + a[yp + xm] + a[yp + x] + a[yp + xp];
          const i = y0 + x, ti = tier[i];
          let nx;
          const fm = reactions ? feedOn[ti] : 0;
          let fed = false;
          if (fm) {
            nb[0] = ym + xm; nb[1] = ym + x; nb[2] = ym + xp; nb[3] = y0 + xm; nb[4] = y0 + xp; nb[5] = yp + xm; nb[6] = yp + x; nb[7] = yp + xp;
            for (let k = 0; k < 8; k++) { const j = nb[k], tj = tier[j]; if (a[j] && tj !== ti && (fm >> el[tj]) & 1) { fed = true; break; } }
          }
          if (fed) { nx = a[i] ? (survFed[ti] >> c) & 1 : (bornFed[ti] >> c) & 1; this.fedCount[ti]++; }
          else nx = a[i] ? (survT[ti] >> c) & 1 : (bornT[ti] >> c) & 1;
          if (a[i] && !nx && gain > 0) {
            const cat = c + 1;
            if (harm[i] === cat && rng() < res[i]) nx = 1;
            else { res[i] = harm[i] === cat ? Math.min(1, res[i] + gain) : gain; harm[i] = cat; }
          }
          res[i] *= forget;
          b[i] = nx;
          if (nx) { liveT[ti]++; cosT[ti] += cosX[x]; sinT[ti] += sinX[x]; cosYT[ti] += cosY[y]; sinYT[ti] += sinY[y]; }
          if (nx !== a[i]) moveT[ti]++;
          if (tier[i] === F) { frontierLive += nx; if (nx !== a[i]) motion++; }
        }
      }
      const flips = Math.floor(p.noise * n + rng());
      for (let k = 0; k < flips; k++) b[(rng() * n) | 0] = 1;
      this.alive = b; this.next = a;
      const al = this.alive;

      // 2. Higher natures claim ground under sustained contact. Ground that has been
      //    pressed and held hardens, so contested borders become stable and intermingled.
      const pr = this.pressure, wall = this.wall, claims = [];
      let sparkSite = -1, sparkPair = null;
      for (let y = 0; y < H; y++) {
        const ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const i = y0 + x, t = tier[i];
          const xm = x === 0 ? W - 1 : x - 1, xp = x === W - 1 ? 0 : x + 1;
          let push = 0, m = -1;
          nb[0] = ym + xm; nb[1] = ym + x; nb[2] = ym + xp; nb[3] = y0 + xm; nb[4] = y0 + xp; nb[5] = yp + xm; nb[6] = yp + x; nb[7] = yp + xp;
          for (let k = 0; k < 8; k++) {
            const j = nb[k]; if (!al[j]) continue;
            const tj = tier[j]; if (tj === t) continue;
            if (canPush[tj * T + t]) { push++; if (tj > m) m = tj; }
            if (al[i] && sparks[t * T + tj] && sparkSite < 0 && rng() < p.spark * this.brake) { sparkSite = i; sparkPair = [Math.min(t, tj), Math.max(t, tj)]; }
          }
          if (push === 0) {
            if (pr[i] > 0) { pr[i] *= 0.8; if (pr[i] < 0.05) pr[i] = 0; }
            wall[i] *= forget;
            continue;
          }
          pr[i] = pr[i] * 0.8 + push;
          contestT[t] += push; contestT[m] += push; wallT[t] += wall[i];
          if (pr[i] >= p.hold * (1 + wall[i])) claims.push(i, m);
          else wall[i] = Math.min(p.hardness, wall[i] + p.gain * 0.2);
        }
      }
      for (let k = 0; k < claims.length; k += 2) {
        const i = claims[k]; tier[i] = claims[k + 1]; pr[i] = 0; wall[i] = 0; harm[i] = 0; res[i] = 0; this.claimed[i] = this.gen;
      }
      // An extinct tier gives its ground back in the reverse order it took it.
      let finished = null;
      if (this.retreat) {
        const rt = this.retreat; rt.t++;
        const threshold = rt.from - (rt.from - rt.to + 1) * Math.min(1, rt.t / rt.dur);
        for (let i = 0; i < n; i++) if (tier[i] === rt.tier && this.claimed[i] >= threshold) { tier[i] = rt.tier - 1; pr[i] = 0; wall[i] = 0; }
        if (rt.t >= rt.dur) {
          for (let i = 0; i < n; i++) if (tier[i] === rt.tier) tier[i] = rt.tier - 1;
          const T = tiers.pop(); T.extinctAt = this.gen; T.dying = false; this.extinct.push(T);
          this.retreat = null; this.resetFrontierStats();
          finished = { extinct: T.idx, gen: this.gen };
        }
      }
      const counts = new Uint32Array(tiers.length);
      for (let i = 0; i < n; i++) counts[tier[i]]++;
      // Crowding brake: the more tiers share the world, the slower new ones arrive, so a complex
      // world has time to play out. Every tier holding at least 1% of the ground counts as active.
      let active = 0;
      for (let t = 0; t < tiers.length; t++) if (counts[t] >= n * 0.01 && !tiers[t].dying) active++;
      const excess = Math.max(0, active - 2);
      this.active = active;
      this.brake = 1 / (1 + (p.crowding || 0) * 0.6 * Math.pow(excess, 1.5)); // scales spark and mutation chances
      this.thresholdLift = 1 + (p.crowding || 0) * 0.05 * excess;          // raises the bar for surprise births
      this.warm = p.warmup * (1 + (p.crowding || 0) * excess);             // and lengthens the pause after each birth
      // Reign: how long the tier holding the most ground has held it.
      let D = 0;
      for (let t = 1; t < tiers.length; t++) if (counts[t] > counts[D]) D = t;
      if (tiers[D] !== this.reignTier) { this.reignTier = tiers[D]; this.reignStart = this.gen; }
      this.stats = { live: liveT, move: moveT, cos: cosT, sin: sinT, cosY: cosYT, sinY: sinYT, contest: contestT, wall: wallT, fed: this.fedCount };
      for (let t = 0; t < tiers.length; t++) tiers[t].cells = counts[t];
      if (this.retreat || finished) { this.gen++; this.lastMax = 0; this.lastArg = -1; return finished; }
      // Two colors that spark with each other can birth a new ruleset at their border.
      if (sparkSite >= 0 && !this.search) {
        this.gen++;
        this.sparkLast.set(sparkPair[0] * 4096 + sparkPair[1], this.gen);
        return this.emerge(sparkSite, 0, p, sparkPair);
      }
      // Mutation pressure grows with the length of the dominant tier's reign, measured against the
      // world's typical epoch and weighted by how much of the world it holds. A long, total reign
      // makes mutation within its color nearly certain; a brief or contested lead barely registers.
      if (!this.search && p.mutation > 0 && this.frontierAge > this.warm) {
        const D = this.reignTier.idx, share = counts[D] / n;
        const reign = (this.gen - this.reignStart) / this.meanEpoch;
        if (D === tiers.indexOf(this.reignTier) && rng() < p.mutation * this.brake * share * reign * reign / this.meanEpoch) {
          let site = -1;
          for (let q = 0; q < 4000 && site < 0; q++) { const i = (rng() * n) | 0; if (tier[i] === D && al[i]) site = i; }
          if (site >= 0) { this.gen++; return this.emerge(site, 0, p, null, D); }
        }
      }

      // 3. Surprise at the frontier.
      const tab = this.table, sc = this.score;
      for (let k = 0; k < 512; k++) tab[k] *= p.memory;
      this.tableTotal *= p.memory;
      const codes = this.codes ??= new Int32Array(2 * n);
      let nc = 0;
      for (let y = 0; y < H; y++) {
        const ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const i = y0 + x;
          if (!al[i] || tier[i] !== F) { sc[i] = 0; continue; }
          const xm = x === 0 ? W - 1 : x - 1, xp = x === W - 1 ? 0 : x + 1;
          codes[nc++] = i;
          codes[nc++] = al[ym + xm] | al[ym + x] << 1 | al[ym + xp] << 2 | al[y0 + xm] << 3 | al[y0 + x] << 4 |
            al[y0 + xp] << 5 | al[yp + xm] << 6 | al[yp + x] << 7 | al[yp + xp] << 8;
        }
      }
      // Each of the 512 patterns' surprise is the same expression on the same inputs as computing it
      // per cell, so computing it once per pattern gives identical scores.
      const denom = this.tableTotal + 512, bits = this.bits ??= new Float64Array(512);
      for (let k = 0; k < 512; k++) bits[k] = -Math.log2((tab[k] + 1) / denom);
      for (let k = 0; k < nc; k += 2) sc[codes[k]] = bits[codes[k + 1]];
      for (let k = 0; k < nc; k += 2) tab[codes[k + 1]] += 1;
      this.tableTotal += nc / 2;
      const I = this.integral, W1 = W + 1, R = 2;
      for (let y = 0; y < H; y++) {
        let row = 0;
        for (let x = 0; x < W; x++) { row += sc[y * W + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; }
      }
      let best = 0, arg = -1;
      for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) {
        const i = y * W + x;
        if (tier[i] !== F) continue;
        const s = I[(y + R + 1) * W1 + x + R + 1] - I[(y - R) * W1 + x + R + 1] - I[(y + R + 1) * W1 + x - R] + I[(y - R) * W1 + x - R];
        if (s > best) { best = s; arg = i; }
      }
      this.lastMax = best; this.lastArg = arg;
      this.frontierAge++; this.gen++;

      // 4. A frontier that dies out or freezes solid goes extinct; its ground reverts to its parent.
      this.starve = (frontierLive < 4 || motion < 3) ? this.starve + 1 : 0;
      if (F > 0 && this.starve > p.extinction) {
        let from = tiers[F].gen;
        for (let i = 0; i < n; i++) if (tier[i] === F && this.claimed[i] > from) from = this.claimed[i];
        tiers[F].dying = true;
        // Retreat time scales with how much ground there is to give back.
        this.retreat = { tier: F, from, to: tiers[F].gen, t: 0, dur: Math.max(30, Math.round(p.retreat * tiers[F].cells / n)) };
        return { dying: F, gen: this.gen };
      }
      // 5. The record is set during warm-up, then only erodes, so even a stagnant world
      //    eventually crosses it. A lively one crosses it sooner.
      if (this.frontierAge <= this.warm) { if (best > this.record) this.record = best; return null; }
      if (this.search) return null;
      if (arg >= 0 && best > this.record * (1 + p.margin) * this.thresholdLift) return this.emerge(arg, best, p);
      this.record *= p.patience;
      return null;
    }

    // The next nature is derived from the configuration that triggered it. Finding a rule
    // that passes screening can take hundreds of test runs, so the search is a job that
    // work() advances a few candidates at a time while the world keeps running.
    emerge(site, surprise, p, parents, mutateFrom) {
      const { W, H } = this, cx = site % W, cy = (site / W) | 0, al = this.alive;
      const bits = [this.seed, this.tiers.length, this.extinct.length, parents ? parents[0] * 977 + parents[1] + 1 : 0, mutateFrom === undefined ? 0 : mutateFrom + 7919];
      for (let dy = -3; dy <= 3; dy++) {
        let row = 0;
        for (let dx = -3; dx <= 3; dx++) row = (row << 1) | al[((cy + dy + H) % H) * W + (cx + dx + W) % W];
        bits.push(row);
      }
      const h = hash32(bits);
      this.search = { cx, cy, surprise, h, rng: mulberry32(h), tries: 0, parent: this.frontier, parents: parents || null,
        mutateFrom: mutateFrom === undefined ? null : mutateFrom };
      return { searching: true, x: cx, y: cy, gen: this.gen, spark: !!parents };
    }
    // Advances the pending rule search by at most maxCandidates candidates. Count-based rather
    // than time-based so the core never reads a clock: the same seed and the same call pattern
    // always produce the same world.
    work(p, maxCandidates) {
      const S = this.search;
      if (!S) return null;
      if (S.parent !== this.frontier || this.retreat) { this.search = null; return null; }
      const rng = S.rng;
      let rule = null, stats = null, done = 0;
      while (!rule && S.tries < 800 && done++ < maxCandidates) {
        S.tries++;
        let born = 0, survive = 0;
        if (S.mutateFrom !== null) {
          // A mutant differs from its parent's rule by one or two neighbor counts.
          const pr0 = this.tiers[S.mutateFrom].rule; born = pr0.born; survive = pr0.survive;
          const flips = rng() < 0.6 ? 1 : 2;
          for (let f = 0; f < flips; f++) {
            const bit = Math.floor(rng() * 16);
            if (bit < 7) born ^= 1 << (bit + 2); else survive ^= 1 << (bit - 7);
          }
        } else {
          for (let c = 2; c <= 8; c++) if (rng() < 0.28) born |= 1 << c;
          for (let c = 0; c <= 8; c++) if (rng() < 0.4) survive |= 1 << c;
        }
        if (!born) continue;
        const cand = { born, survive };
        if (this.usedRules.has(ruleStr(cand))) continue;
        const speed = growth(cand, rng, p.maxSpeed);
        if (speed > p.maxSpeed) continue;
        const st = screen(cand, rng);
        if (st.ok) { rule = cand; stats = st; stats.speed = speed; }
      }
      if (!rule) {
        if (S.tries >= 800) {
          // No viable mutant: count the attempt as a birth for pacing, so pressure rebuilds instead of retrying every frame.
          if (S.mutateFrom !== null) this.lastBirth = this.gen;
          this.search = null; this.record *= 1.05;
        }
        return null;
      }
      this.search = null;
      const { W, H } = this, { cx, cy } = S, tier = this.tier, al = this.alive;
      this.usedRules.add(ruleStr(rule));
      const idx = this.tiers.length;
      const parentEls = S.parents ? S.parents.map(t => this.tiers[t].el) : [];
      let elx = 1 + Math.floor(rng() * 5);
      for (let k = 0; k < 6 && parentEls.includes(elx); k++) elx = 1 + Math.floor(rng() * 5);
      let gnm;
      if (S.mutateFrom !== null) {
        // A mutant keeps its parent's color and reactions, with a chance of one reaction shifting.
        const P = this.tiers[S.mutateFrom];
        gnm = { el: P.el, react: P.react.slice() };
        if (rng() < 0.35) { const e = Math.floor(rng() * 6); if (e !== P.el) gnm.react[e] = Math.floor(rng() * 4); }
      } else gnm = genome(rng, elx);
      this.tiers.push(Object.assign({ idx, rule, gen: this.gen, origin: [cx, cy], surprise: S.surprise, tries: S.tries, hash: S.h, speed: stats.speed, cells: 0,
        parents: S.parents ? S.parents.slice() : null, mutatedFrom: S.mutateFrom, from: S.parent, quiet: this.gen - this.lastBirth,
        reign: S.mutateFrom !== null ? this.gen - this.reignStart : 0 }, gnm));
      this.meanEpoch = 0.7 * this.meanEpoch + 0.3 * Math.max(50, this.gen - this.lastBirth);
      this.lastBirth = this.gen;
      const rad = 6;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const i = ((cy + dy + H) % H) * W + (cx + dx + W) % W;
        tier[i] = idx; this.harm[i] = 0; this.resist[i] = 0; this.wall[i] = 0; this.claimed[i] = this.gen;
        if (rng() < 0.35) al[i] = 1;
      }
      this.resetFrontierStats();
      return { tier: idx, gen: this.gen, x: cx, y: cy };
    }
    // A spore: a new nature released at a chosen cell (user input). Its rule is derived from the
    // 7×7 configuration there, exactly as for a natural birth. For replayable runs, record the
    // (generation, x, y) of each spore as an input event.
    emergeAt(x, y, p) {
      if (this.retreat || this.search) return null;
      const { W, H } = this;
      x = ((x % W) + W) % W; y = ((y % H) + H) % H;
      return this.emerge(y * W + x, this.lastMax, p);
    }
    forceEmerge(p) { return !this.retreat && !this.search && this.lastArg >= 0 ? this.emerge(this.lastArg, this.lastMax, p) : null; }
  }
  return { World, ruleStr, screen, growth, mulberry32, ELEMENTS, NONE, PUSH, FEED, SPARK };
})();
if (typeof module !== 'undefined') module.exports = Core;
