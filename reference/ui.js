(() => {
  const SIZES = [[165, 105], [220, 140], [330, 210], [440, 280], [550, 350]];
  let W = 220, H = 140;
  const $ = id => document.getElementById(id);
  const cv = $('world'), ctx = cv.getContext('2d');
  let img = ctx.createImageData(W, H);
  const fx = $('fx'), fctx = fx.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sonic = new Sonic.Engine();
  let markers = true;
  let world, running = true, rings = [], palette = {}, view = 'life', births = 0;
  function hsl(h, s, l) {
    s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  // Hues follow birth order, so a tier index reused after an extinction gets a fresh color.
  function colorOf(T) {
    const key = T.key ??= (T.idx === 0 ? 0 : ++births);
    if (palette[key]) return palette[key];
    // Hue comes from the tier's color family; each tier gets a small shift so siblings stay distinguishable.
    const fam = [220, 14, 44, 122, 188, 278][T.el], base = T.el === 0;
    const h = (fam + (key === 0 ? 0 : ((key * 37) % 25) - 12) + 360) % 360;
    return palette[key] = {
      live: hsl(h, base ? 22 : 82, base ? 80 : 58 + (key % 3) * 6), dead: hsl(h, base ? 18 : 42, base ? 8 : 10 + (key % 3)),
      css: `hsl(${h.toFixed(0)} ${base ? 22 : 82}% ${base ? 75 : 60}%)`,
    };
  }
  const famCss = e => e === 0 ? 'hsl(220 22% 75%)' : `hsl(${[220, 14, 44, 122, 188, 278][e]} 82% 64%)`;
  const SPEEDS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 10, 12];
  const params = {};
  const hl = v => Math.pow(10, +v);
  const ctl = {
    speed: v => { const s = SPEEDS[+v]; return [s, s === 0.25 ? '¼×' : s === 0.5 ? '½×' : s + '×']; },
    margin: v => [v / 100, v + '%'],
    patience: v => [Math.pow(0.5, 1 / hl(v)), Math.round(hl(v)).toLocaleString() + ' gen'],
    maxSpeed: v => [v / 100, (v / 100).toFixed(2) + ' c'],
    crowding: v => [v / 100, v == 0 ? 'off' : v + '%'],
    mutation: v => [v / 10, v == 0 ? 'off' : (v / 10).toFixed(1) + '×'],
    spark: v => [v / 100000, v == 0 ? 'off' : (v / 10).toFixed(1) + ' per 10k contacts'],
    hold: v => [+v, v],
    hardness: v => [+v, v == 0 ? 'off' : '×' + (1 + +v)],
    gain: v => [v / 100, v == 0 ? 'off' : v + '%'],
    forget: v => [Math.pow(0.5, 1 / hl(v)), Math.round(hl(v)).toLocaleString() + ' gen'],
    noise: v => [v / 10000, (v / 100).toFixed(2) + '%/gen'],
    memory: v => [Math.pow(0.5, 1 / hl(v)), Math.round(hl(v)).toLocaleString() + ' gen'],
  };
  for (const k of Object.keys(ctl)) {
    const el = $(k), upd = () => { const [val, txt] = ctl[k](el.value); params[k] = val; $(k + 'o').textContent = txt; };
    el.addEventListener('input', upd); upd();
  }
  params.warmup = 300; params.extinction = 200; params.retreat = 400; params.sparkCooldown = 1500; params.reactions = true;
  $('reactions').addEventListener('click', () => {
    params.reactions = !params.reactions;
    $('reactions').textContent = params.reactions ? 'On' : 'Off';
    $('reactions').setAttribute('aria-pressed', params.reactions);
  });
  function newWorld() {
    [W, H] = SIZES[+$('size').value];
    if (cv.width !== W) { cv.width = W; cv.height = H; img = ctx.createImageData(W, H); }
    world = new Core.World(W, H, (Math.random() * 2 ** 32) >>> 0);
    rings = []; palette = {}; births = 0; sonic.reset(); renderLedger();
  }
  function handle(ev) {
    if (!ev || ev.searching) return;
    sonic.event(ev, world, params);
    if (ev.tier !== undefined) { const T = world.tiers[ev.tier]; rings.push({ x: ev.x, y: ev.y, t: 0, c: colorOf(T).css, spark: !!T.parents, mutant: T.mutatedFrom != null }); }
    renderLedger();
  }
  let stepAcc = 0;
  function tick() {
    // Fractional speeds step the world every second or fourth frame.
    stepAcc += params.speed;
    // Large worlds can't always keep up with high speeds; cap the work per frame so the page stays responsive.
    const t0 = performance.now();
    while (stepAcc >= 1) {
      stepAcc -= 1; handle(world.step(params));
      if (performance.now() - t0 > 28) { stepAcc = 0; break; }
    }
    // Rule search tests a few candidates per frame so a birth never freezes the page.
    handle(world.work(params, 3));
  }
  function draw() {
    const d = img.data, al = world.alive, tr = world.tier, n = W * H;
    const cols = world.tiers.map(colorOf);
    if (view === 'life') {
      for (let i = 0; i < n; i++) {
        const c = cols[tr[i]], rgb = al[i] ? c.live : c.dead, o = i * 4;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    } else {
      // Memory view: amber is acquired resistance to crowding, blue-white is hardened border.
      const res = world.resist, wall = world.wall, hmax = Math.max(1, params.hardness);
      for (let i = 0; i < n; i++) {
        const c = cols[tr[i]].dead, r = res[i], w = Math.min(1, wall[i] / hmax), o = i * 4;
        d[o] = Math.min(255, c[0] + r * 230 + w * 120);
        d[o + 1] = Math.min(255, c[1] + r * 150 + w * 170);
        d[o + 2] = Math.min(255, c[2] + r * 30 + w * 230);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    fctx.clearRect(0, 0, fx.width, fx.height);
    const sx = fx.width / W, sy = fx.height / H;
    rings = rings.filter(r => r.t < 90);
    for (const r of rings) r.t++;
    for (const r of markers ? rings : []) {
      fctx.globalAlpha = Math.max(0, 1 - r.t / 90);
      fctx.strokeStyle = r.c; fctx.lineWidth = 2;
      const rad = (reduce ? 14 : 6 + r.t * 1.6) * sx;
      fctx.setLineDash(r.mutant ? [2, 5] : []);
      fctx.beginPath(); fctx.arc((r.x + 0.5) * sx, (r.y + 0.5) * sy, rad, 0, Math.PI * 2); fctx.stroke();
      fctx.setLineDash([]);
      if (r.spark) { fctx.beginPath(); fctx.arc((r.x + 0.5) * sx, (r.y + 0.5) * sy, rad * 0.6, 0, Math.PI * 2); fctx.stroke(); }
    }
    fctx.globalAlpha = 1;
    if (markers && world.search) {
      const S = world.search;
      fctx.setLineDash([4, 4]); fctx.strokeStyle = 'rgba(242,184,75,0.85)'; fctx.lineWidth = 1.5;
      fctx.beginPath(); fctx.arc((S.cx + 0.5) * sx, (S.cy + 0.5) * sy, 7 * sx, 0, Math.PI * 2); fctx.stroke();
      fctx.setLineDash([]);
    }
    $('gen').textContent = world.gen.toLocaleString();
    $('ftier').textContent = world.frontier;
    $('fage').textContent = world.frontierAge.toLocaleString();
    $('fext').textContent = world.extinct.length;
    $('factive').textContent = world.active;
    $('hgen').textContent = world.gen.toLocaleString(); $('htier').textContent = world.frontier;
    const quiet = world.gen - world.lastBirth;
    $('quiet').textContent = quiet.toLocaleString();
    $('typical').textContent = Math.round(world.meanEpoch).toLocaleString();
    $('qfill').style.width = Math.min(100, 50 * quiet / world.meanEpoch) + '%';
    if (world.reignTier) {
      const R = world.reignTier, reign = world.gen - world.reignStart;
      $('rname').textContent = `Tier ${R.idx}`; $('rname').style.color = colorOf(R).css;
      $('reign').textContent = reign.toLocaleString();
      $('rfill').style.width = Math.min(100, 50 * reign / world.meanEpoch) + '%';
    }
    const warm = world.frontierAge <= world.warm;
    const thr = world.record * (1 + params.margin), now = world.lastMax, top = Math.max(thr, now) * 1.15 || 1;
    $('mfill').style.width = (100 * now / top) + '%';
    $('mmark').style.left = (100 * thr / top) + '%';
    $('snow').textContent = now.toFixed(0);
    $('sthr').textContent = world.retreat ? 'paused during retreat' : world.search ? `testing rules (${world.search.tries})` : warm ? 'warming up' : thr.toFixed(0);
    for (const el of $('ledger').children) {
      const T = el._tier;
      el.querySelector('.cov div').style.width = (el.classList.contains('extinct') ? 0 : 100 * T.cells / n).toFixed(1) + '%';
    }
  }
  function renderLedger() {
    const L = $('ledger'); L.textContent = '';
    const entries = [...world.tiers.map(T => [T, false]), ...world.extinct.map(T => [T, true])].sort((a, b) => b[0].gen - a[0].gen);
    for (const [T, dead] of entries) {
      const c = colorOf(T), el = document.createElement('div');
      el.className = 'tier' + (dead ? ' extinct' : T.dying ? ' dying' : T.idx === world.frontier ? ' frontier' : '');
      const born = T.idx === 0 ? 'origin · Conway\'s Life' : T.mutatedFrom != null
        ? `gen ${T.gen.toLocaleString()} · mutated from tier ${T.mutatedFrom} ${T.reign.toLocaleString()} gen into its reign · invades at ${T.speed.toFixed(2)} c`
        : T.parents
        ? `gen ${T.gen.toLocaleString()} · sparked where tier ${T.parents[0]} met tier ${T.parents[1]} · invades at ${T.speed.toFixed(2)} c`
        : `gen ${T.gen.toLocaleString()} at (${T.origin[0]}, ${T.origin[1]}) · ${T.surprise.toFixed(0)} bits · invades at ${T.speed.toFixed(2)} c`;
      const meta = `${Core.ELEMENTS[T.el]} · ${born}` + (dead ? ` · extinct gen ${T.extinctAt.toLocaleString()}` : '');
      const verbs = { [Core.PUSH]: 'pushes back', [Core.FEED]: 'feeds on', [Core.SPARK]: 'sparks with' };
      const groups = {};
      T.react.forEach((r, e) => { if (r) (groups[r] ??= []).push(e); });
      const reacts = Object.keys(groups).map(r => `${verbs[r]} ${groups[r].map(e => `<span class="elx" style="color:${famCss(e)}">${Core.ELEMENTS[e]}</span>`).join(', ')}`).join(' · ');
      el.innerHTML = `<span class="sw" style="background:${c.css}"></span><span class="name">Tier ${T.idx}</span><span class="rule">${Core.ruleStr(T.rule)}</span><span class="meta">${meta}</span>${reacts ? `<span class="meta reacts">${reacts}</span>` : ''}<span class="cov"><div style="background:${c.css};width:0"></div></span>`;
      el._tier = T;
      L.appendChild(el);
    }
  }
  function setView(v) {
    view = v;
    $('vlife').classList.toggle('on', v === 'life'); $('vlife').setAttribute('aria-pressed', v === 'life');
    $('vmem').classList.toggle('on', v === 'mem'); $('vmem').setAttribute('aria-pressed', v === 'mem');
    $('vhint').textContent = v === 'life' ? 'Bright cells are alive. The tint shows which tier\'s rule governs each site.'
      : 'Amber marks sites resisting a crowding count that recently killed them. Blue-white marks border ground hardened under pressure.';
  }
  function loop() { if (running) tick(); draw(); sonic.update(world, params); requestAnimationFrame(loop); }
  let soundOn = false;
  function toggleSound() {
    soundOn = !soundOn;
    if (soundOn) sonic.start(); else sonic.stop();
    const on = soundOn;
    for (const id of ['sound', 'hsound']) { $(id).textContent = on ? 'Sound off' : 'Sound on'; $(id).setAttribute('aria-pressed', String(on)); }
  }
  $('sound').addEventListener('click', toggleSound);
  $('hsound').addEventListener('click', toggleSound);
  function setRunning(r) {
    running = r;
    for (const id of ['run', 'hrun']) $(id).textContent = running ? 'Pause' : 'Run';
  }
  $('hrun').addEventListener('click', () => setRunning(!running));
  function nudgeSpeed(d) {
    const el = $('speed'); el.value = Math.max(0, Math.min(9, +el.value + d)); el.dispatchEvent(new Event('input'));
  }
  $('hslower').addEventListener('click', () => nudgeSpeed(-1));
  $('hfaster').addEventListener('click', () => nudgeSpeed(1));
  $('speed').addEventListener('input', () => { $('hspeed').textContent = $('speedo').textContent; });
  $('hspeed').textContent = $('speedo').textContent;
  // Full screen: the browser's own full screen where allowed, otherwise the box fills the window.
  const theater = $('theater');
  let idleTimer = 0;
  function wake() { theater.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => theater.classList.add('idle'), 2500); }
  function isFull() { return document.fullscreenElement === theater || theater.classList.contains('on'); }
  function enterFull() {
    const fallback = () => theater.classList.add('on');
    try { const p = theater.requestFullscreen ? theater.requestFullscreen() : null; if (p && p.catch) p.catch(fallback); else if (!p) fallback(); }
    catch (e) { fallback(); }
    wake();
  }
  function exitFull() {
    theater.classList.remove('on', 'idle');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  $('full').addEventListener('click', enterFull);
  $('hexit').addEventListener('click', exitFull);
  theater.addEventListener('pointermove', () => { if (isFull()) wake(); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) theater.classList.remove('idle'); });
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, button, textarea, select')) { if (e.key !== 'Escape') return; }
    if (e.key === 'f' || e.key === 'F') { isFull() ? exitFull() : enterFull(); }
    else if (e.key === 'Escape' && theater.classList.contains('on')) exitFull();
    else if (e.key === ' ') { e.preventDefault(); setRunning(!running); if (isFull()) wake(); }
  });
  $('volume').addEventListener('input', () => { const v = $('volume').value / 100; sonic.setVolume(v * v); $('volumeo').textContent = $('volume').value + '%'; });
  sonic.setVolume(0.49); $('volumeo').textContent = '70%';
  $('run').addEventListener('click', () => setRunning(!running));
  $('step').addEventListener('click', () => { setRunning(false); handle(world.step(params)); handle(world.work(params, 3)); });
  $('force').addEventListener('click', () => handle(world.forceEmerge(params)));
  $('reset').addEventListener('click', newWorld);
  const showSize = () => { const [w, h] = SIZES[+$('size').value]; $('sizeo').textContent = `${w} × ${h}`; };
  $('size').addEventListener('input', showSize);
  $('size').addEventListener('change', newWorld);
  showSize();
  $('vlife').addEventListener('click', () => setView('life'));
  $('vmem').addEventListener('click', () => setView('mem'));
  $('markers').addEventListener('click', () => {
    markers = !markers;
    $('markers').classList.toggle('on', markers); $('markers').setAttribute('aria-pressed', String(markers));
  });
  newWorld(); loop();
})();
