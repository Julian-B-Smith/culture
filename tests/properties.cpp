// Property tests (D-030). Goldens prove "no unintended change"; these prove
// things no golden can: the same seed always gives the same world, and no
// rule is ever used twice. Deterministic; prints one line per property and
// exits nonzero on the first failure.
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <set>
#include <vector>

#include "culture/core.hpp"

using namespace culture;

namespace {

bool sameState(const World& a, const World& b) {
  return a.alive == b.alive && a.tier == b.tier && a.pressure == b.pressure && a.wall == b.wall &&
         a.resist == b.resist && a.harm == b.harm && a.claimed == b.claimed && a.score == b.score &&
         a.gen == b.gen && a.tiers.size() == b.tiers.size() && std::memcmp(&a.record, &b.record, 8) == 0;
}

// Same seed, same call pattern -> bit-identical state, every generation.
// Two independent World objects, interleaved, so shared hidden state (a
// static, a cache keyed on address) would show up as a divergence.
bool determinism() {
  const Params p = stressParams();
  World a(97, 61, 12345), b(97, 61, 12345);
  for (int g = 0; g < 3000; g++) {
    a.step(p); a.work(p, 2);
    b.step(p); b.work(p, 2);
    if (!sameState(a, b)) { std::printf("determinism: FAIL at gen %d\n", a.gen); return false; }
  }
  std::printf("determinism: ok (two worlds, same seed, 3000 gens, sliced search, bit-identical every gen)\n");
  return true;
}

// "Rules never repeat" (D-003): across living and extinct tiers no rule
// appears twice, Conway appears only as tier 0, and usedRules matches.
bool neverRepeat() {
  Params p = stressParams();
  p.spark = 0.002; p.mutation = 5; p.extinction = 30;  // many births and extinctions
  long births = 0;
  for (uint32_t seed = 1; seed <= 6; seed++) {
    World w(64, 48, seed);
    for (int g = 0; g < 6000; g++) { w.step(p); w.work(p, World::kUnlimited); }
    std::set<uint32_t> seen;
    std::vector<const Tier*> all;
    for (const Tier& t : w.tiers) all.push_back(&t);
    for (const Tier& t : w.extinct) all.push_back(&t);
    for (const Tier* t : all) {
      if (!seen.insert(t->rule.key()).second) { std::printf("never-repeat: FAIL seed %u: %s used twice\n", seed, ruleStr(t->rule).c_str()); return false; }
    }
    if (seen.size() != w.usedRules.size()) { std::printf("never-repeat: FAIL seed %u: %zu tiers vs %zu usedRules\n", seed, seen.size(), w.usedRules.size()); return false; }
    births += long(all.size()) - 1;
  }
  std::printf("never-repeat: ok (%ld births over 6 seeds x 6000 gens, every rule distinct)\n", births);
  return births > 50;  // a property that never had a chance to fail proves nothing
}

// D-031 (P4 quirk #5): surprise windows wrap the torus, so a site on the
// edge can be the centre of a birth. Plant a 5x5 block of score centred on
// each corner and edge site in turn; the argmax must be exactly that site,
// with the full sum (the reference could never pick these sites at all).
bool windowWraps() {
  const int W = 23, H = 17;
  std::vector<float> score(W * H);
  std::vector<uint16_t> tier(W * H, 0);
  std::vector<double> scratch;
  const int centres[][2] = {{0, 0}, {W - 1, 0}, {0, H - 1}, {W - 1, H - 1}, {1, 8}, {11, H - 2}, {11, 8}};
  for (const auto& c : centres) {
    std::fill(score.begin(), score.end(), 0.f);
    for (int dy = -2; dy <= 2; dy++)
      for (int dx = -2; dx <= 2; dx++) score[((c[1] + dy + H) % H) * W + (c[0] + dx + W) % W] = 1.f;
    double best = 0;
    const int arg = surpriseWindowMax(score.data(), tier.data(), 0, W, H, scratch, best);
    if (arg != c[1] * W + c[0] || best != 25.0) {
      std::printf("window-wrap: FAIL centre (%d,%d): got site %d sum %g\n", c[0], c[1], arg, best);
      return false;
    }
  }
  std::printf("window-wrap: ok (5x5 blocks centred on corners and edges are found exactly, sum 25)\n");
  return true;
}

}  // namespace

int main() {
  bool ok = determinism();
  ok = neverRepeat() && ok;
  ok = windowWraps() && ok;
  return ok ? 0 : 1;
}
