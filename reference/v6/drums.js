// Drum kit for the rhythm layer: every sound synthesized, in the spirit of early-80s analog drum
// machines. Each voice is a function (ctx, dest, t, vel, tone) that schedules one hit at time t.
//   vel   0..1 loudness
//   tone  0..1 a per-tier character: pitch for drums, brightness for metals and noise
// Color temperature is applied by the caller through `tone` and the choice of voices.
const Drums = (() => {
  // One shared noise buffer per context.
  const noiseOf = new WeakMap();
  function noise(ctx) {
    if (noiseOf.has(ctx)) return noiseOf.get(ctx);
    const len = Math.floor(ctx.sampleRate * 1.0), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseOf.set(ctx, b); return b;
  }
  // Envelope gain: silent until t, attack to peak, exponential fall over `dur`.
  function env(ctx, t, peak, dur, attack = 0.001) {
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    return g;
  }
  function hiss(ctx, t, dur) {
    const s = ctx.createBufferSource(); s.buffer = noise(ctx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return s;
  }

  // Kick: three layers. A soft low thump of noise for the beater, a sine body that drops from
  // under three times its pitch, and the same body pushed through soft saturation so it carries on small
  // speakers. 45–65 Hz fundamental, held long enough to ground the bar.
  const satCurve = (() => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 3) / Math.tanh(3); } return c; })();
  // punch 0..1 (per tier): 0 is round and soft, 1 is snappy, with a brighter beater and a steeper
  // pitch drop. Unset, it sits a little toward round.
  function kick(ctx, dest, t, vel, tone, punch = 0.35) {
    const f = 45 + tone * 20, o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * (2.4 + punch * 1.6), t); o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.05 - punch * 0.02); o.frequency.exponentialRampToValueAtTime(f, t + 0.16);
    const body = env(ctx, t, vel * 1.15, 0.5 + (1 - tone) * 0.25, 0.004);
    const sat = ctx.createWaveShaper(); sat.curve = satCurve;
    const drive = ctx.createGain(); drive.gain.value = 1.6;
    const satOut = ctx.createGain(); satOut.gain.value = 0.35;
    o.connect(body); body.connect(dest); body.connect(drive); drive.connect(sat); sat.connect(satOut); satOut.connect(dest);
    o.start(t); o.stop(t + 1);
    // Beater: a soft, low-passed thump of noise rather than a bright click.
    const n = hiss(ctx, t, 0.03), bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 1400 + punch * 2600; bp.Q.value = 0.5;
    const ec = env(ctx, t, vel * (0.12 + punch * 0.26), 0.014 - punch * 0.006, 0.002 - punch * 0.0012); n.connect(bp); bp.connect(ec); ec.connect(dest);
  }
  // Tom: like the kick but pitched up and shorter; tone sets the pitch.
  function tom(ctx, dest, t, vel, tone) {
    const f = 90 + tone * 160, o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const e = env(ctx, t, vel * 0.7, 0.28);
    o.connect(e); e.connect(dest); o.start(t); o.stop(t + 0.5);
  }
  // Snare: a pitched body plus band-passed noise.
  function snare(ctx, dest, t, vel, tone) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(190 + tone * 60, t);
    o.frequency.exponentialRampToValueAtTime(150 + tone * 40, t + 0.05);
    const eb = env(ctx, t, vel * 0.45, 0.09); o.connect(eb); eb.connect(dest); o.start(t); o.stop(t + 0.2);
    const n = hiss(ctx, t, 0.25), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + tone * 2500; bp.Q.value = 0.8;
    const en = env(ctx, t, vel * 0.55, 0.14 + tone * 0.08); n.connect(bp); bp.connect(en); en.connect(dest);
  }
  // Clap: three quick noise bursts then a short tail, like the 808's.
  function clap(ctx, dest, t, vel, tone) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100 + tone * 900; bp.Q.value = 1.4; bp.connect(dest);
    for (const [dt, a, d] of [[0, 0.5, 0.012], [0.011, 0.45, 0.012], [0.023, 0.5, 0.012], [0.032, 0.42, 0.16]]) {
      const n = hiss(ctx, t + dt, d + 0.02), e = env(ctx, t + dt, vel * a * 2.2, d); n.connect(e); e.connect(bp);
    }
  }
  // Hats: high-passed noise; open hats ring longer.
  function hat(ctx, dest, t, vel, tone, open) {
    const n = hiss(ctx, t, open ? 0.5 : 0.08), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000 + tone * 3000;
    const e = env(ctx, t, vel * 0.28, open ? 0.32 : 0.035); n.connect(hp); hp.connect(e); e.connect(dest);
  }
  // Rim: a very short pitched click.
  function rim(ctx, dest, t, vel, tone) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1600 + tone * 900;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + tone * 900; bp.Q.value = 3;
    const e = env(ctx, t, vel * 0.3, 0.025); o.connect(bp); bp.connect(e); e.connect(dest); o.start(t); o.stop(t + 0.08);
  }
  // Clave / woodblock: a damped sine, high (clave) or mid (woodblock).
  function clave(ctx, dest, t, vel, tone) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 900 + tone * 1700;
    const e = env(ctx, t, vel * 0.4, 0.06); o.connect(e); e.connect(dest); o.start(t); o.stop(t + 0.12);
  }
  // Shaker: soft band-passed noise with a slower attack.
  function shaker(ctx, dest, t, vel, tone) {
    const n = hiss(ctx, t, 0.1), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5000 + tone * 3000; bp.Q.value = 1.2;
    const e = env(ctx, t, vel * 0.22, 0.05, 0.012); n.connect(bp); bp.connect(e); e.connect(dest);
  }
  // Conga: a pitched sine with a little bend and a slap of noise.
  function conga(ctx, dest, t, vel, tone) {
    const f = 180 + tone * 180, o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.12, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const e = env(ctx, t, vel * 0.5, 0.18); o.connect(e); e.connect(dest); o.start(t); o.stop(t + 0.3);
    const n = hiss(ctx, t, 0.03), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 4; bp.Q.value = 2;
    const en = env(ctx, t, vel * 0.12, 0.015); n.connect(bp); bp.connect(en); en.connect(dest);
  }
  // Cowbell-ish metal: two square waves at an inharmonic ratio, band-passed.
  function metal(ctx, dest, t, vel, tone) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000 + tone * 1500; bp.Q.value = 2;
    const e = env(ctx, t, vel * 0.16, 0.12); bp.connect(e); e.connect(dest);
    for (const f of [540, 800]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (1 + tone * 0.3); o.connect(bp); o.start(t); o.stop(t + 0.2); }
  }

  // ── Sounds from inside the space: less like a drum kit, more like the room itself ──

  // A buffer of sparse random clicks (dust on a tape head, static on a dead channel).
  const crackleOf = new WeakMap();
  function crackleBuf(ctx) {
    if (crackleOf.has(ctx)) return crackleOf.get(ctx);
    const len = Math.floor(ctx.sampleRate * 1.0), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) if (Math.random() < 0.0035) d[i] = (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6);
    crackleOf.set(ctx, b); return b;
  }
  // VHS blip: a tiny FM chirp, the kind a deck or a menu makes; pitch flicks up or down.
  function blip(ctx, dest, t, vel, tone) {
    const f = 700 + tone * 2300 * (0.7 + Math.random() * 0.6), c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain();
    c.type = 'sine'; m.type = 'square'; m.frequency.value = f * 1.5; mg.gain.value = f * 0.8;
    c.frequency.setValueAtTime(f, t); c.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 0.6 : 1.7), t + 0.03);
    m.connect(mg); mg.connect(c.frequency);
    const e = env(ctx, t, vel * 0.16, 0.03); c.connect(e); e.connect(dest);
    c.start(t); m.start(t); c.stop(t + 0.08); m.stop(t + 0.08);
  }
  // Static: a short burst of crackle, band-limited like a tuning radio.
  function staticBurst(ctx, dest, t, vel, tone) {
    const s = ctx.createBufferSource(); s.buffer = crackleBuf(ctx); s.start(t, Math.random() * 0.8); s.stop(t + 0.3);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + tone * 4000; bp.Q.value = 0.7;
    const e = env(ctx, t, vel * 2.1, 0.06 + Math.random() * 0.14, 0.004); s.connect(bp); bp.connect(e); e.connect(dest);
  }
  // Tape tick: one click with a faint high ring after it.
  function tick(ctx, dest, t, vel, tone) {
    const n = hiss(ctx, t, 0.01), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4000 + tone * 4000; bp.Q.value = 12;
    const e = env(ctx, t, vel * 2.6, 0.012, 0.0003); n.connect(bp); bp.connect(e); e.connect(dest);
  }
  // Bubble: a sine whose pitch rises as it decays, like a bubble breaking the surface.
  function bubble(ctx, dest, t, vel, tone) {
    const f = (350 + tone * 900) * (0.75 + Math.random() * 0.5), d = 0.03 + Math.random() * 0.04, o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (2 + Math.random()), t + d);
    const e = env(ctx, t, vel * 0.32, d, 0.002); o.connect(e); e.connect(dest); o.start(t); o.stop(t + d + 0.05);
  }
  // Skitter: a scurry of tiny clicks, accelerating or slowing, like something small crossing a surface.
  function skitter(ctx, dest, t, vel, tone) {
    const count = 4 + Math.floor(Math.random() * 6), speed = Math.random() < 0.5 ? 0.82 : 1.18;
    let dt = 0.012 + Math.random() * 0.012, at = t;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000 + tone * 4000; bp.Q.value = 4; bp.connect(dest);
    for (let i = 0; i < count; i++) {
      const n = hiss(ctx, at, 0.006), e = env(ctx, at, vel * (0.5 + Math.random() * 0.5) * 1.8, 0.004, 0.0003);
      n.connect(e); e.connect(bp); at += dt; dt *= speed;
    }
  }
  // Ice: a sharp crack, a few glassy inharmonic rings, and the falling "pew" of a sheet under strain.
  function ice(ctx, dest, t, vel, tone) {
    const n = hiss(ctx, t, 0.02), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ec = env(ctx, t, vel * 0.5, 0.008, 0.0003); n.connect(hp); hp.connect(ec); ec.connect(dest);
    const base = 1800 + tone * 1500;
    for (const r of [1, 1.62, 2.71]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * r * (0.95 + Math.random() * 0.1); bp.Q.value = 35;
      const er = env(ctx, t, vel * 1.2, 0.08 + Math.random() * 0.1, 0.0005); ec.connect(bp); bp.connect(er); er.connect(dest);
    }
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(5200, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.07);
    const ep = env(ctx, t, vel * 0.06, 0.07, 0.001); o.connect(ep); ep.connect(dest); o.start(t); o.stop(t + 0.12);
  }
  // Drip: a short falling sine with a soft attack, a drop landing in still water.
  function drip(ctx, dest, t, vel, tone) {
    const f = (700 + tone * 1200) * (0.8 + Math.random() * 0.4), o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.025);
    const e = env(ctx, t, vel * 0.28, 0.07, 0.003); o.connect(e); e.connect(dest); o.start(t); o.stop(t + 0.12);
  }

  const KIT = { blip, static: staticBurst, tick, bubble, skitter, ice, drip, kick, tom, snare, clap, hat: (c, d, t, v, tn) => hat(c, d, t, v, tn, false), openhat: (c, d, t, v, tn) => hat(c, d, t, v, tn, true), rim, clave, shaker, conga, metal };
  return { KIT };
})();
if (typeof module !== 'undefined') module.exports = Drums;
