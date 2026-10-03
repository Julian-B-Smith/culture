// core_ref — the FROZEN straightforward port of the simulation (D-030).
//
// Why it exists: once C++ became the canonical implementation (D-030), the JS
// reference stopped being a live second implementation. core_ref replaces it
// as the independent check for performance work: every optimized core
// (culture::World today; SIMD/GPU/threaded cores later) must match
// culture::ref::World bit for bit, the way a fast kernel is checked against a
// naive one. It stays SIMPLE on purpose: `%` wrapping, plain neighbor scans,
// no fast paths. Optimize culture::World, never this file.
//
// Semantics changes (a DECISIONS entry) land in BOTH cores in the same commit.
// Shares the value types, Params, screen(), growth(), hash32() and fdlibm with
// culture:: (none of those are optimized); re-implements only World.
#pragma once

#include "culture/core.hpp"

namespace culture::ref {

class World {
 public:
  World(int W, int H, uint32_t seed);

  // One generation. Returns at most one event (SPEC §3, §6).
  std::optional<Event> step(const Params& p);
  // Advances a pending rule search by at most maxCandidates candidates.
  // Instant mode (goldens) = work(p, kUnlimited) after every step.
  static constexpr int kUnlimited = std::numeric_limits<int>::max();
  std::optional<Event> work(const Params& p, int maxCandidates);
  using Resolver = culture::World::Resolver;
  std::optional<Event> workLatency(const Params& p, int L, const Resolver& resolve);
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
  std::vector<uint16_t> prevTier;   // previous owner per site (D-031)
  std::vector<uint64_t> prevSerial;
  std::vector<float> score;
  std::vector<double> integral;

  std::vector<Tier> tiers, extinct;
  std::unordered_map<uint64_t, int32_t> sparkLast;  // keyed by birth serials (D-031)
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
  Event place(const Rule& rule, double speed);
  std::optional<SearchJob> job_;
  uint64_t nextJobId_ = 1;
  uint64_t nextSerial_ = 0;
  std::vector<double> cosX_, sinX_, cosY_, sinY_;
  std::vector<int> colM_, colP_, rowM_, rowP_;  // torus wrap tables
  std::vector<int> claims_, codes_;            // per-step scratch, kept to avoid reallocation
};

}  // namespace culture::ref
