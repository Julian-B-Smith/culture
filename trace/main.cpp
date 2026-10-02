// culture_trace — headless trace writer, the C++ twin of tools/golden.js.
//
//   culture_trace [--profile default|stress] [--out dir] [--gens N] seed...
//   culture_trace --bench WxH [--gens N] [--seed S]
//   culture_trace --deep [--core opt|ref] [--profile default|stress|chaos] [--mask-trig] --gens N seed   (stdout)
//
// Trace mode writes <out>/<profile>-seed-<n>.jsonl in the golden format (a
// header, one line per generation, a births footer) using INSTANT search:
// work(p, unlimited) after every step, exactly as golden.js does. Check it
// with tools/compare.js. Only the per-generation lines and the footer are
// compared; the header is informational.
//
// Bench mode steps a default-profile world and prints the mean ms/step. It
// reads the clock, which is fine here: this is an adapter, not the core.
#include <algorithm>
#include <bit>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "culture/core.hpp"
#include "../core/ref/core_ref.hpp"

using namespace culture;

// Trace hashes take the in-memory bytes of uint16/float/int32/double arrays
// as the JS typed arrays' little-endian bytes.
static_assert(std::endian::native == std::endian::little, "trace hashing assumes a little-endian host");

namespace {

uint32_t fnv(const uint8_t* bytes, size_t len) {
  uint32_t h = 2166136261u;
  for (size_t i = 0; i < len; i++) { h ^= bytes[i]; h *= 16777619u; }
  return h;
}

// golden.js prints `+x.toPrecision(10)`; compare.js checks these two fields
// with a relative tolerance, so %.10g carries the same information.
void num(std::string& s, double x) {
  char b[40];
  std::snprintf(b, sizeof b, "%.10g", x);
  s += b;
}
void num(std::string& s, long long x) { s += std::to_string(x); }

// Key order matters: compare.js re-serializes events and diffs the strings.
void eventJson(std::string& s, const Event& e) {
  switch (e.kind) {
    case Event::Searching:
      s += "{\"searching\":true,\"x\":" + std::to_string(e.x) + ",\"y\":" + std::to_string(e.y) +
           ",\"gen\":" + std::to_string(e.gen) + ",\"spark\":" + (e.spark ? "true" : "false") + "}";
      break;
    case Event::Birth:
      s += "{\"tier\":" + std::to_string(e.tier) + ",\"gen\":" + std::to_string(e.gen) +
           ",\"x\":" + std::to_string(e.x) + ",\"y\":" + std::to_string(e.y) + "}";
      break;
    case Event::Dying:
      s += "{\"dying\":" + std::to_string(e.tier) + ",\"gen\":" + std::to_string(e.gen) + "}";
      break;
    case Event::Extinct:
      s += "{\"extinct\":" + std::to_string(e.tier) + ",\"gen\":" + std::to_string(e.gen) + "}";
      break;
  }
}

int runTrace(const std::string& profile, const std::string& outDir, int gens, uint32_t seed) {
  const Params p = profile == "stress" ? stressParams() : defaultParams();
  constexpr int W = 220, H = 140;
  World w(W, H, seed);
  const std::string path = outDir + "/" + profile + "-seed-" + std::to_string(seed) + ".jsonl";
  FILE* f = std::fopen(path.c_str(), "wb");
  if (!f) { std::perror(path.c_str()); return 1; }
  std::fprintf(f, "{\"header\":true,\"profile\":\"%s\",\"seed\":%u,\"W\":%d,\"H\":%d,\"gens\":%d,\"search\":\"instant\",\"impl\":\"libculture\"}\n",
               profile.c_str(), seed, W, H, gens);
  std::string line;
  for (int g = 0; g < gens; g++) {
    std::vector<Event> events;
    if (auto e1 = w.step(p)) events.push_back(*e1);
    if (auto e2 = w.work(p, World::kUnlimited)) events.push_back(*e2);
    char hx[2][9];
    std::snprintf(hx[0], 9, "%08x", fnv(w.alive.data(), w.alive.size()));
    // Uint16 tier grid as little-endian bytes. arm64 and x86-64 are both
    // little-endian, so the in-memory bytes are already the JS byte order.
    std::snprintf(hx[1], 9, "%08x", fnv(reinterpret_cast<const uint8_t*>(w.tier.data()), w.tier.size() * 2));
    line = "{\"gen\":";
    num(line, (long long)w.gen);
    line += ",\"alive\":\"" + std::string(hx[0]) + "\",\"tier\":\"" + hx[1] + "\",\"tiers\":";
    num(line, (long long)w.tiers.size());
    line += ",\"frontier\":"; num(line, (long long)w.frontier());
    line += ",\"extinct\":"; num(line, (long long)w.extinct.size());
    line += ",\"active\":"; num(line, (long long)w.active);
    line += ",\"record\":"; num(line, w.record);
    line += ",\"lastMax\":"; num(line, w.lastMax);
    line += ",\"lastArg\":"; num(line, (long long)w.lastArg);
    line += std::string(",\"retreat\":") + (w.retreat ? "true" : "false");
    line += std::string(",\"search\":") + (w.search ? "true" : "false");
    line += ",\"cells\":[";
    for (size_t t = 0; t < w.tiers.size(); t++) { if (t) line += ","; num(line, (long long)w.tiers[t].cells); }
    line += "]";
    if (!events.empty()) {
      line += ",\"events\":[";
      for (size_t k = 0; k < events.size(); k++) { if (k) line += ","; eventJson(line, events[k]); }
      line += "]";
    }
    line += "}\n";
    std::fputs(line.c_str(), f);
  }
  // Footer: every birth (living tiers above 0, then extinct ones), stably
  // sorted by birth gen, exactly as golden.js builds it.
  std::vector<Tier> births(w.tiers.begin() + 1, w.tiers.end());
  births.insert(births.end(), w.extinct.begin(), w.extinct.end());
  std::stable_sort(births.begin(), births.end(), [](const Tier& a, const Tier& b) { return a.gen < b.gen; });
  line = "{\"footer\":true,\"births\":[";
  for (size_t k = 0; k < births.size(); k++) {
    const Tier& t = births[k];
    if (k) line += ",";
    const char* kind = t.mutatedFrom >= 0 ? "mutation" : t.hasParents ? "spark" : "surprise";
    line += "{\"idx\":" + std::to_string(t.idx) + ",\"gen\":" + std::to_string(t.gen) + ",\"rule\":\"" + ruleStr(t.rule) +
            "\",\"el\":\"" + kElements[t.el] + "\",\"kind\":\"" + kind + "\",\"tries\":" + std::to_string(t.tries) +
            ",\"extinctAt\":" + (t.hasExtinctAt ? std::to_string(t.extinctAt) : std::string("null")) + "}";
  }
  line += "]}\n";
  std::fputs(line.c_str(), f);
  std::fclose(f);
  std::printf("wrote %s\n", path.c_str());
  return 0;
}

// Deep-state lines for tests/deep.js (same columns, same order; see that
// file for what each one covers). Arrays are hashed as their in-memory
// little-endian bytes, matching the JS typed arrays. maskTrig prints "-" for
// the trig-derived stats, used when the local node is the plain fdlibm flavor.
struct DeepProfile { Params p; int W, H, slice, force; };

DeepProfile deepProfile(const std::string& name) {
  if (name == "stress") return {stressParams(), 220, 140, World::kUnlimited, 0};
  if (name == "chaos") {
    Params p = defaultParams();
    p.spark = 0.002; p.mutation = 5; p.extinction = 30;  // same literals as tests/deep.js
    return {p, 37, 23, 2, 15};
  }
  return {defaultParams(), 220, 140, World::kUnlimited, 0};
}

// Templated over the core so the optimized World and the frozen naive
// ref::World print the same lines (D-030: core_ref is the in-C++ oracle).
template <class WorldT>
int runDeep(const std::string& profile, int gens, uint32_t seed, bool maskTrig) {
  const DeepProfile P = deepProfile(profile);
  WorldT w(P.W, P.H, seed);
  auto h = [](const void* d, size_t len, uint32_t seedH = 2166136261u) {
    const uint8_t* b = static_cast<const uint8_t*>(d);
    for (size_t i = 0; i < len; i++) { seedH ^= b[i]; seedH *= 16777619u; }
    return seedH;
  };
  auto vh = [&](auto const& v, uint32_t seedH) { return h(v.data(), v.size() * sizeof(v[0]), seedH); };
  auto bits = [](double x) { uint64_t u; std::memcpy(&u, &x, 8); return (unsigned long long)u; };
  for (int g = 0; g < gens; g++) {
    w.step(P.p);
    w.work(P.p, P.slice);
    if (P.force && w.gen % P.force == 0) w.forceEmerge(P.p);
    const Stats& s = w.stats;
    uint32_t sInt = 2166136261u;
    sInt = vh(s.live, sInt); sInt = vh(s.move, sInt); sInt = vh(s.fed, sInt); sInt = vh(s.contest, sInt); sInt = vh(s.wall, sInt);
    uint32_t sTrig = 2166136261u;
    sTrig = vh(s.cos, sTrig); sTrig = vh(s.sin, sTrig); sTrig = vh(s.cosY, sTrig); sTrig = vh(s.sinY, sTrig);
    char trig[9] = "-";
    if (!maskTrig) std::snprintf(trig, sizeof trig, "%08x", sTrig);
    std::string retreat = "-", search = "-";
    if (w.retreat) retreat = std::to_string(w.retreat->tier) + ":" + std::to_string(w.retreat->t) + ":" + std::to_string(w.retreat->dur);
    if (w.search) search = std::to_string(w.search->tries) + ":" + std::to_string(w.search->h);
    std::printf("%d %08x %08x %08x %08x %08x %08x %08x %08x %s %016llx %016llx %016llx %016llx %016llx %016llx %016llx %d %d %d %d %zu %zu %s %s\n",
                w.gen, h(w.pressure.data(), w.pressure.size() * 4), h(w.wall.data(), w.wall.size() * 4),
                h(w.resist.data(), w.resist.size() * 4), h(w.harm.data(), w.harm.size()),
                h(w.claimed.data(), w.claimed.size() * 4), h(w.score.data(), w.score.size() * 4),
                h(w.table, sizeof w.table), sInt, trig,
                bits(w.record), bits(w.lastMax), bits(w.brake), bits(w.thresholdLift), bits(w.warm), bits(w.meanEpoch),
                bits(w.tableTotal), w.reignStart, w.lastBirth, w.frontierAge, w.starve, w.tiers.size(), w.extinct.size(),
                retreat.c_str(), search.c_str());
  }
  return 0;
}

int runBench(int W, int H, int gens, uint32_t seed) {
  const Params p = defaultParams();
  World w(W, H, seed);
  // Warm the caches and let a few tiers appear before timing.
  for (int g = 0; g < 50; g++) { w.step(p); w.work(p, World::kUnlimited); }
  std::vector<double> ms;
  ms.reserve(gens);
  for (int g = 0; g < gens; g++) {
    const auto t0 = std::chrono::steady_clock::now();
    w.step(p);
    const auto t1 = std::chrono::steady_clock::now();
    w.work(p, World::kUnlimited);  // search time excluded: it moves to a worker (PORT_PLAN)
    ms.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
  }
  double sum = 0;
  for (double v : ms) sum += v;
  std::vector<double> sorted = ms;
  std::sort(sorted.begin(), sorted.end());
  // The gate judges the MEAN (P1 criterion 2). p99/max are printed because a
  // frame budget (P2) is about the tail, not the mean.
  std::printf("bench %dx%d seed %u: %.3f ms/step (mean of %d steps, search excluded), p99 %.3f, max %.3f, tiers=%zu\n",
              W, H, seed, sum / gens, gens, sorted[size_t(0.99 * (gens - 1))], sorted.back(), w.tiers.size());
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  std::string profile = "default", out = "golden", bench;
  bool deep = false, maskTrig = false, refCore = false;
  int gens = -1;
  uint32_t benchSeed = 1;
  std::vector<uint32_t> seeds;
  for (int i = 1; i < argc; i++) {
    const std::string a = argv[i];
    auto val = [&]() -> std::string {
      if (i + 1 >= argc) { std::fprintf(stderr, "missing value for %s\n", a.c_str()); std::exit(2); }
      return argv[++i];
    };
    if (a == "--profile") profile = val();
    else if (a == "--out") out = val();
    else if (a == "--gens") gens = std::atoi(val().c_str());
    else if (a == "--bench") bench = val();
    else if (a == "--deep") deep = true;
    else if (a == "--mask-trig") maskTrig = true;
    else if (a == "--core") { const std::string c = val(); if (c != "ref" && c != "opt") { std::fprintf(stderr, "--core ref|opt\n"); return 2; } refCore = c == "ref"; }
    else if (a == "--seed") benchSeed = uint32_t(std::strtoul(val().c_str(), nullptr, 10));
    else seeds.push_back(uint32_t(std::strtoul(a.c_str(), nullptr, 10)));
  }
  if (!bench.empty()) {
    int W = 0, H = 0;
    if (std::sscanf(bench.c_str(), "%dx%d", &W, &H) != 2) { std::fprintf(stderr, "--bench WxH\n"); return 2; }
    return runBench(W, H, gens > 0 ? gens : 500, benchSeed);
  }
  if (deep) {
    if (profile != "default" && profile != "stress" && profile != "chaos") { std::fprintf(stderr, "unknown profile %s\n", profile.c_str()); return 2; }
    if (seeds.size() != 1 || gens <= 0) { std::fprintf(stderr, "--deep needs --gens N and one seed\n"); return 2; }
    return refCore ? runDeep<ref::World>(profile, gens, seeds[0], maskTrig) : runDeep<World>(profile, gens, seeds[0], maskTrig);
  }
  if (profile != "default" && profile != "stress") { std::fprintf(stderr, "unknown profile %s\n", profile.c_str()); return 2; }
  // Same defaults as golden.js PROFILES.
  if (gens < 0) gens = profile == "stress" ? 5000 : 3000;
  if (seeds.empty()) seeds = profile == "stress" ? std::vector<uint32_t>{4} : std::vector<uint32_t>{1, 2, 3};
  for (uint32_t s : seeds) if (int rc = runTrace(profile, out, gens, s)) return rc;
  return 0;
}
