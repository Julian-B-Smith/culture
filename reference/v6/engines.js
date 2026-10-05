// Sound engines for the timbre classes (see timbre.js). Every engine has the same shape:
//   const e = Engines[kind](ctx, { f, T, col, fp, noise, light })
//   e.out                      a GainNode to connect into the spatial chain
//   e.update(d, g, now)        live descriptors d (texture.js), target level g
//   e.schedule(field, now, horizon, priority)   note-based engines queue notes ahead of time
//   e.stop(when)               stop everything at `when`
// f is the voice's root frequency (the just-intonation walk), col its color temperature entry and
// fp its rule fingerprint.
const Engines = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Places a frequency inside [lo, hi) by octaves.
  const octaveInto = (f, lo, hi) => { while (f < lo) f *= 2; while (f >= hi) f /= 2; return f; };
  const set = (param, v, now, tc) => param.setTargetAtTime(v, now, tc);

  function noiseSource(ctx, buf, when) {
    const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
    n.start(when ?? ctx.currentTime, Math.random() * buf.duration);
    return n;
  }

  // Resonant noise. Noise through a bank of narrow band-pass filters on the rule's chord; each band
  // flickers with the tier's activity. Cold colors ring narrow and glassy, warm ones wider and
  // lower, moss wanders like breath through a mouth.
  function breath(ctx, o) {
    const { f, col, fp } = o;
    const out = ctx.createGain(); out.gain.value = 0;
    const src = noiseSource(ctx, o.noise);
    const chord = Timbre.chord(o.T, col);
    const q = col.temp < -0.3 ? 38 : col.temp > 0.3 ? 9 : 16;
    const root = octaveInto(f, col.temp > 0.3 ? 110 : 220, col.temp > 0.3 ? 220 : 440);
    const bands = chord.slice(0, o.light ? 3 : 5).map((h, k) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.value = root * h;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(out);
      return { bp, g, h, k, base: root * h };
    });
    // Narrow bands pass little energy; make up for it so all classes sit at similar loudness.
    const makeup = Math.sqrt(q) * 1.6;
    return {
      out,
      update(d, level, now) {
        const act = d ? d.activity : fp.activity;
        for (const b of bands) {
          // Each band gets its own flicker: activity sets how far it swings.
          const flick = 1 - act * 0.8 * Math.random();
          set(b.g.gain, makeup * flick / Math.pow(b.h, 0.6), now, 0.08 + 0.3 * (1 - act));
          if (col.organic > 0.5) set(b.bp.frequency, b.base * (1 + (Math.random() - 0.5) * 0.06), now, 0.4);
        }
        set(out.gain, level, now, 0.5);
      },
      schedule() {},
      stop(t) { src.stop(t); },
    };
  }

  // A low moving mass: a sub tone, its fifth, and low-passed noise, under a tremolo whose speed
  // follows how fast the tier churns. Warm colors are saturated and growly; cold ones hollow.
  function rumble(ctx, o) {
    const { f, col, fp } = o;
    const out = ctx.createGain(); out.gain.value = 0;
    const lowF = octaveInto(f, 46, 92);
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = lowF;
    const body = ctx.createOscillator(); body.type = col.temp < -0.3 ? 'square' : 'sawtooth'; body.frequency.value = lowF * 2;
    const fifth = ctx.createOscillator(); fifth.type = 'triangle'; fifth.frequency.value = lowF * 3;
    const subG = ctx.createGain(); subG.gain.value = 0.9;
    const bodyG = ctx.createGain(); bodyG.gain.value = 0.6;
    const fifthG = ctx.createGain(); fifthG.gain.value = 0.12;
    const src = noiseSource(ctx, o.noise);
    const nlp = ctx.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 320; nlp.Q.value = 0.7;
    const nG = ctx.createGain(); nG.gain.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = col.temp < -0.3 ? 4 : 1.2;
    const trem = ctx.createGain(); trem.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.4;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
    lfo.connect(lfoG); lfoG.connect(trem.gain);
    sub.connect(subG); body.connect(bodyG); fifth.connect(fifthG); src.connect(nlp); nlp.connect(nG);
    if (col.temp > 0.3) {
      const sat = ctx.createWaveShaper(), c = new Float32Array(512);
      for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; c[i] = Math.tanh(x * 2.5); }
      sat.curve = c; subG.connect(sat); bodyG.connect(sat); fifthG.connect(sat); nG.connect(sat); sat.connect(lp);
    } else { subG.connect(lp); bodyG.connect(lp); fifthG.connect(lp); nG.connect(lp); }
    // Growl: a resonant band in the low mids that carries the rumble on small speakers.
    const growl = ctx.createBiquadFilter(); growl.type = 'bandpass'; growl.frequency.value = lowF * 5; growl.Q.value = 3;
    const growlG = ctx.createGain(); growlG.gain.value = 1.2;
    lp.connect(trem); bodyG.connect(growl); nG.connect(growl); growl.connect(growlG); growlG.connect(trem); trem.connect(out);
    for (const s of [sub, body, fifth, lfo]) s.start();
    return {
      out,
      update(d, level, now) {
        const act = d ? d.activity : fp.activity, den = d ? d.density : fp.density;
        set(lfo.frequency, 0.25 + act * 5, now, 0.8);
        set(lfoG.gain, 0.15 + act * 0.5, now, 0.8);
        set(lp.frequency, 260 + act * 900 + den * 300, now, 0.6);
        set(growl.frequency, lowF * (4 + act * 4), now, 0.8);
        set(nG.gain, 0.25 + act * 1.2, now, 0.5);
        set(out.gain, level * 0.55, now, 0.6);
      },
      schedule() {},
      stop(t) { for (const s of [sub, body, fifth, lfo, src]) s.stop(t); },
    };
  }

  // A small echo shared by a note engine's notes: gives isolated notes a space to land in.
  function echo(ctx, out, time, fb, mix, tone) {
    const d = ctx.createDelay(1.5); d.delayTime.value = time;
    const g = ctx.createGain(); g.gain.value = fb;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tone;
    const w = ctx.createGain(); w.gain.value = mix;
    const input = ctx.createGain();
    input.connect(out); input.connect(d); d.connect(lp); lp.connect(g); g.connect(d); lp.connect(w); w.connect(out);
    return input;
  }

  // One envelope'd note: an attack to `peak`, then an exponential fall over `dur` seconds.
  function env(ctx, t, peak, attack, dur) {
    // Silent until the note starts: a gain node passes signal at 1 until its first event.
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    return g;
  }

  // Textural arpeggiation: short notes stepping through the rule's chord on the shared pulse.
  // Rhythm (notes per beat) comes from the rule's fingerprint, so it is part of the tier's identity;
  // how many steps actually sound follows the tier's live activity. Color sets the note itself:
  // cold is glass (a sine and its twelfth), warm is a soft filtered triangle, moss is a plucked
  // noise burst that lands a little loose in time, ash a dry sine with a dusty tick.
  function arp(ctx, o) {
    const { f, col, fp, T } = o;
    const out = ctx.createGain(); out.gain.value = 1;
    const bus = echo(ctx, out, 0.29, 0.32, 0.35, col.temp < -0.3 ? 5000 : 2200);
    const chord = Timbre.chord(T, col);
    const root = octaveInto(f, col.temp > 0.3 ? 130 : col.temp < -0.3 ? 262 : 196, col.temp > 0.3 ? 260 : col.temp < -0.3 ? 524 : 392);
    const notes = chord.map(h => root * h).filter(x => x < 2600);
    const sub = fp.activity > 0.45 ? 4 : fp.activity > 0.22 ? 3 : 2;
    const h = T.hash >>> 0, shape = h % 4; // 0 up, 1 down, 2 up-down, 3 wander
    let step = null, idx = 0, dir = 1, level = 0, act = fp.activity;
    const nextIndex = () => {
      const n = notes.length;
      if (shape === 0) idx = (idx + 1) % n;
      else if (shape === 1) idx = (idx + n - 1) % n;
      else if (shape === 2) { if (idx + dir < 0 || idx + dir >= n) dir = -dir; idx += dir; }
      else idx = clamp(idx + (Math.random() < 0.5 ? -1 : 1) * (1 + (Math.random() < 0.3)), 0, n - 1);
      return idx;
    };
    function play(fr, t, dur, peak) {
      if (col.organic > 0.5) {
        t += (Math.random() - 0.5) * 0.024;
        const src = noiseSource(ctx, o.noise, t), bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 28;
        const e = env(ctx, t, peak * 22, 0.002, dur * 0.8);
        src.connect(bp); bp.connect(e); e.connect(bus); src.stop(t + dur + 0.1);
        return;
      }
      const e = env(ctx, t, peak, col.temp > 0.3 ? 0.012 : 0.003, dur);
      const a = ctx.createOscillator(); a.frequency.value = fr;
      if (col.temp < -0.3) {
        a.type = 'sine';
        const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = fr * 3;
        const bg = ctx.createGain(); bg.gain.value = 0.22;
        b.connect(bg); bg.connect(e); b.start(t); b.stop(t + dur + 0.1);
      } else if (col.temp > 0.3) {
        a.type = 'triangle';
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fr * 3; lp.Q.value = 0.8;
        a.connect(lp); lp.connect(e); e.connect(bus); a.start(t); a.stop(t + dur + 0.1);
        return;
      } else {
        a.type = 'sine';
        if (col.dust > 0.5) {
          const src = noiseSource(ctx, o.noise, t), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
          const ce = env(ctx, t, peak * 0.6, 0.001, 0.03);
          src.connect(hp); hp.connect(ce); ce.connect(bus); src.stop(t + 0.1);
        }
      }
      a.connect(e); e.connect(bus); a.start(t); a.stop(t + dur + 0.1);
    }
    return {
      out,
      update(d, g, now) { level = g; if (d) act = d.activity; },
      schedule(field, now, horizon, priority) {
        if (level < 0.004 || !notes.length) { step = null; return; }
        const spb = 1 / sub;
        if (step === null || field.timeOf(step) < now) step = Math.ceil(field.beatAt(now + 0.02) / spb) * spb;
        while (field.timeOf(step) < now + horizon) {
          const t = field.timeOf(step);
          // Downbeats always try to sound; other steps sound with the tier's activity.
          const onBeat = Math.abs(step - Math.round(step)) < 1e-6;
          if (onBeat || Math.random() < 0.3 + act * 1.6) {
            const i = nextIndex();
            const cands = [notes[i], ...notes.filter((_, k) => k !== i)];
            const fr = field.choose(cands, t);
            if (fr && field.grant(priority)) {
              const dur = 0.09 + (1 - Math.min(1, act * 2)) * 0.4;
              play(fr, t, dur, level * (onBeat ? 1.6 : 1.1));
              field.note(fr, t, dur);
            }
          }
          step += spb;
        }
      },
      stop() {},
    };
  }

  // Crystal: sparse bells high up, each with a few partials ringing at their own pace. Cold colors
  // use the inharmonic partials of a struck plate (glassy); warm ones lean toward the harmonic
  // series (a softer chime). Symmetric, still rules ring longer and a little more often.
  function crystal(ctx, o) {
    const { f, col, fp, T } = o;
    // Bells come in lower than the other note engines, through a high shelf that takes the edge
    // off their upper partials.
    const out = ctx.createGain(); out.gain.value = 0.6;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2400; shelf.gain.value = -8;
    shelf.connect(out);
    const bus = echo(ctx, shelf, 0.37, 0.5, 0.5, 5000);
    const chord = Timbre.chord(T, col);
    const root = octaveInto(f, 660, 1320);
    const notes = chord.map(h => root * h).filter(x => x < 5000);
    const partials = col.temp < -0.3 ? [[1, 1, 1], [2.756, 0.45, 0.55], [5.404, 0.22, 0.32], [8.933, 0.1, 0.2]]
      : col.temp > 0.3 ? [[1, 1, 1], [2, 0.4, 0.6], [3.01, 0.18, 0.35]]
      : [[1, 1, 1], [2.32, 0.4, 0.5], [4.25, 0.18, 0.3]];
    const ring = 1.6 + fp.symmetry * 3 + fp.still * 1.2;
    let level = 0, act = fp.activity, beat = null;
    function bell(fr, t, peak) {
      for (const [r, a, dk] of partials) {
        if (fr * r > 12000) continue;
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = fr * r;
        const e = env(ctx, t, peak * a, 0.002, ring * dk);
        o2.connect(e); e.connect(bus); o2.start(t); o2.stop(t + ring * dk + 0.1);
      }
    }
    return {
      out,
      update(d, g, now) { level = g; if (d) act = d.activity; },
      schedule(field, now, horizon, priority) {
        if (level < 0.004 || !notes.length) { beat = null; return; }
        if (beat === null || field.timeOf(beat) < now) beat = Math.ceil(field.beatAt(now + 0.02) * 2) / 2;
        while (field.timeOf(beat) < now + horizon) {
          const t = field.timeOf(beat);
          if (Math.random() < 0.1 + fp.symmetry * 0.2 + act * 0.3) {
            const cands = notes.slice().sort(() => Math.random() - 0.5);
            const fr = field.choose(cands, t);
            if (fr && field.grant(priority)) { bell(fr, t, level); field.note(fr, t, ring * 0.5); }
          }
          beat += 0.5;
        }
      },
      stop() {},
    };
  }

  return { breath, rumble, arp, crystal, octaveInto, clamp, noiseSource };
})();
if (typeof module !== 'undefined') module.exports = Engines;
