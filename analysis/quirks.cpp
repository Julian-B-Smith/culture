// culture_quirks — evidence for ROADMAP P4 (deciding the SPEC §8 quirks and
// the rule-screen review, D-029). Runs the C++ core (bit-exact with the
// reference) in instant-search mode and counts how often each quirk actually
// fires and what it touches, plus how screened rules behave by family.
//
//   culture_quirks [--gens N] [--profile default|stress] seed...
//
// Read-only over the World: it observes state between calls and never
// changes the simulation, so its numbers describe the reference's behavior.
// Deterministic: same seeds, same output.
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "culture/core.hpp"

using namespace culture;

namespace {

// On/off complement of a Life-like rule: the same dynamics with live and dead
// swapped. B' = {8-c : c not in S}, S' = {8-c : c not in B}.
Rule complement(Rule r) {
  Rule c;
  for (int n = 0; n <= 8; n++) {
    if (!((r.survive >> n) & 1)) c.born |= uint16_t(1 << (8 - n));
    if (!((r.born >> n) & 1)) c.survive |= uint16_t(1 << (8 - n));
  }
  return c;
}

struct TierLife {
  int idx;
  int32_t born, died = -1;
  const char* kind;
  Rule rule;
  uint32_t maxCells = 0;
  bool b2;
};

struct Totals {
  long gens = 0, births = 0, surprise = 0, spark = 0, mutation = 0;
  long extinctions = 0, retreatGens = 0, skipSurpriseGens = 0;
  long retreatWrongParent = 0;        // quirk 1
  long retreatWrongParentCells = 0;   //   ground handed to a non-parent
  long retreatCellsTotal = 0;
  long failedSearches = 0, failedMutantSearches = 0;  // quirk 4
  long cancelledSearches = 0;
  long idxReuse = 0, idxReuseStaleSpark = 0;  // quirk 8
  long mutantElxDraws = 0;                      // quirk 6
  long complementUsed = 0;                      // screen: complement already used
  long edgeBirths = 0;          // births centred within 2 cells of the edge (impossible before D-031)
  long revertBelow = 0, revertOther = 0;  // retreating cells: to idx-1 vs to another (previous) owner
  long b2Births = 0;
  std::vector<TierLife> lives;
};

void runOne(uint32_t seed, int gens, const Params& p, Totals& T) {
  World w(220, 140, seed);
  std::set<int> extinctIdx;
  std::map<uint64_t, size_t> lifeOf;  // tier serial -> index into T.lives
  const int n = w.W * w.H;
  for (int g = 0; g < gens; g++) {
    const int tiersBefore = int(w.tiers.size());
    const int dyingIdx = w.retreat ? w.retreat->tier : -1;
    std::vector<uint16_t> before;
    if (dyingIdx >= 0) before = w.tier;
    std::optional<Event> e1 = w.step(p);
    if (dyingIdx >= 0)
      for (int i = 0; i < n; i++)
        if (before[i] == dyingIdx && w.tier[i] != dyingIdx) (w.tier[i] == dyingIdx - 1 ? T.revertBelow : T.revertOther)++;
    T.gens++;
    if (w.retreat || (e1 && e1->kind == Event::Extinct)) T.retreatGens++;
    if (e1 && e1->kind == Event::Searching && e1->spark) T.skipSurpriseGens++;
    if (e1 && e1->kind == Event::Dying) {
      const Tier& d = w.tiers[e1->tier];
      bool parentIsBelow;
      if (d.mutatedFrom >= 0) parentIsBelow = d.mutatedFrom == d.idx - 1;
      else if (d.hasParents) parentIsBelow = d.parents[0] == d.idx - 1 || d.parents[1] == d.idx - 1;
      else parentIsBelow = d.from == d.idx - 1;
      T.retreatCellsTotal += d.cells;
      if (!parentIsBelow) { T.retreatWrongParent++; T.retreatWrongParentCells += d.cells; }
    }
    if (e1 && e1->kind == Event::Extinct) {
      T.extinctions++;
      extinctIdx.insert(e1->tier);
      const Tier& gone = w.extinct.back();
      auto it = lifeOf.find(gone.serial);
      if (it != lifeOf.end()) T.lives[it->second].died = w.gen;
    }
    const bool hadSearch = bool(w.search);
    const int mutateFrom = hadSearch ? w.search->mutateFrom : -1;
    const bool mutantSearch = hadSearch && mutateFrom >= 0;
    if (mutantSearch && e1 && e1->kind == Event::Searching) T.skipSurpriseGens++;
    std::optional<Event> e2 = w.work(p, World::kUnlimited);
    if (hadSearch && !e2 && !w.search) {
      if (int(w.tiers.size()) == tiersBefore && !w.retreat && w.search == std::nullopt) {
        // Either the 800-candidate budget ran out (record *= 1.05) or the
        // search was cancelled (frontier changed / retreat began).
        // Cancellation only happens with a retreat or a frontier change.
        T.failedSearches++;
        if (mutantSearch) T.failedMutantSearches++;
      } else {
        T.cancelledSearches++;
      }
    }
    if (e2 && e2->kind == Event::Birth) {
      const Tier& t = w.tiers.back();
      T.births++;
      const char* kind = t.mutatedFrom >= 0 ? "mutation" : t.hasParents ? "spark" : "surprise";
      if (t.mutatedFrom >= 0) { T.mutation++; T.mutantElxDraws++; }
      else if (t.hasParents) T.spark++;
      else T.surprise++;
      if (extinctIdx.count(t.idx)) {
        T.idxReuse++;
        // Since D-031 sparkLast is keyed by birth serials (high 32 bits = the
        // smaller serial), so a newborn can only inherit a cooldown if some key
        // already names ITS serial. Before D-031 keys were index pairs and this
        // counted 1 inherited cooldown in 400k gens.
        for (const auto& [key, when] : w.sparkLast)
          if ((key >> 32) == t.serial || (key & 0xffffffffu) == t.serial) { T.idxReuseStaleSpark++; break; }
      }
      if (w.usedRules.count(complement(t.rule).key()) && complement(t.rule).key() != t.rule.key()) T.complementUsed++;
      if (t.origin[0] < 2 || t.origin[0] >= w.W - 2 || t.origin[1] < 2 || t.origin[1] >= w.H - 2) T.edgeBirths++;
      const bool b2 = (t.rule.born >> 2) & 1;
      if (b2) T.b2Births++;
      lifeOf[t.serial] = T.lives.size();
      T.lives.push_back({t.idx, t.gen, -1, kind, t.rule, 0, b2});
    }
    for (const Tier& t : w.tiers) {
      auto it = lifeOf.find(t.serial);
      if (it != lifeOf.end()) T.lives[it->second].maxCells = std::max(T.lives[it->second].maxCells, t.cells);
    }
  }
}

double pct(double a, double b) { return b > 0 ? 100.0 * a / b : 0; }

}  // namespace

