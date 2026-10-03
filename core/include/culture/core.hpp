// libculture — the deterministic simulation core.
//
// A line-by-line port of reference/core.js, which is NORMATIVE: where this
// file and the JS disagree, the JS wins, because it produced golden/*.jsonl.
// Read docs/handoff/SPEC.md before changing anything here; §1 (precision),
// §2 (RNG call order) and §8 (quirks) are all part of the parity contract.
//
// Purity (CLAUDE.md §Domain): no clock, no threads, no I/O, no unseeded
// randomness. Everything is a function of the seed and the call pattern.
#pragma once

#include <cstdint>
#include <functional>
#include <limits>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace culture {

// mulberry32, bit-identical to the JS. Output is uint32 / 2^32 as a double.
struct Rng {
  uint32_t a;
  explicit Rng(uint32_t seed = 0) : a(seed) {}
  double operator()() {
    a += 0x6D2B79F5u;
    uint32_t t = (a ^ (a >> 15)) * (1u | a);
    t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
    return double(t ^ (t >> 14)) / 4294967296.0;
  }
};

// FNV-1a over each value's 4 little-endian bytes (the JS hash32).
uint32_t hash32(const std::vector<uint32_t>& vals);

// Birth and survival masks: bit c set = the rule applies at neighbor count c.
struct Rule {
  uint16_t born = 0, survive = 0;
  uint32_t key() const { return uint32_t(born) << 9 | survive; }  // unique for 9-bit masks
};
std::string ruleStr(Rule r);
constexpr Rule kConway{1 << 3, (1 << 2) | (1 << 3)};

enum Element : uint8_t { ASH, EMBER, GOLD, MOSS, TIDE, VIOLET };
extern const char* const kElements[6];
enum Reaction : uint8_t { NONE = 0, PUSH = 1, FEED = 2, SPARK = 3 };

// x^1.5, correctly rounded, the same bits on every platform (D-032). The
// crowding brake needs excess^1.5; std::pow is not portable here: glibc and
// macOS libm disagree for some integers in 0..65536, and macOS pow is not
// correctly rounded at 89 of them (first k = 1018; checked with mpmath).
// This version is (all k in 0..65536 checked), and equals macOS pow and V8 on
// every value the simulation can reach (excess <= 98), so no golden moved.
double pow15(double x);

struct ScreenResult { double density = 0, activity = 0; bool ok = false; };
// Edge-of-chaos screen on a 48x48 torus; consumes N*N draws up front.
ScreenResult screen(Rule rule, Rng& rng);
// Invasion speed in cells/generation; returns 1 early once the edge outruns `limit`.
double growth(Rule rule, Rng& rng, double limit);

// Parameters. Every field is a double where the JS has a Number, so nothing
// here can round differently from the reference (SPEC §1).
struct Params {
  double noise, hold, hardness, memory, forget, patience, margin, maxSpeed,
         gain, crowding, mutation, spark;
  bool reactions;
  double warmup, extinction, retreat, sparkCooldown;
};
// The prototype's default slider values, as exact doubles (generated from
// the JS with Node, so V8's pow and the platform's pow cannot disagree here).
Params defaultParams();
Params stressParams();  // golden "stress" profile: more sparks/mutation, no crowding brake

// Max 5x5 window sum of `score` over sites whose tier is F, on the TORUS
// (D-031, P4 quirk #5: the reference skipped a 2-cell border and did not
// wrap). Raster order, strictly greater wins; returns the argmax site or -1,
// and writes the max to `best` (0 if none). The summation order is part of
// the bit-exact contract: a wrapped (W+4)x(H+4) grid, a summed-area table
// built row by row, each window evaluated as A - B - C + D. Both cores call
// this one function so they cannot disagree on rounding. `integral` is
// scratch, resized here.
int surpriseWindowMax(const float* score, const uint16_t* tier, int F, int W, int H,
                      std::vector<double>& integral, double& best);

struct Tier {
  int idx = 0;
  Rule rule;
  int32_t gen = 0;
  bool hasOrigin = false;
  int origin[2] = {0, 0};
  double surprise = 0;
  int tries = 0;
  uint32_t hash = 0;
  double speed = 0;
  uint32_t cells = 0;
  bool hasParents = false;
  int parents[2] = {0, 0};
  int mutatedFrom = -1;  // -1 = not a mutant (JS null)
  int from = 0;
  int32_t quiet = 0, reign = 0;
  uint8_t el = ASH;
  uint8_t react[6] = {0, 0, 0, 0, 0, 0};
  bool dying = false;
  bool hasExtinctAt = false;
  int32_t extinctAt = 0;
  // JS compares tier OBJECTS by identity (reignTier). Indices are reused after
  // an extinction (SPEC §8 quirk 8), so identity needs its own key.
  uint64_t serial = 0;
};

struct Event {
  enum Kind { Searching, Birth, Dying, Extinct } kind;
  int tier = 0;  // Birth: new idx; Dying: dying idx; Extinct: extinct idx
  int x = 0, y = 0;
  int32_t gen = 0;
  bool spark = false;  // Searching only
};

struct Retreat { int tier; double from, to; int t; int dur; };

struct Search {
  int cx, cy;
  double surprise;
  uint32_t h;
  Rng rng;
  int tries;
  int parent;
  bool hasParents;
  int parents[2];
  int mutateFrom;  // -1 = none
  int32_t startGen = 0;  // generation the search was triggered (deterministic latency, D-034)
};

