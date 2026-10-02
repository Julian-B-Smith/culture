// Port of reference/core.js. Section numbers refer to docs/handoff/SPEC.md.
//
// Precision rules applied throughout (SPEC §1):
//  - All arithmetic is in double, constants included (`0.8`, never `0.8f`).
//  - A float32 array element is rounded exactly when it is STORED, and every
//    later read sees the stored float32. Compound updates like JS
//    `pr[i] *= 0.8` are therefore written `pr[i] = float(double(pr[i]) * 0.8)`,
//    and two consecutive stores round twice, as the JS does.
//  - Every rng() call the JS makes is made here in the same order, including
//    draws whose results are discarded (SPEC §2).
#include "culture/core.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "fdlibm.hpp"

// Parity depends on IEEE double semantics (SPEC §1). A consumer that compiles
// this file with -ffast-math would silently break every golden, and no gate
// would see it if that consumer's build bypasses ours (critic M3, 2026-10-02).
#ifdef __FAST_MATH__
#error "libculture must not be compiled with -ffast-math (breaks bit-exact parity)"
#endif

namespace culture {

const char* const kElements[6] = {"ash", "ember", "gold", "moss", "tide", "violet"};

uint32_t hash32(const std::vector<uint32_t>& vals) {
  uint32_t h = 2166136261u;
  for (uint32_t v : vals)
    for (int k = 0; k < 4; k++) { h ^= (v >> (k * 8)) & 255u; h *= 16777619u; }
  return h;
}

std::string ruleStr(Rule r) {
  std::string b, s;
  for (int n = 0; n < 9; n++) {
    if ((r.born >> n) & 1) b += char('0' + n);
    if ((r.survive >> n) & 1) s += char('0' + n);
  }
  return "B" + b + "/S" + s;
}

ScreenResult screen(Rule rule, Rng& rng) {
  constexpr int N = 48;
  std::vector<uint8_t> A(N * N), B(N * N);
  uint8_t *a = A.data(), *b = B.data();
  long act = 0;
  for (int i = 0; i < N * N; i++) a[i] = rng() < 0.35 ? 1 : 0;
  for (int t = 0; t < 280; t++) {
    int changed = 0;
    for (int y = 0; y < N; y++) {
      const int ym = ((y + N - 1) % N) * N, y0 = y * N, yp = ((y + 1) % N) * N;
      for (int x = 0; x < N; x++) {
        const int xm = (x + N - 1) % N, xp = (x + 1) % N;
        const int n = a[ym + xm] + a[ym + x] + a[ym + xp] + a[y0 + xm] + a[y0 + xp] + a[yp + xm] + a[yp + x] + a[yp + xp];
        const uint8_t al = a[y0 + x];
        const uint8_t nx = al ? (rule.survive >> n) & 1 : (rule.born >> n) & 1;
        b[y0 + x] = nx;
        if (nx != al) changed++;
      }
    }
    std::swap(a, b);
    if (t >= 250) act += changed;
    if (t == 80 && (changed == 0 || changed > 0.4 * N * N)) return {0, 0, false};
  }
  long sum = 0;
  for (int i = 0; i < N * N; i++) sum += a[i];
  const double density = double(sum) / (N * N), activity = double(act) / (30.0 * N * N);
  return {density, activity, density > 0.04 && density < 0.5 && activity > 0.01 && activity < 0.2};
}

double growth(Rule rule, Rng& rng, double limit) {
  constexpr int N = 96, c0 = N / 2, T = 60;
  std::vector<uint8_t> A(N * N), B(N * N);
  uint8_t *a = A.data(), *b = B.data();
  for (int y = -3; y < 3; y++)
    for (int x = -3; x < 3; x++) a[(c0 + y) * N + c0 + x] = rng() < 0.45 ? 1 : 0;
  auto radius = [&] {
    int r = 0;
    for (int y = 0; y < N; y++)
      for (int x = 0; x < N; x++)
        if (a[y * N + x]) r = std::max(r, std::max(std::abs(x - c0), std::abs(y - c0)));
    return r;
  };
  for (int t = 0; t < T; t++) {
    // The JS also guards `limit !== undefined`; every caller passes one.
    if (t % 10 == 9 && double(radius() - 3) > limit * T + 2) return 1;
    // Border cells (x or y at 0 or N-1) are never written, so b keeps whatever
    // it held — zeros, since the seed patch never reaches the border in 60 gens.
    for (int y = 1; y < N - 1; y++) {
      const int ym = (y - 1) * N, y0 = y * N, yp = (y + 1) * N;
      for (int x = 1; x < N - 1; x++) {
        const int n = a[ym + x - 1] + a[ym + x] + a[ym + x + 1] + a[y0 + x - 1] + a[y0 + x + 1] + a[yp + x - 1] + a[yp + x] + a[yp + x + 1];
        b[y0 + x] = a[y0 + x] ? (rule.survive >> n) & 1 : (rule.born >> n) & 1;
      }
    }
    std::swap(a, b);
  }
  return double(std::max(0, radius() - 3)) / T;
}

int surpriseWindowMax(const float* score, const uint16_t* tier, int F, int W, int H,
                      std::vector<double>& integral, double& best) {
  // Wrapped grid: padded column px / row py read score at (px-2, py-2) mod
  // (W, H), so the window centred on site (x, y) is padded centre (x+2, y+2).
  constexpr int R = 2;
  const int PW = W + 2 * R, PH = H + 2 * R, W1 = PW + 1;
  // Row 0 and column 0 must be zero and are never written below; every
  // other entry is overwritten, so allocate once instead of clearing per step.
  if (integral.size() != size_t(W1) * (PH + 1)) integral.assign(size_t(W1) * (PH + 1), 0.0);
  double* I = integral.data();
  for (int py = 0; py < PH; py++) {
    const float* row = score + size_t((py - R + H) % H) * W;
    double sum = 0;
    for (int px = 0; px < PW; px++) {
      sum += double(row[(px - R + W) % W]);
      I[(py + 1) * W1 + px + 1] = I[py * W1 + px + 1] + sum;
    }
  }
  best = 0;
  int arg = -1;
  for (int y = 0; y < H; y++)
    for (int x = 0; x < W; x++) {
      const int i = y * W + x;
      if (tier[i] != F) continue;
      // Padded centre (x+R, y+R): A=(y+2R+1, x+2R+1) B=(y, x+2R+1) C=(y+2R+1, x) D=(y, x).
      const double s = I[(y + 2 * R + 1) * W1 + x + 2 * R + 1] - I[y * W1 + x + 2 * R + 1] -
                       I[(y + 2 * R + 1) * W1 + x] + I[y * W1 + x];
      if (s > best) { best = s; arg = i; }
    }
  return arg;
}

namespace {
void genome(Rng& rng, uint8_t el, Tier& t) {
  t.el = el;
  for (int e = 0; e < 6; e++) {
    t.react[e] = NONE;
    if (e == el) continue;
    const double u = rng();
    t.react[e] = u < 0.5 ? NONE : u < 0.68 ? PUSH : u < 0.88 ? FEED : SPARK;
  }
}
}  // namespace

// Exact doubles of the JS profile values (tools/golden.js PARAMS). The three
// half-life factors are 0.5^(1/10^v) evaluated by V8; the hex literals pin
// V8's results so the platform pow never enters.
Params defaultParams() {
  Params p;
  p.noise = 0x1.3a92a30553261p-12;     // 3/10000
  p.hold = 4; p.hardness = 3;
  p.memory = 0x1.fd305187b6ca4p-1;     // 0.5^(1/10^2.1)
  p.forget = 0x1.fa67f85c132acp-1;     // 0.5^(1/10^1.8)
  p.patience = 0x1.ffdbd60983ca5p-1;   // 0.5^(1/10^3.4)
  p.margin = 0.04; p.maxSpeed = 0.30; p.gain = 0.25; p.crowding = 0.5; p.mutation = 1.0;
  p.spark = 0x1.a36e2eb1c432dp-14;     // 10/100000
  p.reactions = true;
  p.warmup = 300; p.extinction = 200; p.retreat = 400; p.sparkCooldown = 1500;
  return p;
}

Params stressParams() {
  Params p = defaultParams();
  p.spark = 0x1.0624dd2f1a9fcp-11;     // 50/100000
  p.mutation = 3.0;
  p.crowding = 0;
  return p;
}

World::World(int W_, int H_, uint32_t seed_) : W(W_), H(H_), seed(seed_), rng(seed_) {
  // Birth discs wrap with `(c + d + H) % H` for |d| <= 6, which goes negative
  // below 6 and would write out of bounds (the JS silently drops such typed-
  // array writes, so there is no reference behavior to match). Tier indices
  // are uint16.
  if (W < 6 || H < 6) throw std::invalid_argument("culture::World: W and H must be >= 6");
  const int n = W * H;
  alive.assign(n, 0); next.assign(n, 0); tier.assign(n, 0);
  pressure.assign(n, 0.f); wall.assign(n, 0.f); harm.assign(n, 0); resist.assign(n, 0.f);
  claimed.assign(n, 0); score.assign(n, 0.f);
  prevTier.assign(n, 0); prevSerial.assign(n, 0);  // everything starts as tier 0 (serial 0)
  integral.assign(size_t(W + 1) * (H + 1), 0.0);
  Tier t0;
  t0.idx = 0; t0.rule = kConway; t0.cells = uint32_t(n); t0.speed = 0.25;
  t0.serial = nextSerial_++;
  genome(rng, ASH, t0);  // RNG order: tier-0 genome first, then the soup
  tiers.push_back(t0);
  usedRules.insert(kConway.key());
  resetFrontierStats();
  for (int i = 0; i < n; i++) alive[i] = rng() < 0.3 ? 1 : 0;
  // Stereo-stat tables. fdlibm, not std::cos/sin: the platform libm differs
  // from V8 by 1 ulp in 10-20% of entries (D-027).
  constexpr double kTau = 2 * 3.14159265358979323846;  // JS 2 * Math.PI
  for (int x = 0; x < W; x++) { cosX_.push_back(fdlibm::cos(kTau * x / W)); sinX_.push_back(fdlibm::sin(kTau * x / W)); }
  for (int y = 0; y < H; y++) { cosY_.push_back(fdlibm::cos(kTau * y / H)); sinY_.push_back(fdlibm::sin(kTau * y / H)); }
  // Torus wrap tables: the step's three full-grid passes index neighbors
  // through these instead of `%` (PORT_PLAN perf notes; results unchanged).
  for (int x = 0; x < W; x++) { colM_.push_back((x + W - 1) % W); colP_.push_back((x + 1) % W); }
  for (int y = 0; y < H; y++) { rowM_.push_back(((y + H - 1) % H) * W); rowP_.push_back(((y + 1) % H) * W); }
}

void World::resetFrontierStats() {
  std::fill(std::begin(table), std::end(table), 0.0);
  tableTotal = 0; record = 0; frontierAge = 0; starve = 0;
}

std::optional<Event> World::step(const Params& p) {
  const int n = W * H;
  int nb[8];
  uint8_t *a = alive.data(), *b = next.data();
  float* res = resist.data();
  // 1. Each cell follows the rule of the tier its site belongs to.
  int motion = 0, frontierLive = 0;
  const int F = frontier(), T = int(tiers.size()), dying = retreat ? retreat->tier : -1;
  std::vector<uint8_t> el(T), feedOn(T), canPush(size_t(T) * T), sparks(size_t(T) * T);
  std::vector<uint16_t> bornFed(T), survFed(T);
  for (int t = 0; t < T; t++) {
    const Tier& X = tiers[t];
    el[t] = X.el;
    for (int e = 0; e < 6; e++) if (X.react[e] == FEED) feedOn[t] |= 1 << e;
    bornFed[t] = (X.rule.born | (X.rule.born << 1)) & 0x1FC;
    survFed[t] = (X.rule.survive | (X.rule.survive << 1) | (X.rule.survive >> 1)) & 0x1FF;
  }
  // `warm` and `brake` here are the PREVIOUS step's values (SPEC §3, "stale values").
  const double warmPrev = hasWarm ? warm : p.warmup;
  for (int a2 = 0; a2 < T; a2++)
    for (int b2 = 0; b2 < T; b2++) {
      if (a2 == b2) continue;
      const Tier &A = tiers[a2], &B = tiers[b2];
      const bool upward = a2 > b2 && !(p.reactions && B.react[A.el] == PUSH);
      const bool back = p.reactions && A.react[B.el] == PUSH;
      canPush[a2 * T + b2] = a2 != dying && (upward || back) ? 1 : 0;
      const uint64_t sa = A.serial, sb = B.serial;
      const uint64_t key = std::min(sa, sb) << 32 | std::max(sa, sb);
      auto it = sparkLast.find(key);
      const double last = it == sparkLast.end() ? -1e9 : double(it->second);
      const bool ready = double(gen) - last > p.sparkCooldown && double(frontierAge) > warmPrev / 2;
      sparks[a2 * T + b2] = ready && p.reactions && (A.react[B.el] == SPARK || B.react[A.el] == SPARK) ? 1 : 0;
    }
  stats.fed.assign(T, 0);
  stats.live.assign(T, 0); stats.move.assign(T, 0);
  stats.cos.assign(T, 0); stats.sin.assign(T, 0); stats.cosY.assign(T, 0); stats.sinY.assign(T, 0);
  stats.contest.assign(T, 0); stats.wall.assign(T, 0);
  uint16_t* tr = tier.data();
  uint8_t* hm = harm.data();
  // Hot loop. Everything it touches goes through a local pointer: writes to
  // uint8_t arrays may alias anything, so member access (stats.x[...],
  // tiers[...]) would be reloaded from `this` on every cell.
  std::vector<uint16_t> bornT(T), survT(T);
  for (int t = 0; t < T; t++) { bornT[t] = tiers[t].rule.born; survT[t] = tiers[t].rule.survive; }
  const uint16_t *bornR = bornT.data(), *survR = survT.data(), *bornF = bornFed.data(), *survF = survFed.data();
  const uint8_t *elT = el.data(), *feedT = feedOn.data();
  uint32_t *liveT = stats.live.data(), *moveT = stats.move.data(), *fedT = stats.fed.data();
  double *cosT = stats.cos.data(), *sinT = stats.sin.data(), *cosYT = stats.cosY.data(), *sinYT = stats.sinY.data();
  const double *cx = cosX_.data(), *sx = sinX_.data();
  const int *colM = colM_.data(), *colP = colP_.data();
  const bool hyst = p.gain > 0, reactions = p.reactions;
  const double gain = p.gain, forget = p.forget;
  for (int y = 0; y < H; y++) {
    const int ym = rowM_[y], y0 = y * W, yp = rowP_[y];
    const uint8_t *am = a + ym, *a0 = a + y0, *ap = a + yp;
    const uint16_t *tm = tr + ym, *t0 = tr + y0, *tp = tr + yp;
    const double cy = cosY_[y], sy = sinY_[y];
    for (int x = 0; x < W; x++) {
      const int xm = colM[x], xp = colP[x];
      const int c = am[xm] + am[x] + am[xp] + a0[xm] + a0[xp] + ap[xm] + ap[x] + ap[xp];
      const int i = y0 + x, ti = t0[x], ai = a0[x];
      const int fm = reactions ? feedT[ti] : 0;
      bool fed = false;
      // Feeding needs a live neighbor of ANOTHER tier, so a single-tier
      // neighborhood (the common, predictable case) skips the scan. The scan
      // draws no randomness, so skipping it cannot shift the RNG stream.
      if (fm && ((tm[xm] != ti) | (tm[x] != ti) | (tm[xp] != ti) | (t0[xm] != ti) | (t0[xp] != ti) |
                 (tp[xm] != ti) | (tp[x] != ti) | (tp[xp] != ti))) {
        const int nbr[8] = {ym + xm, ym + x, ym + xp, y0 + xm, y0 + xp, yp + xm, yp + x, yp + xp};
        for (int k = 0; k < 8; k++) {
          const int j = nbr[k], tj = tr[j];
          if (a[j] && tj != ti && ((fm >> elT[tj]) & 1)) { fed = true; break; }
        }
      }
      const unsigned mask = fed ? (ai ? survF[ti] : bornF[ti]) : (ai ? survR[ti] : bornR[ti]);
      fedT[ti] += fed;
      int nx = (mask >> c) & 1;
      // Hysteresis: one draw, and only when this harm category repeats.
      if (ai && !nx && hyst) {
        const int cat = c + 1;
        if (hm[i] == cat && rng() < double(res[i])) nx = 1;
        else { res[i] = float(hm[i] == cat ? std::min(1.0, double(res[i]) + gain) : gain); hm[i] = uint8_t(cat); }
      }
      res[i] = float(double(res[i]) * forget);
      b[i] = uint8_t(nx);
      // Branch-free stats: adding nx*v where nx = 0 adds +/-0.0, which leaves
      // any double sum unchanged, so this equals the JS `if (nx)` form.
      const double fx = nx;
      liveT[ti] += nx; cosT[ti] += fx * cx[x]; sinT[ti] += fx * sx[x]; cosYT[ti] += fx * cy; sinYT[ti] += fx * sy;
      const int moved = nx != ai;
      moveT[ti] += moved;
      if (ti == F) { frontierLive += nx; motion += moved; }
    }
  }
  // 2. Noise, then swap buffers.
  const int flips = int(std::floor(p.noise * n + rng()));
  for (int k = 0; k < flips; k++) b[int(rng() * n)] = 1;
  std::swap(alive, next);
  const uint8_t* al = alive.data();

  // 3. Territory.
  float *pr = pressure.data(), *wl = wall.data();
  std::vector<int>& claims = claims_;
  claims.clear();
  int sparkSite = -1, sparkPair[2] = {0, 0};
  for (int y = 0; y < H; y++) {
    const int ym = rowM_[y], y0 = y * W, yp = rowP_[y];
    for (int x = 0; x < W; x++) {
      const int i = y0 + x, t = tr[i];
      const int xm = colM_[x], xp = colP_[x];
      int push = 0, m = -1;
      // Pushing and sparking both need a neighbor of another tier; in a
      // single-tier neighborhood the JS loop below does nothing (no RNG
      // draw either), so it is skipped.
      const bool mixed = (tr[ym + xm] != t) | (tr[ym + x] != t) | (tr[ym + xp] != t) | (tr[y0 + xm] != t) |
                         (tr[y0 + xp] != t) | (tr[yp + xm] != t) | (tr[yp + x] != t) | (tr[yp + xp] != t);
      nb[0] = ym + xm; nb[1] = ym + x; nb[2] = ym + xp; nb[3] = y0 + xm; nb[4] = y0 + xp; nb[5] = yp + xm; nb[6] = yp + x; nb[7] = yp + xp;
      for (int k = 0; mixed && k < 8; k++) {
        const int j = nb[k];
        if (!al[j]) continue;
        const int tj = tr[j];
        if (tj == t) continue;
        if (canPush[tj * T + t]) { push++; if (tj > m) m = tj; }
        // The spark draw sits inside the neighbor loop: RNG-order-sensitive.
        if (al[i] && sparks[t * T + tj] && sparkSite < 0 && rng() < p.spark * brake) {
          sparkSite = i; sparkPair[0] = std::min(t, tj); sparkPair[1] = std::max(t, tj);
        }
      }
      if (push == 0) {
        if (pr[i] > 0) { pr[i] = float(double(pr[i]) * 0.8); if (double(pr[i]) < 0.05) pr[i] = 0; }
        wl[i] = float(double(wl[i]) * p.forget);
        continue;
      }
      pr[i] = float(double(pr[i]) * 0.8 + push);
      stats.contest[t] += push; stats.contest[m] += push; stats.wall[t] += wl[i];
      if (double(pr[i]) >= p.hold * (1 + double(wl[i]))) { claims.push_back(i); claims.push_back(m); }
      else wl[i] = float(std::min(p.hardness, double(wl[i]) + p.gain * 0.2));
    }
  }
  for (size_t k = 0; k < claims.size(); k += 2) {
    const int i = claims[k];
    prevTier[i] = tr[i]; prevSerial[i] = tiers[tr[i]].serial;
    tr[i] = uint16_t(claims[k + 1]); pr[i] = 0; wl[i] = 0; hm[i] = 0; res[i] = 0; claimed[i] = gen;
  }
  // 4. Retreat: an extinct tier gives its ground back in reverse claim order,
  // each site to whoever held it before, while that owner lives; otherwise to
  // the tier below (D-031; the reference always used the tier below).
  std::optional<Event> finished;
  if (retreat) {
    Retreat& rt = *retreat;
    rt.t++;
    auto owner = [&](int i) {
      const int q = prevTier[i];
      return q < rt.tier && tiers[q].serial == prevSerial[i] ? q : rt.tier - 1;
    };
    const double threshold = rt.from - (rt.from - rt.to + 1) * std::min(1.0, double(rt.t) / rt.dur);
    for (int i = 0; i < n; i++)
      if (tr[i] == rt.tier && double(claimed[i]) >= threshold) { tr[i] = uint16_t(owner(i)); pr[i] = 0; wl[i] = 0; }
    if (rt.t >= rt.dur) {
      for (int i = 0; i < n; i++) if (tr[i] == rt.tier) tr[i] = uint16_t(owner(i));
      Tier gone = tiers.back();
      tiers.pop_back();
      gone.hasExtinctAt = true; gone.extinctAt = gen; gone.dying = false;
      extinct.push_back(gone);
      retreat.reset();
      resetFrontierStats();
      finished = Event{Event::Extinct, gone.idx, 0, 0, gen, false};
    }
  }
  // 5. Counts, crowding brake, reign.
  const int TT = int(tiers.size());
  std::vector<uint32_t> counts(TT, 0);
  for (int i = 0; i < n; i++) counts[tr[i]]++;
  int act = 0;
  for (int t = 0; t < TT; t++) if (double(counts[t]) >= n * 0.01 && !tiers[t].dying) act++;
  const int excess = std::max(0, act - 2);
  active = act;
  brake = 1 / (1 + p.crowding * 0.6 * std::pow(double(excess), 1.5));
  thresholdLift = 1 + p.crowding * 0.05 * excess;
  warm = p.warmup * (1 + p.crowding * excess);
  hasWarm = true;
  int D = 0;
  for (int t = 1; t < TT; t++) if (counts[t] > counts[D]) D = t;
  if (!hasReign || tiers[D].serial != reignSerial) { hasReign = true; reignSerial = tiers[D].serial; reignStart = gen; }
  for (int t = 0; t < TT; t++) tiers[t].cells = counts[t];

  // 6. Early exits, in this order (SPEC §3.6).
  if (retreat || finished) { gen++; lastMax = 0; lastArg = -1; return finished; }
  if (sparkSite >= 0 && !search) {
    gen++;
    // Quirk 9 (kept, D-031): the cooldown is stamped with the post-increment gen.
    const uint64_t sa = tiers[sparkPair[0]].serial, sb = tiers[sparkPair[1]].serial;
    sparkLast[std::min(sa, sb) << 32 | std::max(sa, sb)] = gen;
    return emerge(sparkSite, 0, p, sparkPair, -1);
  }
  if (!search && p.mutation > 0 && double(frontierAge) > warm) {
    // The reference also checked `D === tiers.indexOf(reignTier)`, which is
    // always true here (reignTier was just set to tiers[D]); P4 quirk #7,
    // removed as dead code with no change in output (D-031).
    const int Dm = D;
    const double share = double(counts[Dm]) / n;
    const double reign = double(gen - reignStart) / meanEpoch;
    if (rng() < p.mutation * brake * share * reign * reign / meanEpoch) {
      int site = -1;
      for (int q = 0; q < 4000 && site < 0; q++) {
        const int i = int(rng() * n);
        if (tr[i] == Dm && al[i]) site = i;
      }
      if (site >= 0) { gen++; return emerge(site, 0, p, nullptr, Dm); }
    }
  }

  // 7. Surprise at the frontier.
  for (int k = 0; k < 512; k++) table[k] *= p.memory;
  tableTotal *= p.memory;
  float* sc = score.data();
  std::vector<int>& codes = codes_;
  codes.clear();
  for (int y = 0; y < H; y++) {
    const int ym = rowM_[y], y0 = y * W, yp = rowP_[y];
    for (int x = 0; x < W; x++) {
      const int i = y0 + x;
      if (!al[i] || tr[i] != F) { sc[i] = 0; continue; }
      const int xm = colM_[x], xp = colP_[x];
      codes.push_back(i);
      codes.push_back(al[ym + xm] | al[ym + x] << 1 | al[ym + xp] << 2 | al[y0 + xm] << 3 | al[y0 + x] << 4 |
                      al[y0 + xp] << 5 | al[yp + xm] << 6 | al[yp + x] << 7 | al[yp + xp] << 8);
    }
  }
  const double denom = tableTotal + 512;
  for (size_t k = 0; k < codes.size(); k += 2) sc[codes[k]] = float(-std::log2((table[codes[k + 1]] + 1) / denom));
  for (size_t k = 0; k < codes.size(); k += 2) table[codes[k + 1]] += 1;
  tableTotal += double(codes.size() / 2);
  double best = 0;
  const int arg = surpriseWindowMax(sc, tr, F, W, H, integral, best);
  lastMax = best; lastArg = arg;
  frontierAge++; gen++;

  // 8. Extinction: a frontier that dies out or freezes solid.
  starve = (frontierLive < 4 || motion < 3) ? starve + 1 : 0;
  if (F > 0 && double(starve) > p.extinction) {
    int32_t from = tiers[F].gen;
    for (int i = 0; i < n; i++) if (tr[i] == F && claimed[i] > from) from = claimed[i];
    tiers[F].dying = true;
    const int dur = std::max(30, int(std::round(p.retreat * tiers[F].cells / n)));
    retreat = Retreat{F, double(from), double(tiers[F].gen), 0, dur};
    return Event{Event::Dying, F, 0, 0, gen, false};
  }
  // 9. The record is set during warm-up, then only erodes.
  if (double(frontierAge) <= warm) { if (best > record) record = best; return std::nullopt; }
  if (search) return std::nullopt;  // quirk 3: record frozen while a search is pending
  if (arg >= 0 && best > record * (1 + p.margin) * thresholdLift) return emerge(arg, best, p, nullptr, -1);
  record *= p.patience;
  return std::nullopt;
}

Event World::emerge(int site, double surprise, const Params&, const int* parents, int mutateFrom) {
  const int cx = site % W, cy = site / W;
  std::vector<uint32_t> bits = {seed, uint32_t(tiers.size()), uint32_t(extinct.size()),
                                parents ? uint32_t(parents[0] * 977 + parents[1] + 1) : 0u,
                                mutateFrom < 0 ? 0u : uint32_t(mutateFrom + 7919)};
  for (int dy = -3; dy <= 3; dy++) {
    uint32_t row = 0;
    for (int dx = -3; dx <= 3; dx++) row = (row << 1) | alive[((cy + dy + H) % H) * W + (cx + dx + W) % W];
    bits.push_back(row);
  }
  const uint32_t h = hash32(bits);
  Search s{cx, cy, surprise, h, Rng(h), 0, frontier(), parents != nullptr,
           {parents ? parents[0] : 0, parents ? parents[1] : 0}, mutateFrom};
  search = s;
  return Event{Event::Searching, 0, cx, cy, gen, parents != nullptr};
}

std::optional<Event> World::work(const Params& p, int maxCandidates) {
  if (!search) return std::nullopt;
  if (search->parent != frontier() || retreat) { search.reset(); return std::nullopt; }
  Search& S = *search;
  Rng& r = S.rng;
  bool found = false;
  Rule rule;
  double speedFound = 0;
  int done = 0;
  while (!found && S.tries < 800 && done++ < maxCandidates) {
    S.tries++;
    uint16_t born = 0, survive = 0;
    if (S.mutateFrom >= 0) {
      // A mutant differs from its parent's rule by one or two neighbor counts.
      const Rule pr0 = tiers[S.mutateFrom].rule;
      born = pr0.born; survive = pr0.survive;
      const int flips = r() < 0.6 ? 1 : 2;
      for (int f = 0; f < flips; f++) {
        const int bit = int(std::floor(r() * 16));
        if (bit < 7) born ^= uint16_t(1 << (bit + 2)); else survive ^= uint16_t(1 << (bit - 7));
      }
    } else {
      for (int c = 2; c <= 8; c++) if (r() < 0.28) born |= uint16_t(1 << c);
      for (int c = 0; c <= 8; c++) if (r() < 0.4) survive |= uint16_t(1 << c);
    }
    if (!born) continue;
    const Rule cand{born, survive};
    if (usedRules.count(cand.key())) continue;
    const double speed = growth(cand, r, p.maxSpeed);
    if (speed > p.maxSpeed) continue;
    const ScreenResult st = screen(cand, r);
    if (st.ok) { found = true; rule = cand; speedFound = speed; }
  }
  if (!found) {
    if (S.tries >= 800) {
      // No viable rule: count a failed mutant as a birth for pacing (quirk 4: record *= 1.05).
      if (S.mutateFrom >= 0) lastBirth = gen;
      search.reset();
      record *= 1.05;
    }
    return std::nullopt;
  }
  Search s = S;  // copy (RNG state included): `search` is cleared before placement, as in the JS
  search.reset();
  Rng& rr = s.rng;
  usedRules.insert(rule.key());
  const int idx = int(tiers.size());
  int parentEls[2] = {-1, -1};
  if (s.hasParents) { parentEls[0] = tiers[s.parents[0]].el; parentEls[1] = tiers[s.parents[1]].el; }
  auto inParents = [&](int e) { return s.hasParents && (parentEls[0] == e || parentEls[1] == e); };
  // Quirk 6: elx is drawn even for mutants, consuming search randomness.
  int elx = 1 + int(std::floor(rr() * 5));
  for (int k = 0; k < 6 && inParents(elx); k++) elx = 1 + int(std::floor(rr() * 5));
  Tier t;
  if (s.mutateFrom >= 0) {
    const Tier& P = tiers[s.mutateFrom];
    t.el = P.el;
    std::copy(std::begin(P.react), std::end(P.react), std::begin(t.react));
    if (rr() < 0.35) {
      const int e = int(std::floor(rr() * 6));
      if (e != P.el) t.react[e] = uint8_t(std::floor(rr() * 4));
    }
  } else genome(rr, uint8_t(elx), t);
  t.idx = idx; t.rule = rule; t.gen = gen; t.hasOrigin = true; t.origin[0] = s.cx; t.origin[1] = s.cy;
  t.surprise = s.surprise; t.tries = s.tries; t.hash = s.h; t.speed = speedFound; t.cells = 0;
  t.hasParents = s.hasParents; t.parents[0] = s.parents[0]; t.parents[1] = s.parents[1];
  t.mutatedFrom = s.mutateFrom; t.from = s.parent; t.quiet = gen - lastBirth;
  t.reign = s.mutateFrom >= 0 ? gen - reignStart : 0;
  t.serial = nextSerial_++;
  tiers.push_back(t);
  meanEpoch = 0.7 * meanEpoch + 0.3 * std::max(50.0, double(gen - lastBirth));
  lastBirth = gen;
  const int rad = 6;
  for (int dy = -rad; dy <= rad; dy++)
    for (int dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const int i = ((s.cy + dy + H) % H) * W + (s.cx + dx + W) % W;
      prevTier[i] = tier[i]; prevSerial[i] = tiers[tier[i]].serial;
      tier[i] = uint16_t(idx); harm[i] = 0; resist[i] = 0; wall[i] = 0; claimed[i] = gen;
      if (rr() < 0.35) alive[i] = 1;
    }
  resetFrontierStats();
  return Event{Event::Birth, idx, s.cx, s.cy, gen, false};
}

std::optional<Event> World::forceEmerge(const Params& p) {
  if (retreat || search || lastArg < 0) return std::nullopt;
  return emerge(lastArg, lastMax, p, nullptr, -1);
}

}  // namespace culture
