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
// Frame format (little-endian), preceded by a u32 byte length of the rest:
//   "CF" u8 version=1 u8 0 | u32 gen | u16 W | u16 H | u16 nTiers | u16 nEvents
//   f64 record | f64 lastMax | u8 retreat | u8 search | u16 active
//   nTiers  x { u32 serial, u16 idx, u8 el, u8 flags(1=dying), u16 born,
//               u16 survive, u32 cells, u32 birthGen, u8 kind(0 surprise,
//               1 spark, 2 mutation, 3 origin) }
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
    o.u8('C'); o.u8('F'); o.u8(1); o.u8(0);
    o.u32(uint32_t(w.gen)); o.u16(uint16_t(W)); o.u16(uint16_t(H));
    o.u16(uint16_t(w.tiers.size())); o.u16(uint16_t(events.size()));
    o.f64(w.record); o.f64(w.lastMax);
    o.u8(w.retreat ? 1 : 0); o.u8(w.search ? 1 : 0); o.u16(uint16_t(w.active));
    for (const Tier& t : w.tiers) {
      o.u32(uint32_t(t.serial)); o.u16(uint16_t(t.idx)); o.u8(t.el); o.u8(t.dying ? 1 : 0);
      o.u16(t.rule.born); o.u16(t.rule.survive); o.u32(t.cells); o.u32(uint32_t(t.gen));
      o.u8(t.idx == 0 ? 3 : t.mutatedFrom >= 0 ? 2 : t.hasParents ? 1 : 0);
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
