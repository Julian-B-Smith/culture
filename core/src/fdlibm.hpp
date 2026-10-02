// fdlibm sin/cos, as used by V8's Math.sin/Math.cos (src/base/ieee754.cc,
// itself adapted from fdlibm 5.3: http://www.netlib.org/fdlibm).
//
// Why vendored (D-027): the reference's per-tier stereo stats are built from
// cos/sin tables, and the platform libm differs from V8 by 1 ulp in 10-20% of
// table entries (macOS, measured 2026-10-02). fdlibm is not correctly
// rounded, so the only way to match V8 is to run the same algorithm.
//
// The FMA flavor. V8 on Apple Silicon is built by clang with the default
// -ffp-contract=on, which fuses every `a*b + c` / `a*b - c` / `c - a*b`
// within one expression into a fused multiply-add. x86-64 builds (baseline,
// no FMA) do not. The two flavors differ in ~0.6% of results, so "V8's cos"
// is not one function. We reproduce the Apple Silicon flavor, with every
// contraction clang makes written out as std::fma, so this file gives the
// SAME bits on every platform and compiler while -ffp-contract=off is in
// force (CMakeLists.txt). Verified: 0 differences from node 24.10 / V8 13.6
// on arm64 over 2.24M arguments (2026-10-02; tests/vectors.* keep checking).
// Contraction rule mirrored (clang CodeGen tryEmitFMulAdd): in `L op R`, if L
// is a product a*b -> fma(a, b, ±R); else if R is a product a*b ->
// fma(±a, b, L). Products held in named variables are never fused.
//
// Domain: |x| <= 2^19 * pi/2 (fdlibm's "medium" argument reduction). The
// huge-argument path (__kernel_rem_pio2) is deliberately not ported; the only
// caller passes angles in [0, 2*pi). Outside the domain these return NaN
// rather than a silently different value.
//
// Original notice: Copyright (C) 1993 by Sun Microsystems, Inc. All rights
// reserved. Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.
#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>

namespace culture::fdlibm {

inline int32_t highWord(double x) {
  uint64_t u;
  std::memcpy(&u, &x, 8);
  return int32_t(u >> 32);
}
inline double fromWords(uint32_t hi, uint32_t lo) {
  const uint64_t u = uint64_t(hi) << 32 | lo;
  double x;
  std::memcpy(&x, &u, 8);
  return x;
}

inline double kernelSin(double x, double y, int iy) {
  constexpr double S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03,
                   S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06,
                   S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
  const int32_t ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && int(x) == 0) return x;  // |x| < 2^-27
  const double z = x * x, v = z * x;
  // S2 + z*(S3 + z*(S4 + z*(S5 + z*S6)))
  const double r = std::fma(z, std::fma(z, std::fma(z, std::fma(z, S6, S5), S4), S3), S2);
  if (iy == 0) return std::fma(v, std::fma(z, r, S1), x);  // x + v*(S1 + z*r)
  // x - ((z*(0.5*y - v*r) - y) - v*S1)
  return x - std::fma(-v, S1, std::fma(z, std::fma(0.5, y, -(v * r)), -y));
}

inline double kernelCos(double x, double y) {
  constexpr double C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03,
                   C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07,
                   C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
  const int32_t ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && int(x) == 0) return 1.0;  // |x| < 2^-27
  const double z = x * x;
  // z*(C1 + z*(C2 + z*(C3 + z*(C4 + z*(C5 + z*C6)))))
  const double r = z * std::fma(z, std::fma(z, std::fma(z, std::fma(z, std::fma(z, C6, C5), C4), C3), C2), C1);
  const double zrxy = std::fma(z, r, -(x * y));  // z*r - x*y
  if (ix < 0x3FD33333) return 1.0 - std::fma(0.5, z, -zrxy);  // |x| < 0.3: 1 - (0.5*z - (z*r - x*y))
  const double qx = ix > 0x3fe90000 ? 0.28125 : fromWords(uint32_t(ix - 0x00200000), 0);  // x/4
  const double hz = std::fma(0.5, z, -qx), a = 1.0 - qx;  // hz = 0.5*z - qx
  return a - (hz - zrxy);
}

