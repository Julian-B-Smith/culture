// Timbres: each ruleset gets a sound class from how it looks, and the classes share one musical
// field so arpeggios and resonances from different tiers agree with each other.
//
// Classes
//   drone    the original voice: the rule's spectrum as a sustained tone, beating where its
//            borders are contested (rules in the middle ground; Tier 0 always)
//   breath   resonant noise: noise through a bank of narrow filters tuned to the rule's harmonics
//            (churning, asymmetric rules)
//   rumble   a low, moving mass: sub tone plus filtered noise swelling with activity
//            (dense, clustered, slow rules)
//   arp      textural arpeggiation: short notes stepping through the rule's chord on a shared clock
//            (sparse, moderately active rules)
//   crystal  sparse bell tones with glassy inharmonic partials, high and slow
//            (symmetric, still, geometric rules)
// Color shifts every class: warm families (ember, gold) are darker, rounder and saturated; cold
// families (tide, violet) are brighter, purer and glassier; moss is irregular and breathy; ash is dusty.
const Timbre = (() => {
  const CLASSES = ['drone', 'breath', 'rumble', 'arp', 'crystal'];
  let DRONE_BASE = 1.0;
  const tune = b => { DRONE_BASE = b; }; // for calibration

  // Scores each class from the rule's fingerprint and color; the highest wins. Deterministic.
  function classify(T, fp, col) {
    if (T.idx === 0) return 'drone';
    const warm = Math.max(0, col.temp), cold = Math.max(0, -col.temp);
    const s = {
      // The drone takes the middle ground: rules that are not strongly churning, massive, sparse
      // and lively, or geometric. Distance from the middle is measured in each feature's typical
      // spread across viable rules, so no one feature dominates.
      drone: DRONE_BASE - 0.35 * (Math.abs(fp.density - 0.2) / 0.17 + Math.abs(fp.activity - 0.19) / 0.34
        + Math.abs(fp.cluster - 0.36) / 0.2 + Math.abs(fp.symmetry - 0.33) / 0.22) / 4,
      breath: fp.activity * 1.5 - fp.symmetry * 0.8 + (1 - fp.still) * 0.4 + col.dust * 0.25 + col.organic * 0.2,
      rumble: fp.density * 1.3 + fp.cluster * 1.0 + fp.still * 0.3 - fp.activity * 0.6 + warm * 0.25 - 0.28,
      arp: (1 - Math.abs(fp.activity - 0.3) * 2.2) * 0.8 + (1 - fp.density) * 0.4 + fp.symmetry * 0.2 - 0.12,
      crystal: fp.symmetry * 1.5 + fp.still * 0.7 - fp.density * 1.0 - fp.activity * 0.8 + cold * 0.3 - 0.35,
    };
    let best = 'drone';
    for (const k of CLASSES) if (s[k] > s[best]) best = k;
    return best;
  }

  // The chord a voice arpeggiates: harmonics of its own root chosen by its rule. Survival on n
  // neighbors contributes harmonic n+1, birth on n contributes harmonic n+2. Temperature trims the
  // set: warm voices avoid the sharper harmonics (7, 11, 13); cold voices drop the sweet thirds (5, 10) for open fifths (3, 6).
  function chord(T, col) {
    const h = new Set([1, 2]);
    for (let c = 0; c <= 8; c++) if ((T.rule.survive >> c) & 1) h.add(c + 1);
    for (let c = 1; c <= 8; c++) if ((T.rule.born >> c) & 1) h.add(c + 2);
    let list = [...h];
    if (col.temp > 0.4) list = list.filter(n => ![7, 11, 13].includes(n));
    if (col.temp < -0.4) list = list.filter(n => n !== 5 && n !== 10).concat([3, 6]);
    // Fold into three octaves above the root and sort.
    const set = [...new Set(list.map(n => { let r = n; while (r >= 8) r /= 2; return +r.toFixed(6); }))].sort((a, b) => a - b);
    return set.length > 1 ? set : [1, 1.5, 2, 3];
  }

  // Is the ratio a/b close to a simple whole-number ratio? Measured by the smallest n·d among
  // fractions within 6 cents; simple ratios (octaves, fifths, thirds, septimal sevenths) pass and
  // steps like 9/8 or 16/15 do not.
  function simple(a, b, limit = 40) {
    let r = a > b ? a / b : b / a;
    while (r >= 2) r /= 2;
    for (let d = 1; d <= 12; d++) {
      const n = Math.round(r * d);
      if (Math.abs(1200 * Math.log2(r / (n / d))) < 6 && n * d <= limit) return true;
    }
    return false;
  }

  // The shared musical field: a pulse every arp follows, a budget on how many notes may start per
  // second across all voices, and a memory of recent notes to keep new ones consonant with them.
  class Field {
    constructor(light) {
      this.bpm = 84; this.t0 = null;
      this.rate = light ? 7 : 14;          // notes per second, all voices together
      this.tokens = this.rate; this.last = 0;
      this.recent = [];                    // { f, end }
    }
    // Tempo drifts slowly with how much the world is moving: 66 to 108 beats a minute.
    tick(now, motion) {
      if (this.t0 === null) this.t0 = now;
      const target = 66 + 42 * Math.min(1, motion);
      // Change tempo only by re-anchoring the beat grid, so the pulse never jumps.
      const nb = this.bpm + (target - this.bpm) * 0.02;
      if (Math.abs(nb - this.bpm) > 1e-3) {
        const beat = this.beatAt(now); this.bpm = nb; this.t0 = now - beat * 60 / this.bpm;
      }
      this.tokens = Math.min(this.rate, this.tokens + (now - this.last) * this.rate);
      this.last = now;
      this.recent = this.recent.filter(r => r.end > now);
    }
    beatAt(t) { return (t - this.t0) * this.bpm / 60; }
    timeOf(beat) { return this.t0 + beat * 60 / this.bpm; }
    // Asks for a note. Louder voices are likelier to get one when the budget runs short.
    grant(priority) {
      if (this.tokens >= 1 && (this.tokens > this.rate * 0.4 || Math.random() < priority)) { this.tokens -= 1; return true; }
      return false;
    }
    // Picks the candidate frequency that sits best with what is already sounding.
    choose(cands, start) {
      for (const f of cands) {
        const clash = this.recent.some(r => r.start <= start + 0.05 && r.end > start && !simple(f, r.f));
        if (!clash) return f;
      }
      return null;
    }
    note(f, start, dur) { this.recent.push({ f, start, end: start + dur }); if (this.recent.length > 64) this.recent.shift(); }
  }

  return { CLASSES, classify, chord, simple, Field, tune };
})();
if (typeof module !== 'undefined') module.exports = Timbre;
