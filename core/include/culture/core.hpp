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
};

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
  std::vector<float> score;
  std::vector<double> integral;

  std::vector<Tier> tiers, extinct;
  std::unordered_map<int32_t, int32_t> sparkLast;  // pair key -> generation
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
  uint64_t nextSerial_ = 0;
  std::vector<double> cosX_, sinX_, cosY_, sinY_;
  std::vector<int> colM_, colP_, rowM_, rowP_;  // torus wrap tables
  std::vector<int> claims_, codes_;            // per-step scratch, kept to avoid reallocation
};

}  // namespace culture
