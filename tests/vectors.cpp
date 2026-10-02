// Cross-implementation unit vectors, C++ side; must print exactly what
// tests/vectors.js prints (see that file for the scheme).
#include <cinttypes>
#include <cmath>
#include <cstdio>
#include <cstring>

#include "culture/core.hpp"
#include "fdlibm.hpp"

using namespace culture;

static const char* bits(double x) {
  static char buf[8][17];
  static int slot = 0;
  uint64_t u;
  std::memcpy(&u, &x, 8);
  char* b = buf[slot++ % 8];
  std::snprintf(b, 17, "%016" PRIx64, u);
  return b;
}

static uint32_t fnvD(uint32_t h, double x) {
  uint8_t b[8];
  std::memcpy(b, &x, 8);  // little-endian (static_assert in trace/main.cpp)
  for (uint8_t c : b) { h ^= c; h *= 16777619u; }
  return h;
}
static uint32_t fnvF(uint32_t h, float x) {
  uint8_t b[4];
  std::memcpy(b, &x, 4);
  for (uint8_t c : b) { h ^= c; h *= 16777619u; }
  return h;
}

// --trig: one hash over fdlibm cos/sin for every stereo-table argument of
// sizes 1..1200 plus a sweep of [-20, 20]. Compared with tests/trig.expected
// everywhere, and with node's Math.cos/sin where node is the fma flavor.
static int trigHash() {
  uint32_t h = 2166136261u;
  constexpr double kTau = 2 * 3.14159265358979323846;
  for (int S = 1; S <= 1200; S++)
    for (int k = 0; k < S; k++) { const double a = kTau * k / S; h = fnvD(h, fdlibm::cos(a)); h = fnvD(h, fdlibm::sin(a)); }
  for (int k = -200000; k <= 200000; k++) { const double a = k * 1e-4 * 1.0000001; h = fnvD(h, fdlibm::cos(a)); h = fnvD(h, fdlibm::sin(a)); }
  std::printf("trig %u\n", h);
  return 0;
}

int main(int argc, char** argv) {
  if (argc > 1 && std::strcmp(argv[1], "--trig") == 0) return trigHash();
  for (uint32_t seed : {0u, 1u, 42u, 0xDEADBEEFu, 0xFFFFFFFFu}) {
    Rng r(seed);
    std::printf("rng %u", seed);
    for (int k = 0; k < 8; k++) std::printf(" %s", bits(r()));
    std::printf("\n");
  }
  const std::vector<std::vector<uint32_t>> hv = {{}, {0}, {1, 2, 3}, {0xFFFFFFFFu, 7919, 977, 127}};
  for (const auto& v : hv) {
    std::printf("hash32 ");
    for (size_t i = 0; i < v.size(); i++) std::printf(i ? ",%u" : "%u", v[i]);
    std::printf(" %u\n", hash32(v));
  }
  const Rule rules[] = {{8, 12}, {0b1000100, 0b100110}, {0x1F0, 0x0F2}, {0b100, 0}, {0x48, 0x1FF}};
  for (const Rule& r : rules) {
    std::printf("ruleStr %u %u %s\n", r.born, r.survive, ruleStr(r).c_str());
    for (uint32_t seed : {7u, 99u}) {
      Rng g(seed);
      const double sp = growth(r, g, 0.3);
      const double after = g();
      std::printf("growth %u %u %u %s %s\n", r.born, r.survive, seed, bits(sp), bits(after));
      Rng s(seed);
      const ScreenResult st = screen(r, s);
      const double after2 = s();
      std::printf("screen %u %u %u %s %s %d %s\n", r.born, r.survive, seed, bits(st.density), bits(st.activity), st.ok ? 1 : 0, bits(after2));
    }
  }
  uint32_t hp = 2166136261u;
  for (int k = 0; k <= 65536; k++) hp = fnvD(hp, std::pow(double(k), 1.5));
  std::printf("pow15 0..65536 %u\n", hp);
  uint32_t hl = 2166136261u;
  Rng g(2026);
  for (int k = 0; k < 400000; k++) {
    const double denom = 512 + std::floor(g() * 1e7) + g();
    const double t = std::floor(g() * denom);
    hl = fnvF(hl, float(-std::log2((t + 1) / denom)));
  }
  std::printf("log2f32 400000 %u\n", hl);
  return 0;
}
