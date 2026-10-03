// culture_stream — runs the canonical core and writes binary frames to stdout
// for the dev viewer (viewer/server.js relays them to a browser canvas).
//
//   culture_stream [--size WxH] [--seed S] [--profile default|stress]
//                  [--spf N] [--fps F] [--slice K]
//
// --spf  generations stepped per frame (speed); default 1
// --fps  frames per second written; default 30
// --slice K: work(p, K) once per generation (sliced search, smooth); 0 =
//        instant search, as the goldens use (a birth can stall a frame).
//        Either way the world is a pure function of (seed, size, profile,
//        slice): the pacing below only decides WHEN frames are written.
//
// This is a dev tool, not the P2 viewer (its render stack is undecided). It
// reads the clock to pace frames, which is allowed here: it is an adapter
// outside core/, and the simulation never sees the time.
//
// Frame format v2 (little-endian), preceded by a u32 byte length of the rest:
//   "CF" u8 version=2 u8 0 | u32 gen | u16 W | u16 H | u16 nTiers | u16 nEvents
//   f64 record | f64 lastMax | u8 retreat | u8 search | u16 active
//   i32 frontierAge | f64 warm | i32 lastBirth | f64 meanEpoch | u16 retreatDur
//   nTiers  x { u32 serial, u16 idx, u8 el, u8 flags(1=dying), u16 born,
//               u16 survive, u32 cells, u32 birthGen, u8 kind(0 surprise,
//               1 spark, 2 mutation, 3 origin), u32 hash, i16 from,
//               i16 mutatedFrom, i16 parentA, i16 parentB (-1 = none),
//               i16 originX, i16 originY (-1 = none) }
//   u16 nStats x { u32 live, u32 move, u32 fed, f64 cos, f64 sin, f64 cosY,
//                  f64 sinY, f64 contest, f64 wall }   (per tier, as the
//                  last step computed them; read by the sound engine)
//   nEvents x { u8 kind(0 searching,1 birth,2 dying,3 extinct), u16 tier,
//               u16 x, u16 y, u32 gen }
//   W*H bytes: (min(tier, 127) << 1) | alive
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

#include "culture/core.hpp"

using namespace culture;

namespace {

struct Out {
  std::vector<uint8_t> b;
  void u8(uint8_t v) { b.push_back(v); }
  void u16(uint16_t v) { u8(uint8_t(v)); u8(uint8_t(v >> 8)); }
  void u32(uint32_t v) { u16(uint16_t(v)); u16(uint16_t(v >> 16)); }
  void i16(int v) { u16(uint16_t(int16_t(v))); }
  void f64(double v) { uint64_t u; std::memcpy(&u, &v, 8); u32(uint32_t(u)); u32(uint32_t(u >> 32)); }
};

int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

}  // namespace

int main(int argc, char** argv) {
  int W = 220, H = 140, spf = 1, fps = 30, slice = 8;
  uint32_t seed = 1;
  std::string profile = "default";
  for (int i = 1; i + 1 < argc; i += 2) {
    const std::string a = argv[i], v = argv[i + 1];
    if (a == "--size") std::sscanf(v.c_str(), "%dx%d", &W, &H);
    else if (a == "--seed") seed = uint32_t(std::strtoul(v.c_str(), nullptr, 10));
    else if (a == "--profile") profile = v;
    else if (a == "--spf") spf = std::atoi(v.c_str());
    else if (a == "--fps") fps = std::atoi(v.c_str());
    else if (a == "--slice") slice = std::atoi(v.c_str());
  }
  W = clampi(W, 6, 1200); H = clampi(H, 6, 800);
  spf = clampi(spf, 1, 64); fps = clampi(fps, 1, 60); slice = clampi(slice, 0, 800);
  const Params p = profile == "stress" ? stressParams() : defaultParams();
  World w(W, H, seed);
  const int budget = slice == 0 ? World::kUnlimited : slice;

  std::vector<Event> events;
  Out o;
  const auto period = std::chrono::microseconds(1000000 / fps);
  auto next = std::chrono::steady_clock::now();
  for (;;) {
    events.clear();
    for (int s = 0; s < spf; s++) {
      if (auto e = w.step(p)) events.push_back(*e);
      if (auto e = w.work(p, budget)) events.push_back(*e);
    }
    o.b.clear();
    o.u8('C'); o.u8('F'); o.u8(2); o.u8(0);
    o.u32(uint32_t(w.gen)); o.u16(uint16_t(W)); o.u16(uint16_t(H));
    o.u16(uint16_t(w.tiers.size())); o.u16(uint16_t(events.size()));
    o.f64(w.record); o.f64(w.lastMax);
    o.u8(w.retreat ? 1 : 0); o.u8(w.search ? 1 : 0); o.u16(uint16_t(w.active));
    o.u32(uint32_t(w.frontierAge)); o.f64(w.hasWarm ? w.warm : p.warmup); o.u32(uint32_t(w.lastBirth));
    o.f64(w.meanEpoch); o.u16(uint16_t(w.retreat ? w.retreat->dur : 0));
    for (const Tier& t : w.tiers) {
      o.u32(uint32_t(t.serial)); o.u16(uint16_t(t.idx)); o.u8(t.el); o.u8(t.dying ? 1 : 0);
      o.u16(t.rule.born); o.u16(t.rule.survive); o.u32(t.cells); o.u32(uint32_t(t.gen));
      o.u8(t.idx == 0 ? 3 : t.mutatedFrom >= 0 ? 2 : t.hasParents ? 1 : 0);
      o.u32(t.hash); o.i16(t.idx == 0 ? -1 : t.from); o.i16(t.mutatedFrom);
      o.i16(t.hasParents ? t.parents[0] : -1); o.i16(t.hasParents ? t.parents[1] : -1);
      o.i16(t.hasOrigin ? t.origin[0] : -1); o.i16(t.hasOrigin ? t.origin[1] : -1);
    }
    const Stats& S = w.stats;
    o.u16(uint16_t(S.live.size()));
    for (size_t k = 0; k < S.live.size(); k++) {
      o.u32(S.live[k]); o.u32(S.move[k]); o.u32(S.fed[k]);
      o.f64(S.cos[k]); o.f64(S.sin[k]); o.f64(S.cosY[k]); o.f64(S.sinY[k]); o.f64(S.contest[k]); o.f64(S.wall[k]);
    }
    for (const Event& e : events) {
      o.u8(uint8_t(e.kind)); o.u16(uint16_t(e.tier)); o.u16(uint16_t(e.x)); o.u16(uint16_t(e.y)); o.u32(uint32_t(e.gen));
    }
    const size_t n = size_t(W) * H;
    const size_t at = o.b.size();
    o.b.resize(at + n);
    for (size_t i = 0; i < n; i++) o.b[at + i] = uint8_t((w.tier[i] > 127 ? 127 : w.tier[i]) << 1 | w.alive[i]);
    const uint32_t len = uint32_t(o.b.size());
    // A closed pipe (the browser went away) ends the process.
    if (std::fwrite(&len, 4, 1, stdout) != 1 || std::fwrite(o.b.data(), 1, o.b.size(), stdout) != o.b.size()) return 0;
    if (std::fflush(stdout) != 0) return 0;
    next += period;
    const auto now = std::chrono::steady_clock::now();
    if (next < now) next = now;  // a slow step (instant search) drops pace, never bursts
    std::this_thread::sleep_until(next);
  }
}
