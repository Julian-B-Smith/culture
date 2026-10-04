// Ambient sonification. Each ruleset is a voice whose spectrum is its rule; contests beat,
// hardened borders ring, emergence is foreshadowed by a riser, and quiet thins the drone.
const Sonic = (() => {
  // Just intervals a new tier can step by from its parent. Mutants stay within a few cents.
  const STEPS = [3 / 2, 4 / 3, 5 / 4, 6 / 5, 5 / 3, 7 / 4, 7 / 6, 8 / 7, 9 / 8, 11 / 8, 9 / 7, 13 / 8];
  const BASE = 65.41; // C2
  // Color families shape the spectrum: rolloff exponent (lower = brighter) and filter resonance.
  const FAMILY = [
    { tilt: 1.3, q: 0.4 },  // ash
    { tilt: 0.55, q: 1.6 }, // ember
    { tilt: 0.8, q: 2.4 },  // gold
    { tilt: 1.1, q: 0.8 },  // moss
    { tilt: 1.5, q: 3.2 },  // tide
    { tilt: 0.9, q: 5.0 },  // violet
  ];
  const fold = r => { while (r >= 4) r /= 2; while (r < 1) r *= 2; return r; };

  class Engine {
    constructor() {
      this.ctx = null; this.voices = new Map(); this.ratios = new Map(); this.volume = 0.7;
      // Phones share fewer, slower cores between the simulation and the audio thread, and an
      // audio thread that misses its deadline clicks. On touch devices the engine runs lighter:
      // fewer voices, a shorter reverb, and slower parameter updates.
      let touch = false;
      try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) {}
      this.light = touch;
      this.maxVoices = touch ? 6 : 10;
      this.updateEvery = touch ? 0.1 : 0.066;
    }

    start() {
      if (this.ctx) { this.ctx.resume(); return; }
      // 'playback' asks for larger audio buffers: more latency, which an ambient piece doesn't need,
      // in exchange for far fewer dropouts when the device is busy.
      const AC = window.AudioContext || window.webkitAudioContext;
      let ctx;
      try { ctx = new AC({ latencyHint: 'playback' }); } catch (e) { ctx = new AC(); }
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.knee.value = 12;
      this.bus = ctx.createGain(); this.bus.gain.value = 1;       // drone level, thinned by quiet
      this.dry = ctx.createGain(); this.dry.gain.value = 0.55;
      this.wet = ctx.createGain(); this.wet.gain.value = 0.7;
      this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(this.light ? 3.5 : 6.5);
      this.bus.connect(this.dry); this.bus.connect(this.verb); this.verb.connect(this.wet);
      // Distant voices (high in the box) also feed the room directly, so they sit further back.
      this.farBus = ctx.createGain(); this.farBus.gain.value = 1; this.farBus.connect(this.verb);
      this.dry.connect(comp); this.wet.connect(comp);
      this.buildTape(comp);
      this.master.connect(ctx.destination);
      // Tension riser: filtered noise that rises as surprise nears the threshold.
      const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuffer(4); noise.loop = true;
      this.riseFilter = ctx.createBiquadFilter(); this.riseFilter.type = 'bandpass'; this.riseFilter.Q.value = 6; this.riseFilter.frequency.value = 300;
      this.riseGain = ctx.createGain(); this.riseGain.gain.value = 0;
      noise.connect(this.riseFilter); this.riseFilter.connect(this.riseGain); this.riseGain.connect(this.bus);
      noise.start();
    }
    // VCR tape path, crossfaded in when the CRT view is on. Linear-track VHS audio: band-limited
    // (rolled off below ~60 Hz and above ~9 kHz) with a low head bump, soft tape saturation, wow and
    // flutter from a pitch-modulating delay, slightly narrowed stereo, a bed of hiss and faint mains
    // hum, and occasional dropouts that the picture shares.
    buildTape(src) {
      const ctx = this.ctx;
      this.tapeDry = ctx.createGain(); this.tapeDry.gain.value = this.tapeOn ? 0 : 1;
      this.tapeWet = ctx.createGain(); this.tapeWet.gain.value = this.tapeOn ? 1 : 0;
      src.connect(this.tapeDry); this.tapeDry.connect(this.master);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55; hp.Q.value = 0.6;
      const bump = ctx.createBiquadFilter(); bump.type = 'peaking'; bump.frequency.value = 95; bump.Q.value = 1.1; bump.gain.value = 2.5;
      const sat = ctx.createWaveShaper(); sat.oversample = '2x';
      const curve = new Float32Array(1024), drive = 1.8;
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * drive) / Math.tanh(drive); }
      sat.curve = curve;
      // Wow (slow pitch sag), flutter (fast shimmer) and a slower drift, all moving one short delay.
      const delay = ctx.createDelay(0.05); delay.delayTime.value = 0.008;
      for (const [f, depth] of [[0.55, 0.0011], [7.3, 0.00009], [0.13, 0.0007]]) {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = depth;
        o.connect(g); g.connect(delay.delayTime); o.start();
      }
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.55;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 11000; lp2.Q.value = 0.5;
      // Narrow the stereo image: blend each side with a little of the other.
      const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
      const ll = ctx.createGain(), rr = ctx.createGain(), lr = ctx.createGain(), rl = ctx.createGain();
      ll.gain.value = rr.gain.value = 0.82; lr.gain.value = rl.gain.value = 0.18;
      this.dropGain = ctx.createGain(); this.dropGain.gain.value = 1;
      src.connect(hp); hp.connect(bump); bump.connect(sat); sat.connect(delay); delay.connect(lp); lp.connect(lp2); lp2.connect(split);
      split.connect(ll, 0); split.connect(lr, 0); split.connect(rr, 1); split.connect(rl, 1);
      ll.connect(merge, 0, 0); rl.connect(merge, 0, 0); rr.connect(merge, 0, 1); lr.connect(merge, 0, 1);
      merge.connect(this.dropGain); this.dropGain.connect(this.tapeWet); this.tapeWet.connect(this.master);
      // Hiss: noise shaped toward the upper mids; hum: 60 Hz and its third harmonic, barely there.
      const hiss = ctx.createBufferSource(); hiss.buffer = this.noiseBuffer(3); hiss.loop = true;
      const hh = ctx.createBiquadFilter(); hh.type = 'highpass'; hh.frequency.value = 1800;
      const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 8500;
      const hg = ctx.createGain(); hg.gain.value = 0.0045;
      hiss.connect(hh); hh.connect(hl); hl.connect(hg); hg.connect(this.dropGain); hiss.start();
      for (const [f, a] of [[60, 0.0012], [180, 0.0005]]) {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(this.tapeWet); o.start();
      }
    }
    setTape(on) {
      this.tapeOn = on;
      if (!this.ctx || !this.tapeWet) return;
      const now = this.ctx.currentTime;
      this.tapeWet.gain.setTargetAtTime(on ? 1 : 0, now, 0.15);
      this.tapeDry.gain.setTargetAtTime(on ? 0 : 1, now, 0.15);
    }
    // A brief loss of signal from the tape: a fast dip and a slightly slower recovery.
    dropout(seconds) {
      if (!this.ctx || !this.dropGain || !this.tapeOn) return;
      const g = this.dropGain.gain, now = this.ctx.currentTime;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else g.cancelScheduledValues(now);
      g.setTargetAtTime(0.12, now, 0.006);
      g.setTargetAtTime(1, now + seconds, 0.03);
    }
    stop() { if (this.ctx) this.ctx.suspend(); }
    get running() { return this.ctx && this.ctx.state === 'running'; }
    // A copy of the final mix for the recorder; null until sound has been switched on.
    recordStream() {
      if (!this.ctx || !this.ctx.createMediaStreamDestination) return null;
      if (!this.recDest) { this.recDest = this.ctx.createMediaStreamDestination(); this.master.connect(this.recDest); }
      return this.recDest.stream;
    }
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

    impulse(seconds) {
      const ctx = this.ctx, len = Math.floor(seconds * ctx.sampleRate), buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (t < 0.01 ? t / 0.01 : 1); }
      }
      return buf;
    }
    noiseBuffer(seconds) {
      const ctx = this.ctx, len = Math.floor(seconds * ctx.sampleRate), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    // Pitch: a walk through just intonation. Each tier steps from the tier it came from by an
    // interval chosen from its own hash, so the tuning never returns to where it was.
    ratioOf(T, world) {
      if (this.ratios.has(T)) return this.ratios.get(T);
      let r = 1;
      const h = T.hash >>> 0;
      const byIdx = i => world.tiers[i] || world.extinct.find(x => x.idx === i);
      if (T.idx === 0) r = 1;
      else if (T.mutatedFrom != null) {
        const P = byIdx(T.mutatedFrom); const pr = P ? this.ratioOf(P, world) : 1;
        r = pr * Math.pow(2, ((h % 31) - 15 + (h % 2 ? 9 : -9)) / 1200); // a few cents away from the parent
      } else if (T.parents) {
        const [a, b] = T.parents.map(byIdx);
        r = fold((a ? this.ratioOf(a, world) : 1) * (b ? this.ratioOf(b, world) : 1));
      } else {
        const P = byIdx(T.from ?? T.idx - 1);
        r = fold((P ? this.ratioOf(P, world) : 1) * STEPS[h % STEPS.length]);
      }
      this.ratios.set(T, r);
      return r;
    }

    // The rule becomes the spectrum. Survival on n neighbors sounds harmonic n+1;
    // birth on n neighbors sounds a quieter upper band at harmonic n+10.
    wave(T) {
      const N = 20, re = new Float32Array(N), im = new Float32Array(N), tilt = FAMILY[T.el].tilt;
      im[1] = 0.6;
      for (let c = 0; c <= 8; c++) if ((T.rule.survive >> c) & 1) im[c + 1] += 1 / Math.pow(c + 1, tilt);
      for (let c = 1; c <= 8; c++) if ((T.rule.born >> c) & 1) im[Math.min(N - 1, c + 10)] += 0.35 / Math.pow(c + 10, tilt * 0.6);
      return this.ctx.createPeriodicWave(re, im);
    }

    voice(T, world, kind) {
      const ctx = this.ctx, now = ctx.currentTime, f = BASE * this.ratioOf(T, world);
      const wave = this.wave(T);
      const a = ctx.createOscillator(), b = ctx.createOscillator();
      a.setPeriodicWave(wave); b.setPeriodicWave(wave);
      // Two oscillators, each with its own filter and panner, so a tier spread across the box sounds wide
      // and a tight colony sounds like a point.
      const chain = osc => {
        const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = FAMILY[T.el].q; filt.frequency.value = f * 3;
        const amp = ctx.createGain(); amp.gain.value = 0;
        const pan = ctx.createStereoPanner();
        osc.connect(filt); filt.connect(amp); amp.connect(pan);
        return { filt, amp, pan };
      };
      const A = chain(a), B = chain(b);
      // Comb resonance tuned to the voice: hardened border ground makes it ring.
      const comb = ctx.createDelay(1), fb = ctx.createGain(), combOut = ctx.createGain();
      comb.delayTime.value = 1 / f; fb.gain.value = 0.2; combOut.gain.value = 0.35;
      A.amp.connect(comb); B.amp.connect(comb); comb.connect(fb); fb.connect(comb); comb.connect(combOut);
      const out = ctx.createGain(); A.pan.connect(out); B.pan.connect(out);
      const combPan = ctx.createStereoPanner(); combOut.connect(combPan); combPan.connect(out);
      const near = ctx.createGain(), far = ctx.createGain(); near.gain.value = 0.8; far.gain.value = 0.3;
      out.connect(near); near.connect(this.bus); out.connect(far); far.connect(this.farBus);
      // A newborn starts where it was born in the box.
      if (T.origin) {
        const px = Math.max(-1, Math.min(1, (T.origin[0] / world.W) * 2 - 1));
        A.pan.pan.value = px; B.pan.pan.value = px; combPan.pan.value = px;
      }
      // Gestures: a mutant glides out of its parent's pitch; a spark glides out of its parents' mean.
      let startF = f;
      if (kind === 'mutant' && T.mutatedFrom != null) {
        const P = world.tiers[T.mutatedFrom]; if (P) startF = BASE * this.ratioOf(P, world);
      } else if (kind === 'spark' && T.parents) {
        const [p1, p2] = T.parents.map(i => world.tiers[i]);
        if (p1 && p2) startF = BASE * Math.sqrt(this.ratioOf(p1, world) * this.ratioOf(p2, world));
      }
      for (const o of [a, b]) { o.frequency.setValueAtTime(startF, now); o.frequency.setTargetAtTime(f, now + 0.2, kind === 'mutant' ? 1.4 : 0.9); }
      a.start(); b.start();
      const v = { T, f, a, b, A, B, comb, fb, combOut, combPan, near, far, bloom: kind ? 1 : 0, bloomAt: now, dying: false };
      this.voices.set(T, v);
      return v;
    }

    retire(v, seconds) {
      const now = this.ctx.currentTime;
      // Hold the current level before fading. cancelScheduledValues alone can snap a gain back to
      // an older value, which clicks.
      for (const c of [v.A, v.B]) {
        const g = c.amp.gain;
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
        g.setTargetAtTime(0, now, seconds / 7);
      }
      v.fb.gain.setTargetAtTime(0, now + seconds * 0.5, seconds / 7);
      const end = now + seconds * 1.2;
      v.a.stop(end); v.b.stop(end);
      setTimeout(() => { try { v.near.disconnect(); v.far.disconnect(); } catch (e) {} }, (seconds * 1.2 + 1) * 1000);
      this.voices.delete(v.T);
    }

    event(ev, world, params) {
      if (!this.ctx) return;
      if (ev.tier !== undefined) {
        const T = world.tiers[ev.tier];
        if (T && !this.voices.has(T)) this.voice(T, world, T.mutatedFrom != null ? 'mutant' : T.parents ? 'spark' : 'birth');
      }
      if (ev.dying !== undefined) {
        // Retreat: the voice sinks an octave and fades as the ground is given back.
        const v = this.voices.get(world.tiers[ev.dying]);
        if (v) {
          v.dying = true;
          const now = this.ctx.currentTime, dur = Math.max(3, world.retreat ? world.retreat.dur / (60 * Math.max(0.25, params.speed)) : 6);
          for (const o of [v.a, v.b]) o.frequency.setTargetAtTime(v.f / 2, now, dur / 3);
        }
      }
    }

    reset() {
      if (!this.ctx) { this.voices.clear(); this.ratios.clear(); return; }
      for (const v of [...this.voices.values()]) this.retire(v, 1.5);
      this.ratios.clear();
    }

    // Called once per animation frame with the world's latest statistics.
    update(world, params) {
      if (!this.running || !world.stats) return;
      const ctx = this.ctx, now = ctx.currentTime, n = world.W * world.H, S = world.stats;
      // Parameters change about 15 times a second; per-frame automation overloads the audio thread.
      if (now - (this.lastUpdate || 0) < this.updateEvery) return;
      this.lastUpdate = now;
      // Only tiers that hold ground get a voice, up to MAX of the largest. Others fade out and
      // return when they regain territory.
      const MAX = this.maxVoices, minCells = n * 0.002;
      const wanted = world.tiers.filter(T => T.cells >= minCells || T.dying).sort((a, b) => b.cells - a.cells).slice(0, MAX);
      const want = new Set(wanted);
      for (const v of [...this.voices.values()]) {
        if (want.has(v.T)) { v.quietSince = null; continue; }
        const gone = !world.tiers.includes(v.T);
        v.quietSince ??= now;
        if (gone || now - v.quietSince > 1.5) this.retire(v, v.dying ? 3 : 2);
      }
      for (const T of wanted) if (!this.voices.has(T)) this.voice(T, world, null);
      for (const v of this.voices.values()) {
        const T = v.T, i = T.idx;
        if (i >= S.live.length) continue;
        const cover = T.cells / n, live = S.live[i], dens = T.cells ? live / T.cells : 0;
        const motion = live ? S.move[i] / Math.max(1, T.cells) : 0;
        const contest = S.contest[i] / Math.max(1, T.cells);
        const wall = T.cells ? S.wall[i] / T.cells : 0;
        const fed = live ? S.fed[i] / Math.max(1, T.cells) : 0;
        // Loudness follows territory, sustained by how alive that territory is.
        const bloom = v.bloom * Math.exp(-(now - v.bloomAt) / 4);
        let g = (Math.sqrt(cover) * 0.16 + bloom * 0.06) * (0.35 + Math.min(1, dens * 4) * 0.65);
        if (v.dying) g *= 0.6;
        v.A.amp.gain.setTargetAtTime(g, now, 0.6); v.B.amp.gain.setTargetAtTime(g, now, 0.6);
        // Brightness follows motion and feeding; births open bright and settle.
        const cutoff = v.f * (1.5 + Math.min(1, motion * 25) * 10 + Math.min(1, fed * 6) * 6 + bloom * 12);
        // Distance darkens a little: high in the box is far away.
        const depth = v.depth ?? 0.5;
        const dark = 1 - 0.35 * (1 - depth);
        for (const c of [v.A, v.B]) c.filt.frequency.setTargetAtTime(Math.min(16000, cutoff * dark), now, 0.4);
        // Contested borders beat: the two oscillators pull apart with pressure.
        const cents = 2 + Math.min(1, contest * 4) * 28;
        v.a.detune.setTargetAtTime(cents / 2, now, 0.5); v.b.detune.setTargetAtTime(-cents / 2, now, 0.5);
        // Hardened ground rings through the comb.
        v.fb.gain.setTargetAtTime(Math.min(0.88, 0.15 + Math.min(1, wall / Math.max(0.5, params.hardness)) * 0.75), now, 0.8);
        // Stereo position follows where the tier's living cells sit on the torus.
        // Space: left-right in the box is left-right in the stereo field, and top-to-bottom is far-to-near.
        // On the torus the center of a colony is a circular mean; how concentrated it is sets the width.
        if (live) {
          const Rx = Math.hypot(S.cos[i], S.sin[i]) / live, thx = Math.atan2(S.sin[i], S.cos[i]);
          const Ry = Math.hypot(S.cosY[i], S.sinY[i]) / live, thy = Math.atan2(S.sinY[i], S.cosY[i]);
          const fx = ((thx / (2 * Math.PI)) + 1) % 1, fy = ((thy / (2 * Math.PI)) + 1) % 1;
          // When the box is turned 90° for a portrait screen, the mapping follows the screen:
          // screen left-right is world bottom-to-top, screen top-to-bottom is world left-to-right.
          const [px, pR, dy, dR] = this.rotated ? [1 - fy, Ry, fx, Rx] : [fx, Rx, fy, Ry];
          const focus = Math.min(1, pR * 2.2), pos = (px * 2 - 1) * focus;
          const width = 0.06 + 0.9 * (1 - focus);
          const clamp = q => Math.max(-1, Math.min(1, q));
          v.A.pan.pan.setTargetAtTime(clamp(pos - width), now, 0.6);
          v.B.pan.pan.setTargetAtTime(clamp(pos + width), now, 0.6);
          v.combPan.pan.setTargetAtTime(clamp(pos), now, 0.6);
          const dFocus = Math.min(1, dR * 2.2);
          v.depth = 0.5 + (dy - 0.5) * dFocus; // 0 = top of the screen (far), 1 = bottom (near)
          v.near.gain.setTargetAtTime(0.35 + 0.65 * v.depth, now, 0.8);
          v.far.gain.setTargetAtTime(0.15 + 0.6 * (1 - v.depth), now, 0.8);
        }
      }
      // Tension: the riser climbs as frontier surprise approaches the emergence threshold.
      const thr = world.record * (1 + params.margin);
      const ready = world.frontierAge > (world.warm ?? params.warmup) && !world.retreat && thr > 0;
      const r = ready ? world.lastMax / thr : world.search ? 1 : 0;
      const t = Math.max(0, Math.min(1, (r - 0.55) / 0.45));
      this.riseGain.gain.setTargetAtTime(0.05 * t * t, now, 0.5);
      this.riseFilter.frequency.setTargetAtTime(250 + 3800 * t * t, now, 0.5);
      // Quiet: past the typical epoch the drone thins and the room grows.
      const over = Math.max(0, Math.min(1, (world.gen - world.lastBirth) / world.meanEpoch - 1));
      this.bus.gain.setTargetAtTime(1 - 0.45 * over, now, 2);
      this.farBus.gain.setTargetAtTime(1 - 0.3 * over, now, 2);
      this.wet.gain.setTargetAtTime(0.7 + 0.5 * over, now, 2);
    }
  }
  return { Engine };
})();