// ---- Rule search, separable from the World (D-034) ----
// The candidate loop is a pure function of the search state, the rules
// already used, and (for a mutant) the parent's rule. While a search is
// pending nothing else can add a rule and the parent's rule cannot change,
// so a snapshot taken when the search starts is exactly equivalent to
// reading the live World. That is what lets an adapter run it on a worker
// thread while the core stays single-threaded and clock-free.

// Runs candidates until one passes, the 800-try budget is spent, or
// maxCandidates have been tried. Advances s.rng and s.tries exactly as the
// reference's work() loop. Returns true and fills rule/speed on success.
bool searchCandidates(Search& s, const Rule* parentRule, const std::unordered_set<uint32_t>& used,
                      double maxSpeed, int maxCandidates, Rule& rule, double& speed);

// Everything a search needs, copied out of the World when it starts.
struct SearchJob {
  uint64_t id = 0;
  Search search;
  bool hasParentRule = false;
  Rule parentRule;
  std::unordered_set<uint32_t> used;
  double maxSpeed = 0;
};
struct SearchOutcome {
  uint64_t id = 0;
  bool found = false;  // false = the 800-try budget ran out
  Rule rule;
  double speed = 0;
  Search after;        // search state after the loop (rng, tries)
};
// Pure and thread-safe: reads only the job. Runs to completion.
SearchOutcome runSearch(const SearchJob& job);

// Per-tier statistics the sound engine listens to (read-only consumers).
struct Stats {
  std::vector<uint32_t> live, move, fed;
  std::vector<double> cos, sin, cosY, sinY, contest, wall;
};

class World {
 public:
  World(int W, int H, uint32_t seed);

  // One generation. Returns at most one event (SPEC §3, §6).
  std::optional<Event> step(const Params& p);
  // Advances a pending rule search by at most maxCandidates candidates.
  // Instant mode (goldens) = work(p, kUnlimited) after every step.
  static constexpr int kUnlimited = std::numeric_limits<int>::max();
  std::optional<Event> work(const Params& p, int maxCandidates);
  // Deterministic-latency search (D-034), the live-play mode: call once per
  // generation after step(), INSTEAD of work(). A search triggered at
  // generation g lands at exactly g + L, so the world is a pure function of
  // (seed, params, L) however long the search takes. `resolve` must return
  // runSearch(job) for the job it is given; an adapter may compute it ahead
  // of time on a worker thread (see latencyJob) and block here only if it is
  // not ready. Cancellation (frontier changed, retreat began) is checked every
  // generation, exactly as work() does; a failed search applies its
  // consequences at the landing generation. With L = 0 this reproduces
  // instant mode (work(p, kUnlimited)) bit for bit.
  using Resolver = std::function<SearchOutcome(const SearchJob&)>;
  std::optional<Event> workLatency(const Params& p, int L, const Resolver& resolve);
  // The pending job in latency mode (set by workLatency on the generation the
  // search starts), so an adapter can launch it early. Null when none.
  const SearchJob* latencyJob() const { return job_ ? &*job_ : nullptr; }
  std::optional<Event> forceEmerge(const Params& p);

  int frontier() const { return int(tiers.size()) - 1; }

  const int W, H;
  const uint32_t seed;
  Rng rng;

  std::vector<uint8_t> alive, next;
  std::vector<uint16_t> tier;
  std::vector<float> pressure, wall;  // float32 in the reference: round at store
  std::vector<uint8_t> harm;
  std::vector<float> resist;
  std::vector<int32_t> claimed;
  // Who held each site before its current owner took it (index + birth
  // serial, so a reused index is detected). Retreating ground goes back to
  // that owner while it lives, else to the tier below (D-031, P4 quirk #1).
  std::vector<uint16_t> prevTier;
  std::vector<uint64_t> prevSerial;
  std::vector<float> score;
  std::vector<double> integral;

  std::vector<Tier> tiers, extinct;
  // Spark cooldowns, keyed by the two tiers' birth SERIALS (D-031, P4
  // quirk #8): indices are reused after extinction, so an index key let a
  // newborn tier inherit a dead tier's cooldown.
  std::unordered_map<uint64_t, int32_t> sparkLast;
  std::unordered_set<uint32_t> usedRules;  // Rule::key(); no rule is ever used twice

  int32_t gen = 0, lastBirth = 0, reignStart = 0;
  double meanEpoch = 600;
  bool hasReign = false;
  uint64_t reignSerial = 0;
  int active = 1;
  double brake = 1, thresholdLift = 1;
  bool hasWarm = false;  // JS `this.warm` is undefined until the first step
  double warm = 0;
  std::optional<Retreat> retreat;
  std::optional<Search> search;

  double table[512];
  double tableTotal = 0, record = 0, lastMax = 0;
  int lastArg = -1;
  int32_t frontierAge = 0, starve = 0;

  Stats stats;

 private:
  void resetFrontierStats();
  Event emerge(int site, double surprise, const Params& p, const int* parents, int mutateFrom);
  Event place(const Rule& rule, double speed);  // finish a successful search (shared by both modes)
  std::optional<SearchJob> job_;
  uint64_t nextJobId_ = 1;
  uint64_t nextSerial_ = 0;
  std::vector<double> cosX_, sinX_, cosY_, sinY_;
  std::vector<int> colM_, colP_, rowM_, rowP_;  // torus wrap tables
  std::vector<int> claims_, codes_;            // per-step scratch, kept to avoid reallocation
};

}  // namespace culture