// Returns n with x - n*pi/2 = y[0] + y[1]; n < 0 signals out of domain only
// via the caller's check (we never reach the huge-argument path).
inline int remPio2(double x, double* y) {
  constexpr double invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00,
                   pio2_1t = 6.07710050650619224932e-11, pio2_2 = 6.07710050630396597660e-11,
                   pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21,
                   pio2_3t = 8.47842766036889956997e-32;
  static constexpr int32_t npio2_hw[32] = {
      0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
      0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB,
      0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
      0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB};
  const int32_t hx = highWord(x), ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0; return 0; }  // |x| <= pi/4
  if (ix < 0x4002d97c) {                                    // |x| < 3pi/4: special-cased for speed
    if (hx > 0) {
      double z = x - pio2_1;
      if (ix != 0x3ff921fb) { y[0] = z - pio2_1t; y[1] = (z - y[0]) - pio2_1t; }
      else { z -= pio2_2; y[0] = z - pio2_2t; y[1] = (z - y[0]) - pio2_2t; }  // near pi/2: 33+53 bits
      return 1;
    }
    double z = x + pio2_1;
    if (ix != 0x3ff921fb) { y[0] = z + pio2_1t; y[1] = (z - y[0]) + pio2_1t; }
    else { z += pio2_2; y[0] = z + pio2_2t; y[1] = (z - y[0]) + pio2_2t; }
    return -1;
  }
  // Medium |x| <= 2^19 * pi/2. Caller guarantees this bound.
  const double t0 = x < 0 ? -x : x;
  const int n = int32_t(std::fma(t0, invpio2, 0.5));  // t*invpio2 + 0.5
  const double fn = double(n);
  double r = std::fma(-fn, pio2_1, t0);  // t - fn*pio2_1
  double w = fn * pio2_1t;  // 1st round, good to 85 bits
  if (n < 32 && ix != npio2_hw[n - 1]) {
    y[0] = r - w;  // quick check: no cancellation
  } else {
    const int32_t j = ix >> 20;
    y[0] = r - w;
    int32_t i = j - ((highWord(y[0]) >> 20) & 0x7ff);
    if (i > 16) {  // 2nd iteration, good to 118 bits
      double t = r;
      w = fn * pio2_2;
      r = t - w;
      w = std::fma(fn, pio2_2t, -((t - r) - w));  // fn*pio2_2t - ((t-r)-w)
      y[0] = r - w;
      i = j - ((highWord(y[0]) >> 20) & 0x7ff);
      if (i > 49) {  // 3rd iteration, 151 bits
        t = r;
        w = fn * pio2_3;
        r = t - w;
        w = std::fma(fn, pio2_3t, -((t - r) - w));
        y[0] = r - w;
      }
    }
  }
  y[1] = (r - y[0]) - w;
  if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
  return n;
}

inline bool inDomain(double x) { return (highWord(x) & 0x7fffffff) <= 0x413921fb; }

inline double cos(double x) {
  const int32_t ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0.0);
  if (!inDomain(x)) return std::numeric_limits<double>::quiet_NaN();
  double y[2];
  switch (remPio2(x, y) & 3) {
    case 0: return kernelCos(y[0], y[1]);
    case 1: return -kernelSin(y[0], y[1], 1);
    case 2: return -kernelCos(y[0], y[1]);
    default: return kernelSin(y[0], y[1], 1);
  }
}

inline double sin(double x) {
  const int32_t ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0.0, 0);
  if (!inDomain(x)) return std::numeric_limits<double>::quiet_NaN();
  double y[2];
  switch (remPio2(x, y) & 3) {
    case 0: return kernelSin(y[0], y[1], 1);
    case 1: return kernelCos(y[0], y[1]);
    case 2: return -kernelSin(y[0], y[1], 1);
    default: return -kernelCos(y[0], y[1]);
  }
}

}  // namespace culture::fdlibm
