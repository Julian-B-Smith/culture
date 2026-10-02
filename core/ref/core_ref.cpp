// core_ref implementation: see core/ref/core_ref.hpp for why it exists and
// the rule that it stays naive. Generated 2026-10-02 from core.cpp by undoing
// D-026's two hot-loop optimizations (single-tier neighborhood skips, local
// pointers, branch-free stats, wrap tables, reused scratch buffers).
#include "core_ref.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "../src/fdlibm.hpp"

#ifdef __FAST_MATH__
#error "core_ref must not be compiled with -ffast-math (breaks bit-exact parity)"
#endif

namespace culture::ref {

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
      const int32_t key = std::min(a2, b2) * 4096 + std::max(a2, b2);
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
  for (int y = 0; y < H; y++) {
    const int ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
    for (int x = 0; x < W; x++) {
      const int xm = (x + W - 1) % W, xp = (x + 1) % W;
      const int c = a[ym + xm] + a[ym + x] + a[ym + xp] + a[y0 + xm] + a[y0 + xp] + a[yp + xm] + a[yp + x] + a[yp + xp];
      const int i = y0 + x, ti = tr[i];
      const Rule r = tiers[ti].rule;
      int nx;
      const int fm = p.reactions ? feedOn[ti] : 0;
      bool fed = false;
      if (fm) {
        nb[0] = ym + xm; nb[1] = ym + x; nb[2] = ym + xp; nb[3] = y0 + xm; nb[4] = y0 + xp; nb[5] = yp + xm; nb[6] = yp + x; nb[7] = yp + xp;
        for (int k = 0; k < 8; k++) {
          const int j = nb[k], tj = tr[j];
          if (a[j] && tj != ti && ((fm >> el[tj]) & 1)) { fed = true; break; }
        }
      }
      if (fed) { nx = a[i] ? (survFed[ti] >> c) & 1 : (bornFed[ti] >> c) & 1; stats.fed[ti]++; }
      else nx = a[i] ? (r.survive >> c) & 1 : (r.born >> c) & 1;
      if (a[i] && !nx && p.gain > 0) {
        const int cat = c + 1;
        if (hm[i] == cat && rng() < double(res[i])) nx = 1;
        else { res[i] = float(hm[i] == cat ? std::min(1.0, double(res[i]) + p.gain) : p.gain); hm[i] = uint8_t(cat); }
      }
      res[i] = float(double(res[i]) * p.forget);
      b[i] = uint8_t(nx);
      if (nx) { stats.live[ti]++; stats.cos[ti] += cosX_[x]; stats.sin[ti] += sinX_[x]; stats.cosY[ti] += cosY_[y]; stats.sinY[ti] += sinY_[y]; }
      if (nx != a[i]) stats.move[ti]++;
      if (ti == F) { frontierLive += nx; if (nx != a[i]) motion++; }
    }
  }
  // 2. Noise, then swap buffers.
  const int flips = int(std::floor(p.noise * n + rng()));
  for (int k = 0; k < flips; k++) b[int(rng() * n)] = 1;
  std::swap(alive, next);
  const uint8_t* al = alive.data();

  // 3. Territory.
  float *pr = pressure.data(), *wl = wall.data();
  std::vector<int> claims;
  int sparkSite = -1, sparkPair[2] = {0, 0};
  for (int y = 0; y < H; y++) {
    const int ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
    for (int x = 0; x < W; x++) {
      const int i = y0 + x, t = tr[i];
      const int xm = (x + W - 1) % W, xp = (x + 1) % W;
      int push = 0, m = -1;
      nb[0] = ym + xm; nb[1] = ym + x; nb[2] = ym + xp; nb[3] = y0 + xm; nb[4] = y0 + xp; nb[5] = yp + xm; nb[6] = yp + x; nb[7] = yp + xp;
      for (int k = 0; k < 8; k++) {
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
    tr[i] = uint16_t(claims[k + 1]); pr[i] = 0; wl[i] = 0; hm[i] = 0; res[i] = 0; claimed[i] = gen;
  }
  // 4. Retreat: an extinct tier gives its ground back in reverse claim order.
  std::optional<Event> finished;
  if (retreat) {
    Retreat& rt = *retreat;
    rt.t++;
    const double threshold = rt.from - (rt.from - rt.to + 1) * std::min(1.0, double(rt.t) / rt.dur);
    for (int i = 0; i < n; i++)
      if (tr[i] == rt.tier && double(claimed[i]) >= threshold) { tr[i] = uint16_t(rt.tier - 1); pr[i] = 0; wl[i] = 0; }
    if (rt.t >= rt.dur) {
      for (int i = 0; i < n; i++) if (tr[i] == rt.tier) tr[i] = uint16_t(rt.tier - 1);
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
    sparkLast[sparkPair[0] * 4096 + sparkPair[1]] = gen;  // quirk 9: post-increment gen
    return emerge(sparkSite, 0, p, sparkPair, -1);
  }
  if (!search && p.mutation > 0 && double(frontierAge) > warm) {
    // reignTier is tiers[D] after the update above; the JS's own
    // `D === tiers.indexOf(reignTier)` guard is therefore always true (quirk 7).
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
  std::vector<int> codes;
  for (int y = 0; y < H; y++) {
    const int ym = ((y + H - 1) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
    for (int x = 0; x < W; x++) {
      const int i = y0 + x;
      if (!al[i] || tr[i] != F) { sc[i] = 0; continue; }
      const int xm = (x + W - 1) % W, xp = (x + 1) % W;
      codes.push_back(i);
      codes.push_back(al[ym + xm] | al[ym + x] << 1 | al[ym + xp] << 2 | al[y0 + xm] << 3 | al[y0 + x] << 4 |
                      al[y0 + xp] << 5 | al[yp + xm] << 6 | al[yp + x] << 7 | al[yp + xp] << 8);
    }
  }
  const double denom = tableTotal + 512;
  for (size_t k = 0; k < codes.size(); k += 2) sc[codes[k]] = float(-std::log2((table[codes[k + 1]] + 1) / denom));
  for (size_t k = 0; k < codes.size(); k += 2) table[codes[k + 1]] += 1;
  tableTotal += double(codes.size() / 2);
  double* I = integral.data();
  const int W1 = W + 1, R = 2;
  for (int y = 0; y < H; y++) {
    double row = 0;
    for (int x = 0; x < W; x++) { row += double(sc[y * W + x]); I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; }
  }
  double best = 0;
  int arg = -1;
  for (int y = R; y < H - R; y++)
    for (int x = R; x < W - R; x++) {
      const int i = y * W + x;
      if (tr[i] != F) continue;
      const double s = I[(y + R + 1) * W1 + x + R + 1] - I[(y - R) * W1 + x + R + 1] - I[(y + R + 1) * W1 + x - R] + I[(y - R) * W1 + x - R];
      if (s > best) { best = s; arg = i; }
    }
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

}  // namespace culture::ref