int main(int argc, char** argv) {
  int gens = 10000;
  std::string profile = "default";
  std::vector<uint32_t> seeds;
  for (int i = 1; i < argc; i++) {
    const std::string a = argv[i];
    if (a == "--gens" && i + 1 < argc) gens = std::atoi(argv[++i]);
    else if (a == "--profile" && i + 1 < argc) profile = argv[++i];
    else seeds.push_back(uint32_t(std::strtoul(a.c_str(), nullptr, 10)));
  }
  if (seeds.empty()) for (uint32_t s = 1; s <= 12; s++) seeds.push_back(s);
  const Params p = profile == "stress" ? stressParams() : defaultParams();
  Totals T;
  for (uint32_t s : seeds) runOne(s, gens, p, T);

  const int W = 220, H = 140;
  const double border = 1.0 - double((W - 4) * (H - 4)) / (W * H);
  std::printf("# culture_quirks: profile %s, %zu seeds x %d gens = %ld gens, 220x140, instant search\n",
              profile.c_str(), seeds.size(), gens, T.gens);
  std::printf("births %ld (surprise %ld, spark %ld, mutation %ld); extinctions %ld\n",
              T.births, T.surprise, T.spark, T.mutation, T.extinctions);
  std::printf("Q1 lineage: %ld/%ld dying tiers have a parent other than idx-1; "
              "%ld of %ld cells in their territory (%.1f%%)\n",
              T.retreatWrongParent, T.extinctions ? T.extinctions : 0, T.retreatWrongParentCells, T.retreatCellsTotal,
              pct(T.retreatWrongParentCells, T.retreatCellsTotal));
  std::printf("Q2 steps that skip the surprise pass: retreat %ld (%.2f%% of gens), spark/mutation trigger %ld\n",
              T.retreatGens, pct(T.retreatGens, T.gens), T.skipSurpriseGens);
  std::printf("Q3 record frozen while a search is pending: never fires in instant mode (search always resolved within the step); "
              "fires for L gens per search under deterministic latency L\n");
  std::printf("Q4 failed searches (800 candidates, record *= 1.05): %ld (%ld of them mutant); cancelled: %ld\n",
              T.failedSearches, T.failedMutantSearches, T.cancelledSearches);
  std::printf("Q5 2-cell edge band = %.2f%% of sites; births centred there: %ld of %ld (zero means the band is excluded)\n",
              100 * border, T.edgeBirths, T.births);
  std::printf("Q1' retreating cells handed to idx-1: %ld, to another (previous) owner: %ld\n", T.revertBelow, T.revertOther);
  std::printf("Q6 elx drawn for mutants: %ld wasted search-stream draws (one per mutant birth, plus rerolls)\n", T.mutantElxDraws);
  std::printf("Q8 tier index reuse: %ld births reuse an extinct index; %ld of those inherit a stale sparkLast cooldown\n",
              T.idxReuse, T.idxReuseStaleSpark);

  // Screen review: how accepted rules behave, by whether they have B2.
  auto summarize = [&](bool b2) {
    long cnt = 0, big = 0, died = 0;
    double share = 0, life = 0;
    for (const TierLife& L : T.lives) {
      if (L.b2 != b2) continue;
      cnt++;
      const double s = double(L.maxCells) / (W * H);
      share += s;
      if (s >= 0.25) big++;
      if (L.died >= 0) { died++; life += L.died - L.born; }
    }
    std::printf("  %s: %ld tiers, mean peak share %.1f%%, reached >=25%% of world: %ld (%.0f%%), went extinct: %ld, mean lifespan of extinct %.0f gens\n",
                b2 ? "B2 rules   " : "non-B2     ", cnt, cnt ? 100 * share / cnt : 0, big, pct(big, cnt), died, died ? life / died : 0);
  };
  std::printf("S  screen review (accepted rules only):\n");
  summarize(true);
  summarize(false);
  std::printf("  complement already used at birth: %ld of %ld births\n", T.complementUsed, T.births);
  std::printf("  accepted rules:");
  for (const TierLife& L : T.lives) std::printf(" %s%s", ruleStr(L.rule).c_str(), L.b2 ? "*" : "");
  std::printf("\n  (* = has B2)\n");
  return 0;
}
