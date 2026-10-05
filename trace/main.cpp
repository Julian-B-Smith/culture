// culture_trace — headless trace writer, the C++ twin of tools/golden.js.
//
//   culture_trace [--profile default|stress] [--out dir] [--gens N] seed...
//   culture_trace --bench WxH [--gens N] [--seed S]
//   culture_trace [--inputs run.json] ...   replay a spore/force input log (SPEC §10)
//   culture_trace --deep [--core opt|ref] [--profile default|stress|chaos|latency|chaos-latency]
//                 [--mask-trig] --gens N seed   (stdout)
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

// ---- Input logs (Spores, SPEC §10, D-037) ----
// run.json is what the prototype's window.cultureRun() returns:
//   { "seed": 7, "size": [220, 140], "inputs": [{ "gen", "kind": "spore"|"force", "x", "y" }] }
// or just the inputs array. A tiny reader for exactly that shape: no JSON
// library, so no dependency.
struct Input { int gen = 0; bool spore = true; int x = 0, y = 0; };
struct RunFile { bool hasSeed = false; uint32_t seed = 0; bool hasSize = false; int W = 0, H = 0; std::vector<Input> inputs; };

bool readRun(const std::string& path, RunFile& r) {
  FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) { std::perror(path.c_str()); return false; }
  std::string t;
  char buf[4096];
  for (size_t n; (n = std::fread(buf, 1, sizeof buf, f)) > 0;) t.append(buf, n);
  std::fclose(f);
  auto numAfter = [&](size_t from, const char* key, size_t end, long& out) {
    const size_t k = t.find(key, from);
    if (k == std::string::npos || k >= end) return false;
    out = std::strtol(t.c_str() + t.find(':', k) + 1, nullptr, 10);
    return true;
  };
  size_t arr = t.find("\"inputs\"");
  long v = 0;
  if (arr != std::string::npos) {
    if (numAfter(0, "\"seed\"", arr, v)) { r.hasSeed = true; r.seed = uint32_t(v); }
    const size_t sz = t.find("\"size\"");
    if (sz != std::string::npos && std::sscanf(t.c_str() + t.find('[', sz), "[%d ,%d", &r.W, &r.H) == 2) r.hasSize = true;
    arr = t.find('[', arr);
  } else {
    arr = t.find('[');  // the bare-array form
  }
  if (arr == std::string::npos) { std::fprintf(stderr, "%s: no inputs array\n", path.c_str()); return false; }
  for (size_t o = t.find('{', arr); o != std::string::npos; o = t.find('{', o + 1)) {
    const size_t c = t.find('}', o);
    if (c == std::string::npos) break;
    Input in;
    if (numAfter(o, "\"gen\"", c, v)) in.gen = int(v);
    if (numAfter(o, "\"x\"", c, v)) in.x = int(v);
    if (numAfter(o, "\"y\"", c, v)) in.y = int(v);
    const size_t kind = t.find("\"kind\"", o);
    in.spore = !(kind < c && t.find("force", kind) < c);
    r.inputs.push_back(in);
  }
  std::stable_sort(r.inputs.begin(), r.inputs.end(), [](const Input& a, const Input& b) { return a.gen < b.gen; });
  return true;
}

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

// Applies every queued input whose generation the world has reached, before
// the next step(), exactly as reference/v6/tools/golden.js does: a spore
// calls emergeAt, a force calls forceEmerge; an accepted input's search runs
// to completion at once (`settle`); a refused one is logged with its gen.
// Event JSON matches golden.js: {"input":kind, ...event} or
// {"input":kind,"refused":true,"at":gen}.
template <class WorldT, class Settle>
void applyInputs(WorldT& w, const Params& p, const std::vector<Input>& in, size_t& next, std::vector<std::string>* json, Settle settle) {
  while (next < in.size() && in[next].gen <= w.gen) {
    const Input& ev = in[next++];
    const char* kind = ev.spore ? "spore" : "force";
    const auto e0 = ev.spore ? w.emergeAt(ev.x, ev.y, p) : w.forceEmerge(p);
    if (e0) {
      if (json) { std::string e; eventJson(e, *e0); json->push_back(std::string("{\"input\":\"") + kind + "\"," + e.substr(1)); }
      if (auto b = settle(); b && json) { std::string e; eventJson(e, *b); json->push_back(e); }
    } else if (json) {
      json->push_back(std::string("{\"input\":\"") + kind + "\",\"refused\":true,\"at\":" + std::to_string(ev.gen) + "}");
    }
  }
}

