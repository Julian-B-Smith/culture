// Rhythm layer. The largest tiers each play a percussion part on the shared pulse (timbre.js
// Field), so drums, arpeggios and bells keep one tempo, which drifts with how much the world moves.
//
// What a tier plays comes from how it looks:
//   its sound class picks the instruments
//     drone   kick (the ground)          rumble  toms and low kick ghosts
//     breath  snare or clap, shaker     arp     usually nothing (now and then a hat)
//     crystal rim, clave, conga or cowbell
//   (drums.js also holds sounds of the space itself, unused for now: blips, static, ticks,
//   bubbles, skittering, ice and drips)
//   its disorder (activity, asymmetry, restlessness) picks how syncopated the part is
//     ordered  on the grid: four on the floor, backbeats, straight eighths, 16-step loops
//     middle   Euclidean patterns rotated off the downbeat, a few ghost notes
//     chaotic  odd loop lengths (7, 9, 11, 13 steps) cycling against the bar, many ghosts,
//              loose timing
//   its color picks the feel: warm parts are lower and swing a little; cold parts are higher and
//   straight; moss swings most and is loosest; ash is dry and sparse.
// Everything is drawn from the tier's hash, so a tier always plays the same part.
const Rhythm = (() => {
  function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Euclidean rhythm: k hits spread as evenly as possible over n steps, rotated by r.
  function euclid(k, n, r) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(Math.floor(((i + r) * k) / n) !== Math.floor(((i + r - 1) * k) / n) ? 1 : 0);
    return out;
  }

  // 0 = perfectly ordered, 1 = chaotic. Scaled to the spread of viable rules (median rule ≈ 0.4).
  function disorder(fp) {
    const d = (fp.activity / 0.5) * 0.45 + ((0.5 - fp.symmetry) / 0.3) * 0.25 + (1 - fp.still) * 0.4;
    return Math.max(0, Math.min(1, d));
  }

  // Builds one tier's part: a list of lanes, each { voice, steps: [velocity 0..1 per step], n }.
  function part(T, cls, fp, col) {
    const rng = mulberry32((T.hash >>> 0) ^ 0x9e3779b9), dis = disorder(fp);
    const n = dis < 0.45 ? 16 : dis < 0.7 ? (rng() < 0.5 ? 12 : 16) : [7, 9, 11, 13][Math.floor(rng() * 4)];
    // Ordered parts start on the beat; disordered ones rotate further off it.
    const rot = () => dis < 0.3 ? 0 : Math.floor(rng() * n * Math.min(1, dis));
    const lane = (voice, k, r, vel, ghost) => {
      const hits = euclid(Math.max(1, Math.min(n, k)), n, r);
      const steps = hits.map(h => h ? vel * (0.8 + rng() * 0.2) : (rng() < ghost ? vel * 0.28 : 0));
      return { voice, steps, n };
    };
    const ghost = dis * 0.35;
    const warm = col.temp > 0.3, cold = col.temp < -0.3;
    const lanes = [];
    if (cls === 'drone') {
      lanes.push(dis < 0.35 ? lane('kick', n === 16 ? 4 : Math.round(n / 4), 0, 0.9, 0) : lane('kick', 3 + Math.floor(rng() * 3), rot(), 0.85, ghost * 0.5));
    } else if (cls === 'rumble') {
      lanes.push(lane('tom', 3 + Math.floor(rng() * 3), rot(), 0.75, ghost));
      if (dis > 0.4) lanes.push(lane('kick', 2 + Math.floor(rng() * 3), rot(), 0.5, 0));
    } else if (cls === 'breath') {
      const v = rng() < 0.5 ? 'snare' : 'clap';
      // Ordered: a backbeat on steps 4 and 12. Disordered: displaced hits.
      lanes.push(dis < 0.35 && n === 16 ? lane(v, 2, 4, 0.8, ghost) : lane(v, 2 + Math.floor(rng() * 3), rot() + 2, 0.75, ghost));
      if (!cold) lanes.push(lane('shaker', Math.round(n / 2) + Math.floor(rng() * 3), rot(), 0.5, ghost));
    } else if (cls === 'arp') {
      // Arpeggios carry their own rhythm, and drums on top tend to sound like stray noise, so an
      // arpeggio tier usually adds none. About one in five adds a sparse hat.
      if (rng() < 0.2) lanes.push(lane(rng() < 0.5 ? 'hat' : 'openhat', 1 + Math.floor(rng() * 3), dis < 0.3 ? 2 : rot(), 0.45, 0));
    } else if (cls === 'crystal') {
      const v = cold ? (rng() < 0.5 ? 'clave' : 'rim') : warm ? (rng() < 0.5 ? 'conga' : 'metal') : (rng() < 0.5 ? 'rim' : 'clave');
      // 3 over 8 (the tresillo) or 5 over 16 (the clave) when ordered; less regular otherwise.
      const k = dis < 0.4 ? (n === 16 ? 5 : 3) : 2 + Math.floor(rng() * 5);
      lanes.push(lane(v, k, rot(), 0.6, ghost * 0.5));
    }
    // Feel: swing delays the off-beat sixteenths; looseness jitters every hit.
    const swing = (warm ? 0.12 : 0) + col.organic * 0.18 + (cold ? 0 : dis * 0.08);
    const loose = 0.003 + dis * 0.012 + col.organic * 0.008;
    // Tone: warm parts lower, cold parts higher; each tier a little different.
    const tone = Math.max(0, Math.min(1, 0.5 - col.temp * 0.25 + (rng() - 0.5) * 0.3));
    // Gravity: how strongly the bar pulls this part's kicks to 1 and snares to 2 and 4. Order pulls
    // hard; chaos fights it, but never escapes completely.
    const grav = Math.max(0.5, 1 - dis * 0.6);
    // Kick punch: each tier's kick has its own amount of pop. Cold and disordered tiers lean
    // snappy, warm ones round; most land in between.
    const punch = Math.max(0, Math.min(1, 0.5 + (rng() - 0.5) * 0.6 - col.temp * 0.15 + dis * 0.1));
    return { lanes, n, swing, loose, tone, dis, grav, punch, hash: T.hash >>> 0, sparse: col.dust > 0.5 ? 0.6 : 1 };
  }

  // Breakbeat gravity on a 16-step bar: kicks fall to 1 (step 0) and, half as strongly, 3 (step 8);
  // snares and claps fall to 2 and 4 (steps 4 and 12).
  const WELLS_KICK = { 0: 1, 8: 0.5 }, WELLS_SNARE = { 4: 1, 12: 1 };
  const NEAR = { kick: [15, 1, 7, 9], snare: [3, 5, 11, 13] };
  const role = L => L.voice === 'kick' ? 'kick' : (L.voice === 'snare' || L.voice === 'clap') ? 'snare' : null;
  // Entry groups for the conductor: kicks; snares, claps and toms; everything else is texture.
  const group = L => L.voice === 'kick' ? 'kick' : (L.voice === 'snare' || L.voice === 'clap' || L.voice === 'tom') ? 'snare' : 'tex';

  // ── Slicing ──
  // After the drill'n'bass of the 90s (Aphex Twin, Squarepusher): now and then a hit is chopped
  // into a burst of rapid retriggers that speed up or slow down, bend in pitch and swell or fade,
  // and the snare on beat 4 can break into a roll that carries into the next bar. Disordered parts
  // slice more; nothing slices until the conductor has let the snares in. SLICE scales it all:
  // 0 switches slicing off, 2 doubles it.
  const SLICE = 1;
  const SLICEABLE = new Set(['snare', 'clap', 'hat', 'openhat', 'rim', 'clave', 'tom', 'conga', 'metal', 'shaker']);
  function ratchet(ctx, voice, dest, t, span, vel, tone, count, swell) {
    const ratio = Math.random() < 0.5 ? 0.78 : 1.28;           // gaps shrink (accelerate) or grow
    const w = Array.from({ length: count }, (_, i) => Math.pow(ratio, i)), sum = w.reduce((a, b) => a + b, 0);
    const bend = (Math.random() - 0.5) * 0.9;                   // pitch climbs or falls across the burst
    let at = t;
    for (let i = 0; i < count; i++) {
      const k = count > 1 ? i / (count - 1) : 0;
      const v = vel * (swell ? 0.3 + 0.7 * k : 1 - 0.55 * k);
      Drums.KIT[voice](ctx, dest, at, v, Math.max(0, Math.min(1, tone + bend * k)));
      at += span * w[i] / sum;
    }
  }

  // Schedules every playing part a little ahead of time, on the Field's beat grid (4 steps a beat).
  class Player {
    constructor() { this.next = null; this.parts = new Map(); }
    partFor(T, cls, fp, col) {
      if (!this.parts.has(T)) this.parts.set(T, part(T, cls, fp, col));
      return this.parts.get(T);
    }
    // players: [{ T, part, level, dest }]; intensity 0..1 thins every part (quiet world, empty world).
    // onKick(t, velocity) is called for every kick, so the mix can duck under it.
    // allow: { tex, snare, kick } which groups may play right now (the conductor's call).
    // buses: { kick, kickSub } where kicks go (both centred). Each player brings two placed
    // destinations: destMain (snares, claps and hats) and dest (everything else).
    // One kick leads at a time: the loudest tier with a kick part, re-chosen at the top of a bar
    // only when another is clearly louder (30%). The lead kick goes to the main bus and drives
    // onKick(t, velocity); other kicks play softer on the sub bus, ducked under it with the rest.
    schedule(ctx, field, now, horizon, players, intensity, onKick, allow = { tex: true, snare: true, kick: true }, buses = null) {
      if (this.next === null || field.timeOf(this.next / 4) < now) this.next = Math.ceil(field.beatAt(now + 0.03) * 4);
      const hasKick = allow.kick && players.some(p => p.part.lanes.some(L => role(L) === 'kick'));
      const hasSnare = allow.snare && players.some(p => p.part.lanes.some(L => role(L) === 'snare'));
      while (field.timeOf(this.next / 4) < now + horizon) {
        const s = this.next, stepDur = 60 / field.bpm / 4, t0 = field.timeOf(s / 4);
        const bar = Math.floor(s / 16), pos = ((s % 16) + 16) % 16;
        const kickers = allow.kick ? players.filter(p => p.part.lanes.some(L => L.voice === 'kick')) : [];
        let lead = kickers.find(p => p.T === this.lead);
        if (!lead || pos === 0) {
          const best = kickers.reduce((a, p) => (!a || p.level > a.level ? p : a), null);
          if (best && (!lead || best.level > lead.level * 1.3)) lead = best;
          this.lead = lead ? lead.T : null;
        }
        for (const p of players) {
          const P = p.part;
          for (let li = 0; li < P.lanes.length; li++) {
            const L = P.lanes[li];
            if (!allow[group(L)]) continue;
            let v = L.steps[((s % L.n) + L.n) % L.n];
            // The bar's pull, decided afresh each bar from the tier's hash, so a bar can
            // land on the grid or fight it, but the same tier always fights it the same way.
            const r = role(L);
            let well = false;
            if (r) {
              const rng = mulberry32((P.hash ^ Math.imul(bar + 1, 2654435761) ^ (li * 7919 + pos * 104729)) >>> 0), u = rng();
              const G = P.grav, wells = r === 'kick' ? WELLS_KICK : WELLS_SNARE;
              if (wells[pos] !== undefined) {
                well = true;
                if (!v && u < G * wells[pos]) v = 0.85;              // pulled onto the well
                else if (v) v = Math.max(v, 0.6 + 0.3 * G);           // what lands there is accented
              } else if (r === 'kick' ? (hasSnare && (pos === 4 || pos === 12)) : (hasKick && pos === 0)) {
                if (v && u < G * 0.75) v = 0;                         // pushed off the other's ground
              } else if (v && NEAR[r].includes(pos) && u < G * 0.45) v = 0; // neighbours fall into the well
            }
            if (!v) continue;
            // Thin quiet parts: as intensity falls, soft steps (ghosts) drop out first, then the rest.
            // Hits on a well hold the bar together, so they resist thinning as strongly as gravity pulls.
            // At intensity 0 (an empty map) about one main hit in six survives, ghosts rarely, and
            // even the strong beats only half the time.
            const keep = Math.min(1, (0.15 + 0.85 * intensity) * (0.6 + v * 0.6)) * P.sparse;
            if (Math.random() > (well ? Math.max(keep, P.grav * (0.5 + 0.5 * intensity)) : keep)) continue;
            const t = t0 + (s % 2 ? P.swing * stepDur : 0) + (Math.random() - 0.5) * 2 * P.loose;
            const at = Math.max(now, t);
            if (L.voice === 'kick') {
              const isLead = p.T === this.lead;
              Drums.KIT.kick(ctx, buses ? (isLead ? buses.kick : buses.kickSub) : p.dest, at, v * p.level * (isLead ? 1 : 0.5), P.tone, P.punch);
              if (isLead && onKick) onKick(at, v * p.level);
            } else {
              // Snares, claps and hats stay out of the kick duck; toms and the rest sit under it.
              const dest = (role(L) === 'snare' || L.voice === 'hat' || L.voice === 'openhat') && p.destMain ? p.destMain : p.dest;
              const canSlice = SLICE > 0 && allow.snare && SLICEABLE.has(L.voice);
              if (canSlice && role(L) === 'snare' && pos === 12 && Math.random() < SLICE * (0.04 + P.dis * 0.18)) {
                // A roll from beat 4 to the end of the bar.
                ratchet(ctx, L.voice, dest, at, stepDur * 4, v * p.level, P.tone, [6, 8, 12][Math.floor(Math.random() * 3)], true);
              } else if (canSlice && Math.random() < SLICE * (0.012 + P.dis * 0.05)) {
                // A burst inside one or two steps.
                ratchet(ctx, L.voice, dest, at, stepDur * (Math.random() < 0.6 ? 1 : 2), v * p.level, P.tone, [3, 4, 6, 8][Math.floor(Math.random() * 4)], Math.random() < 0.4);
              } else {
                Drums.KIT[L.voice](ctx, dest, at, v * p.level, P.tone);
              }
            }
          }
        }
        this.next++;
      }
    }
    reset() { this.parts.clear(); this.next = null; this.lead = null; }
  }

  return { euclid, disorder, part, Player };
})();
if (typeof module !== 'undefined') module.exports = Rhythm;