int runTrace(const std::string& profile, const std::string& outDir, int gens, uint32_t seed, const RunFile* run) {
  const Params p = profile == "stress" ? stressParams() : defaultParams();
  const int W = run && run->hasSize ? run->W : 220, H = run && run->hasSize ? run->H : 140;
  World w(W, H, seed);
  const std::string path = outDir + "/" + profile + "-seed-" + std::to_string(seed) + (run ? "-inputs" : "") + ".jsonl";
  FILE* f = std::fopen(path.c_str(), "wb");
  if (!f) { std::perror(path.c_str()); return 1; }
  std::fprintf(f, "{\"header\":true,\"profile\":\"%s\",\"seed\":%u,\"W\":%d,\"H\":%d,\"gens\":%d,\"search\":\"instant\",\"impl\":\"libculture\"%s}\n",
               profile.c_str(), seed, W, H, gens, run ? ",\"inputs\":true" : "");
  size_t nextInput = 0;
  std::string line;
  for (int g = 0; g < gens; g++) {
    std::vector<std::string> inputJson;
    if (run) applyInputs(w, p, run->inputs, nextInput, &inputJson, [&] { return w.work(p, World::kUnlimited); });
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
    if (!events.empty() || !inputJson.empty()) {
      // golden.js order: input events first (applied before step), then step's and work's.
      line += ",\"events\":[";
      bool first = true;
      for (const std::string& e : inputJson) { if (!first) line += ","; line += e; first = false; }
      for (const Event& e : events) { if (!first) line += ","; eventJson(line, e); first = false; }
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
// latency >= 0 runs deterministic-latency search (D-034) with that L, using
// the synchronous resolver; properties prove a worker thread gives the same.
struct DeepProfile { Params p; int W, H, slice, force, latency = -1; };

DeepProfile deepProfile(const std::string& name) {
  if (name == "stress") return {stressParams(), 220, 140, World::kUnlimited, 0};
  if (name == "chaos" || name == "chaos-latency") {
    Params p = defaultParams();
    p.spark = 0.002; p.mutation = 5; p.extinction = 30;  // same literals as tests/js/deep.js
    return {p, 37, 23, 2, 15, name == "chaos-latency" ? 30 : -1};
  }
  if (name == "latency") return {defaultParams(), 220, 140, World::kUnlimited, 0, 30};
  return {defaultParams(), 220, 140, World::kUnlimited, 0};
}

// Templated over the core so the optimized World and the frozen naive
// ref::World print the same lines (D-030: core_ref is the in-C++ oracle).
template <class WorldT>
int runDeep(const std::string& profile, int gens, uint32_t seed, bool maskTrig, const RunFile* run) {
  const DeepProfile P = deepProfile(profile);
  WorldT w(run && run->hasSize ? run->W : P.W, run && run->hasSize ? run->H : P.H, seed);
  size_t nextInput = 0;
  auto h = [](const void* d, size_t len, uint32_t seedH = 2166136261u) {
    const uint8_t* b = static_cast<const uint8_t*>(d);
    for (size_t i = 0; i < len; i++) { seedH ^= b[i]; seedH *= 16777619u; }
    return seedH;
  };
  auto vh = [&](auto const& v, uint32_t seedH) { return h(v.data(), v.size() * sizeof(v[0]), seedH); };
  auto bits = [](double x) { uint64_t u; std::memcpy(&u, &x, 8); return (unsigned long long)u; };
  for (int g = 0; g < gens; g++) {
    // Inputs settle as the profile searches: instant/sliced call work() once;
    // latency mode lands them at start + L like any other search.
    if (run) applyInputs(w, P.p, run->inputs, nextInput, nullptr, [&]() -> std::optional<Event> {
      return P.latency >= 0 ? std::nullopt : w.work(P.p, P.slice);
    });
    w.step(P.p);
    if (P.latency >= 0) w.workLatency(P.p, P.latency, runSearch);
    else w.work(P.p, P.slice);
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
  std::string inputsPath;
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
    else if (a == "--inputs") inputsPath = val();
    else if (a == "--core") { const std::string c = val(); if (c != "ref" && c != "opt") { std::fprintf(stderr, "--core ref|opt\n"); return 2; } refCore = c == "ref"; }
    else if (a == "--seed") benchSeed = uint32_t(std::strtoul(val().c_str(), nullptr, 10));
    else seeds.push_back(uint32_t(std::strtoul(a.c_str(), nullptr, 10)));
  }
  if (!bench.empty()) {
    int W = 0, H = 0;
    if (std::sscanf(bench.c_str(), "%dx%d", &W, &H) != 2) { std::fprintf(stderr, "--bench WxH\n"); return 2; }
    return runBench(W, H, gens > 0 ? gens : 500, benchSeed);
  }
  RunFile run;
  const bool hasRun = !inputsPath.empty();
  if (hasRun) {
    if (!readRun(inputsPath, run)) return 2;
    if (seeds.empty() && run.hasSeed) seeds.push_back(run.seed);  // the file's seed unless given
  }
  const RunFile* runp = hasRun ? &run : nullptr;
  if (deep) {
    if (profile != "default" && profile != "stress" && profile != "chaos" && profile != "latency" && profile != "chaos-latency") {
      std::fprintf(stderr, "unknown profile %s\n", profile.c_str()); return 2;
    }
    if (seeds.size() != 1 || gens <= 0) { std::fprintf(stderr, "--deep needs --gens N and one seed\n"); return 2; }
    return refCore ? runDeep<ref::World>(profile, gens, seeds[0], maskTrig, runp) : runDeep<World>(profile, gens, seeds[0], maskTrig, runp);
  }
  if (profile != "default" && profile != "stress") { std::fprintf(stderr, "unknown profile %s\n", profile.c_str()); return 2; }
  // Same defaults as golden.js PROFILES.
  if (gens < 0) gens = profile == "stress" ? 5000 : 3000;
  if (seeds.empty()) seeds = profile == "stress" ? std::vector<uint32_t>{4} : std::vector<uint32_t>{1, 2, 3};
  for (uint32_t s : seeds) if (int rc = runTrace(profile, out, gens, s, runp)) return rc;
  return 0;
}
