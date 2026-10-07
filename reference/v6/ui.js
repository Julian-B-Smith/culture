(() => {
  // Two shapes, five sizes each, with matching cell counts.
  const SHAPES = {
    wide: [[165, 105], [220, 140], [330, 210], [440, 280], [550, 350]],
    square: [[132, 132], [176, 176], [264, 264], [352, 352], [440, 440]],
  };
  let shape = 'wide';
  const sizes = () => SHAPES[shape];
  // Spores: a click on the world releases a new nature there. Spores and forced emergence (E, the
  // Emerge buttons) draw on one budget that recharges in generations, so pausing or slowing the
  // world also stretches the wait (900 gen is about 15 s at 1×). The wait starts when the new law
  // is actually born; a search that finds nothing viable costs nothing.
  const SPORE_COOL = 900;
  let sporeReadyGen = 0, sporePending = null, sporeDenied = -1;
  // The Spores switch. Off: clicks do nothing and E emerges freely, as before spores existed.
  let sporesOn = true, pendingBudgeted = false;
  // Every spore and forced emergence is logged as an input event, so a run can be replayed from
  // its seed: { gen, kind: 'spore' | 'force', x, y }. Read it with window.cultureRun().
  let runLog = [];
  window.cultureRun = () => ({ seed: world.seed, size: [W, H], inputs: runLog.map(e => ({ ...e })) });
  // One-time hint: the first time this browser sees full screen with spores on, the corner says
  // what a click does for a few seconds.
  let hintUntil = 0, hintShown = false;
  try { hintShown = localStorage.getItem('culture.sporeHint') === '1'; } catch (e) {}
  let W = 220, H = 140;
  const $ = id => document.getElementById(id);
  const cv = $('world'), ctx = cv.getContext('2d');
  let img = ctx.createImageData(W, H);
  const fx = $('fx'), fctx = fx.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sonic = new Sonic.Engine();
  let markers = false;
  let touch = false;
  try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) {}
  const replay = new Recorder.Replay({ touch });
  // CRT filter: created on first use; unavailable where WebGL is.
  let crtOn = false, crt = null, recCrt = null, recCrtCanvas = null;
  // With CRT on in full screen, the controls become the television's own on-screen menu.
  const osd = new OSD.Menu();
  let osdDrawn = 0, wokeFromIdle = false, flatOsdAmt = 0;
  // The television menu and hint strip are the controls whenever the world fills the window,
  // CRT or not (from the site, mind-lathe D37). Without the CRT they are drawn flat over the
  // picture (see the frame loop).
  const osdActive = () => isFull();
  // The television menu: a short top level, and sub-menus (marked >) for audio, screen and the
  // automaton's controls. Every sub-menu ends in BACK; Esc, Backspace or Left on a plain row also
  // goes back one level. Sub-menu rows for the world's settings drive the page's own sliders, so
  // the two always agree.
  function slider(id, label) {
    const el = $(id), step = +el.step || 1;
    const nudge = d => { el.value = Math.max(+el.min, Math.min(+el.max, +el.value + d * step)); el.dispatchEvent(new Event('input')); };
    return { label, value: () => $(id + 'o').textContent.replace(' per 10k contacts', '/10K').replace(/×/g, 'X').toUpperCase(),
      dec: () => nudge(-1), inc: () => nudge(1) };
  }
  const BACK = { label: 'BACK', back: true, value: () => '<' };
  const sub = (label, items) => ({ label, value: () => '>', sub: () => [...items(), BACK] });
  const osdItems = () => [
    { label: 'PICTURE', value: () => (running ? 'PLAY' : 'PAUSE'), act: () => setRunning(!running) },
    { label: 'SPEED', value: () => $('speedo').textContent.replace('×', 'X'), dec: () => nudgeSpeed(-1), inc: () => nudgeSpeed(1) },
    { label: 'EMERGE', act: () => forceEmerge() },
    { label: 'NEW WORLD', act: () => { newWorld(); layout(); } },
    { label: 'SPORES', value: () => (sporesOn ? 'ON' : 'OFF'), act: () => setSpores(!sporesOn) },
    { label: 'RECORD', disabled: !replay.supported, act: () => toggleRecord(),
      value: () => replay.keeper ? `REC ${Math.floor(replay.elapsed() / 60)}:${String(Math.floor(replay.elapsed()) % 60).padStart(2, '0')}` : replay.armed ? 'BUFFERING' : 'READY' },
    { label: 'SOUND', value: () => (soundOn ? 'ON' : 'OFF'), act: () => toggleSound() },
    { label: 'VOLUME', bar: () => $('volume').value / 100, dec: () => nudgeVolume(-10), inc: () => nudgeVolume(10) },
    sub('AUDIO', () => [
      { label: 'TIMBRES', value: () => (sonic.timbres ? 'ON' : 'OFF'), act: () => setTimbres(!sonic.timbres) },
      { label: 'DRUMS', value: () => (sonic.rhythm !== false ? 'ON' : 'OFF'), act: () => setRhythm(sonic.rhythm === false) },
      { label: 'VHS AUDIO', value: () => (vhsOn ? 'ON' : 'OFF'), act: () => setVhs(!vhsOn) },
    ]),
    sub('SCREEN', () => [
      { label: 'CRT', value: () => (crtOn ? 'ON' : 'OFF'), act: () => setCrt(!crtOn) },
      { label: 'MASK', value: () => MASKS[crt ? crt.maskType : 1].toUpperCase(), act: () => cycleMask(1), dec: () => cycleMask(-1), inc: () => cycleMask(1) },
      { label: 'FIT', value: () => (fillMode ? 'FILL' : 'FIT'), act: () => $('hfill').click() },
    ]),
    sub('WORLD', () => [
      { label: 'SIZE', value: () => $('hsizeo').textContent.replace('×', 'X'), dec: () => stepSize(-1), inc: () => stepSize(1) },
      slider('crowding', 'CROWDING'), slider('margin', 'RARITY'), slider('patience', 'RECORD LIFE'),
      slider('maxSpeed', 'INVASION'), slider('mutation', 'MUTATION'), slider('spark', 'SPARKS'),
      { label: 'REACTIONS', value: () => (params.reactions ? 'ON' : 'OFF'), act: () => $('reactions').click() },
    ]),
    sub('BORDERS', () => [
      slider('hold', 'CONTACT'), slider('hardness', 'HARDENING'), slider('gain', 'RESISTANCE'),
      slider('forget', 'HARM MEMORY'), slider('noise', 'NOISE'), slider('memory', 'STATS MEMORY'),
    ]),
    { label: 'SCOPES', value: () => '>', act: () => { scopeOn = true; scopePage = 0; openMenu(true); } },
    { label: 'EXIT', act: () => exitFull() },
  ];
  // ── Scopes ──
  // Full-box pages in the menu, drawn like a television's own charts: the lineage, who holds the
  // world over the last minute, surprise against its threshold, and the live audio signal.
  const SCOPE_PAGES = ['LINEAGE', 'TERRITORY', 'SURPRISE', 'SIGNAL'];
  let scopeOn = false, scopePage = 0, hist = [], histAt = 0, histGen = 0;
  // Four samples a second while the world runs (a paused world leaves the charts still): each
  // tier's share of the world, frontier surprise as a share of its threshold, and whether a birth
  // landed since the last sample. One minute is kept.
  function sampleScopes() {
    const t = performance.now();
    if (!running || t - histAt < 250) return;
    histAt = t;
    const n = W * H, thr = world.record * (1 + params.margin);
    hist.push({
      covers: world.tiers.filter(T => T.cells > 0).map(T => [colorOf(T).css, T.cells / n]),
      ratio: thr > 0 && world.frontierAge > world.warm ? world.lastMax / thr : 0,
      birth: world.lastBirth > histGen,
    });
    histGen = world.gen;
    if (hist.length > 240) hist.shift();
  }
  function scopeData() {
    const n = W * H, page = SCOPE_PAGES[scopePage], d = { page, pages: SCOPE_PAGES, index: scopePage };
    if (page === 'LINEAGE') {
      const live = world.tiers.slice().reverse(), gone = world.extinct.slice(-3).reverse();
      d.rows = [...live.map(T => [T, false]), ...gone.map(T => [T, true])].map(([T, dead]) => ({
        name: 'T' + T.idx, rule: Core.ruleStr(T.rule), css: colorOf(T).css, cover: dead ? 0 : T.cells / n, dead,
        state: dead ? 'GONE' : T.dying ? 'RETREAT' : T.idx === world.frontier ? 'FRONTIER' : T.byUser ? 'SPORE' : '',
        cls: (sonic.timbres ? sonic.classOf(T) : 'drone').toUpperCase(),
      }));
    } else if (page === 'TERRITORY' || page === 'SURPRISE') {
      d.hist = hist;
      const thr = world.record * (1 + params.margin);
      d.ratio = thr > 0 && world.frontierAge > world.warm ? world.lastMax / thr : 0;
      d.warm = world.frontierAge <= world.warm;
      d.quiet = (world.gen - world.lastBirth) / world.meanEpoch;
      const R = world.reignTier;
      d.reign = R ? { name: 'T' + R.idx, css: colorOf(R).css, frac: (world.gen - world.reignStart) / world.meanEpoch } : null;
      d.searching = !!world.search;
    } else if (page === 'SIGNAL') {
      const A = sonic.analyser, live = soundOn && running && A && sonic.ctx && sonic.ctx.state === 'running';
      if (live) {
        d.wave = new Float32Array(1024); A.getFloatTimeDomainData(d.wave);
        d.spec = new Uint8Array(A.frequencyBinCount); A.getByteFrequencyData(d.spec);
      }
      d.live = !!live;
      d.bpm = sonic.field ? Math.round(sonic.field.bpm) : null;
      d.voices = sonic.voices ? sonic.voices.size : 0;
      const C = sonic.cond, a = sonic.lastAllow;
      d.drums = sonic.rhythm === false || !sonic.timbres ? 'OFF' : !C ? 'WAIT' : C.phase === 'play'
        ? 'PLAY ' + (a && a.tex ? 'T' : '-') + (a && a.snare ? 'S' : '-') + (a && a.kick ? 'K' : '-') : C.phase.toUpperCase();
      d.vhs = vhsOn; d.rate = sonic.ctx ? sonic.ctx.sampleRate : 48000;
    }
    return d;
  }
  // Where the menu is: the open list, and the levels above it (each with its list, title and row).
  let menuTop = null, menuStack = [], menuTitle = 'CULTURE';
  function enterSub(it) {
    menuStack.push({ list: osdList, sel: osd.sel, title: menuTitle });
    osdList = it.sub(); osd.sel = 0; menuTitle = 'CULTURE / ' + it.label; osdDrawn = 0;
  }
  function menuBack() {
    if (!menuStack.length) { openMenu(false); return; }
    const up = menuStack.pop(); osdList = up.list; osd.sel = up.sel; menuTitle = up.title; osdDrawn = 0;
  }
  function menuHome() { if (menuTop) osdList = menuTop; menuStack = []; menuTitle = 'CULTURE'; osd.sel = 0; scopeOn = false; }
  function scopeTurn(d) { scopePage = (scopePage + d + SCOPE_PAGES.length) % SCOPE_PAGES.length; osdDrawn = 0; }
  let osdList = null, menuOpen = false, menuTimer = 0;
  // Opening title: the logo stays, with a blinking PRESS ENTER (TAP TO START on touch screens),
  // until Enter or a click or tap on the picture itself; buttons such as Full screen leave it in
  // place. It then fades over 1 s. With CRT on it is drawn into the tube; otherwise it lies flat.
  const logo = new Image(); logo.src = LOGO_SRC;
  let logoGone = null; // time the fade began, or null while the logo is held
  const logoAlpha = t => (logoGone === null ? 1 : Math.max(0, 1 - (t - logoGone)));
  // The first dismissal also switches sound on: it is a deliberate gesture, which browsers
  // require before audio may start. Later dismissals (after switching CRT back on) leave sound alone.
  let firstStart = true;
  const dismissLogo = () => {
    if (logoGone !== null) return;
    logoGone = performance.now() / 1000;
    if (firstStart) { firstStart = false; if (!soundOn) toggleSound(); }
  };
  const logoPrompt = touch ? 'TAP TO START' : 'PRESS ENTER';
  let logoJustDismissed = false;
  addEventListener('keydown', e => {
    if (logoGone === null && e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); dismissLogo(); }
  }, { capture: true });
  $('theater').addEventListener('pointerdown', e => {
    if (logoGone === null && !e.target.closest('.hud, button')) { dismissLogo(); logoJustDismissed = true; }
  }, { capture: true });
  // Sound on touch browsers (from the site, mind-lathe D39). The logo's pointerdown starts the
  // sound, but a touch pointerdown is not a user gesture to iOS Safari or to Chrome on a touch
  // screen; only touchend and click are. The context is then created locked and stays silent while
  // SOUND reads ON. So on every tap, click or key, if sound is on, the world is playing and the
  // context is not running (locked, or "interrupted" by iOS after a call or an app switch), resume
  // it inside that gesture. A context paused on purpose is left alone.
  const unlockAudio = () => {
    if (soundOn && running && sonic.ctx && sonic.ctx.state !== 'running') sonic.ctx.resume().catch(() => {});
  };
  for (const ev of ['touchend', 'click', 'keydown']) addEventListener(ev, unlockAudio, { capture: true, passive: true });
  // The menu box opens only on M (or its hint); like a television's, it closes itself after
  // 10 s without input. Mouse movement only brings up the hint strip along the bottom.
  function openMenu(o) {
    if (o !== menuOpen) menuHome();
    menuOpen = o; clearTimeout(menuTimer); osdDrawn = 0;
    if (o && !scopeOn) menuTimer = setTimeout(() => { menuOpen = false; osdDrawn = 0; }, 10000);
  }
  // On touch screens the strip drops the key letters: every entry is a tap target instead.
  const barItems = () => {
    const k = touch ? '' : 'x ';
    return [
      { label: running ? 'PLAY \u25B6' : 'PAUSE \u2759\u2759', reserve: 'PAUSE \u2759\u2759', act: () => setRunning(!running) },
      { label: k.replace('x', 'E') + 'EMERGE', act: () => forceEmerge() },
      { label: k.replace('x', 'R') + (replay.keeper ? 'STOP' : 'REC'), reserve: k.replace('x', 'R') + 'STOP', act: () => toggleRecord(), disabled: !replay.supported },
      { label: k.replace('x', 'S') + (soundOn ? 'SOUND ON' : 'SOUND OFF'), reserve: k.replace('x', 'S') + 'SOUND OFF', act: () => toggleSound() },
      { label: k.replace('x', 'M') + 'MENU', act: () => openMenu(true) },
      { label: k.replace('x', 'F') + 'EXIT', act: () => exitFull() },
    ];
  };
  function nudgeVolume(d) { const el = $('volume'); el.value = Math.max(0, Math.min(100, +el.value + d)); el.dispatchEvent(new Event('input')); }
  function osdRun(it, side) {
    if (!it || it.disabled) return;
    if (it.sub && side !== 'dec') { enterSub(it); wake(); if (menuOpen) openMenu(true); return; }
    if (it.back || (side === 'dec' && !it.dec && menuStack.length)) { menuBack(); wake(); if (menuOpen) openMenu(true); return; }
    if (side === 'dec' && it.dec) it.dec(); else if (side === 'inc' && it.inc) it.inc(); else if (it.act) it.act(); else if (it.inc) it.inc();
    osdDrawn = 0; wake();
    if (menuOpen) openMenu(true);
  }
  // Pointer position on the glass -> position in the menu canvas, through the tube's curvature.
  function osdPoint(e) {
    // Flat view: the CRT canvas is hidden, so measure the world canvas, and skip the curvature.
    const r = (crtOn && crt ? $('crtview') : cv).getBoundingClientRect();
    let lx, ly;
    if (sonic.rotated) { lx = (e.clientY - r.top) / r.height; ly = 1 - (e.clientX - r.left) / r.width; }
    else { lx = (e.clientX - r.left) / r.width; ly = (e.clientY - r.top) / r.height; }
    const [ux, uy] = crtOn && crt ? CRT.curve(lx, 1 - ly) : [lx, 1 - ly];
    return [ux * osd.canvas.width, (1 - uy) * osd.canvas.height];
  }
  // If the GPU drops the CRT's context, swap in a fresh canvas and rebuild on the next frame
  // instead of leaving a frozen picture on screen.
  function resetCrt() {
    const old = $('crtview'), fresh = old.cloneNode(false);
    old.replaceWith(fresh); crt = null;
    if (crtOn) { crt = CRT.create(fresh); if (!crt) setCrt(false); }
  }
  function setCrt(on) {
    if (on && !crt) crt = CRT.create($('crtview'));
    // Switching the set on shows the logo again, like a television's power-on splash.
    if (on && !crtOn) logoGone = null;
    crtOn = on && !!crt;
    $('crtview').hidden = !crtOn;
    $('mask').hidden = !crtOn;
    cv.style.visibility = crtOn ? 'hidden' : '';
    for (const id of ['crt', 'hcrt']) {
      $(id).setAttribute('aria-pressed', String(crtOn));
      if (on && !crt) { $(id).disabled = true; $(id).title = 'This browser has no WebGL, which the CRT filter needs.'; }
    }
  }
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
    [W, H] = sizes()[+$('size').value];
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; img = ctx.createImageData(W, H); }
    if (fx.width !== W * 5 || fx.height !== H * 5) { fx.width = W * 5; fx.height = H * 5; }
    if (typeof layout === 'function') layout();
    if (replay) replay.setShape(W === H);
    world = new Core.World(W, H, (Math.random() * 2 ** 32) >>> 0);
    hist = []; histGen = 0; stepMs = 0; capAt = 0; $('speed').max = 9; // re-learn the speed limit for the new size
    sporeReadyGen = 0; sporePending = null; runLog = [];
    rings = []; palette = {}; births = 0; sonic.reset(); renderLedger();
  }
  function handle(ev) {
    if (!ev || ev.searching) return;
    sonic.event(ev, world, params);
    if (ev.tier !== undefined) { const T = world.tiers[ev.tier]; rings.push({ x: ev.x, y: ev.y, t: 0, c: colorOf(T).css, spark: !!T.parents, mutant: T.mutatedFrom != null }); }
    renderLedger();
  }
  // Forced emergence (E, the Emerge buttons, the menu). Where an emergence budget exists, it draws on it.
  function forceEmerge() {
    if (typeof spend === 'function') return spend(() => world.forceEmerge(params), 'force');
    handle(world.forceEmerge(params));
  }
  let stepAcc = 0;
  function tick() {
    // Fractional speeds step the world every second or fourth frame.
    stepAcc += params.speed;
    // Large worlds can't always keep up with high speeds; cap the work per frame so the page stays responsive.
    const t0 = performance.now();
    while (stepAcc >= 1) {
      stepAcc -= 1;
      const s0 = performance.now(); handle(world.step(params)); noteStep(performance.now() - s0);
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
    if (crtOn && crt) {
      const t = performance.now() / 1000;
      crt.glitchAmt = 0;
      // On-screen menu: fades with the controls, redrawn about 15 times a second while showing.
      const la = logoAlpha(t);
      const showing = la > 0 || (osdActive() && (menuOpen || !theater.classList.contains('idle')));
      theater.classList.toggle('osd', osdActive());
      crt.osdAmt += ((showing ? 1 : 0) - crt.osdAmt) * 0.25;
      if (la > 0) osdDrawn = Math.min(osdDrawn, t - 0.05); // keep redrawing while the logo shows (fade, blinking prompt)
      if (crt.osdAmt > 0.01 && t - osdDrawn > 0.066) {
        osdList = osdList || (menuTop = osdItems());
        osd.resize(W, H); osd.rot = sonic.rotated;
        const status = { big: 'CH 00', line: `GEN ${String(world.gen).padStart(6, '0')}`, recOn: !!replay.keeper };
        status.spore = sporesOn ? sporeLabel() : null;
        osd.draw(osdList, status, { menu: osdActive() && menuOpen, title: menuTitle, scope: osdActive() && menuOpen && scopeOn ? scopeData() : null, pitch: osd.canvas.width / W, bar: osdActive() && logoGone !== null ? barItems() : null, touch,
          logo: la > 0 ? { img: logo, alpha: la, prompt: logoGone === null ? logoPrompt : null, pitch: osd.canvas.width / W } : null });
        crt.setOsd(osd.canvas); if (recCrt) recCrt.setOsd(osd.canvas); osdDrawn = t;
      }
      crt.render(cv, t);
      if (crt.lost) resetCrt();
    }
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
    {
      const la = logoAlpha(performance.now() / 1000);
      if (la > 0 && !(crtOn && crt)) {
        fctx.save();
        if (sonic.rotated) { fctx.translate(fx.width / 2, fx.height / 2); fctx.rotate(-Math.PI / 2); fctx.translate(-fx.height / 2, -fx.width / 2); OSD.Menu.drawLogo(fctx, logo, la, fx.height, fx.width, logoGone === null ? logoPrompt : null, fx.width / W); }
        else OSD.Menu.drawLogo(fctx, logo, la, fx.width, fx.height, logoGone === null ? logoPrompt : null, fx.width / W);
        fctx.restore();
      }
    }
    // Without the CRT, the same menu and strip, drawn flat over the picture: same fade, redraw rate
    // and items as the CRT branch above. The logo is drawn flat just above, so it isn't passed.
    if (!(crtOn && crt)) {
      const t = performance.now() / 1000;
      const showing = osdActive() && (menuOpen || !theater.classList.contains('idle'));
      theater.classList.toggle('osd', osdActive());
      flatOsdAmt += ((showing ? 1 : 0) - flatOsdAmt) * 0.25;
      if (flatOsdAmt > 0.01) {
        if (t - osdDrawn > 0.066) {
          osdList = osdList || (menuTop = osdItems());
          osd.resize(W, H); osd.rot = sonic.rotated;
          const status = { big: 'CH 00', line: `GEN ${String(world.gen).padStart(6, '0')}`, recOn: !!replay.keeper };
          status.spore = sporesOn ? sporeLabel() : null;
          osd.draw(osdList, status, { menu: osdActive() && menuOpen, title: menuTitle, scope: osdActive() && menuOpen && scopeOn ? scopeData() : null, pitch: osd.canvas.width / W, bar: osdActive() && logoGone !== null ? barItems() : null, touch, logo: null });
          osdDrawn = t;
        }
        // (An open menu dims the picture: the menu canvas itself carries the dimming, as in the tube.)
        fctx.globalAlpha = flatOsdAmt; fctx.imageSmoothingEnabled = true;
        fctx.drawImage(osd.canvas, 0, 0, fx.width, fx.height);
        fctx.globalAlpha = 1;
      }
    }
    if (markers && world.search) {
      const S = world.search;
      fctx.setLineDash([4, 4]); fctx.strokeStyle = 'rgba(242,184,75,0.85)'; fctx.lineWidth = 1.5;
      fctx.beginPath(); fctx.arc((S.cx + 0.5) * sx, (S.cy + 0.5) * sy, 7 * sx, 0, Math.PI * 2); fctx.stroke();
      fctx.setLineDash([]);
    }
    // Recorder copy of exactly what is on screen (CRT included, markers if shown).
    if (replay.busy) {
      replay.tick(sonic.recordStream());
      // With CRT on, the recording gets its own tube rendered at the recording's full size, rather
      // than a stretched copy of the on-screen picture.
      if (crtOn && crt) {
        if (!recCrt) { recCrtCanvas = document.createElement('canvas'); recCrt = CRT.create(recCrtCanvas); if (recCrt) recCrt.setOsd(osd.canvas); }
        if (recCrt) {
          recCrt.maskType = crt.maskType; recCrt.osdAmt = crt.osdAmt; recCrt.glitchAmt = crt.glitchAmt;
          recCrt.render(cv, performance.now() / 1000, replay.canvas.width, replay.canvas.height);
        }
      }
      replay.frame(crtOn && crt ? (recCrt ? recCrtCanvas : $('crtview')) : cv, crtOn && !!crt, markers ? fx : null);
    }
    if (replay.keeper) {
      const t = Math.floor(replay.elapsed()), lab = `Stop ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if ($('rec').textContent !== lab) { $('rec').textContent = lab; $('hrec').textContent = '■ ' + lab.slice(5); $('rectime').textContent = lab.slice(5); }
    }
    $('recdot').hidden = !replay.keeper;
    if (sporePending !== null && !world.search) {
      if (world.tiers.length > sporePending) {
        // The new tier is the last one (searches never overlap). Mark it as made by a person,
        // so the drum conductor counts only the world's own emergences.
        world.tiers[world.tiers.length - 1].byUser = true;
        if (pendingBudgeted) sporeReadyGen = world.gen + SPORE_COOL;
      }
      sporePending = null;
    }
    if (sporesOn && !hintShown && isFull() && logoGone !== null) {
      hintShown = true; hintUntil = performance.now() + 7000;
      try { localStorage.setItem('culture.sporeHint', '1'); } catch (e) {}
    }
    {
      // Full screen without CRT: a badge in the top-left corner that fades with the controls.
      // On the page: a line under the world. (With CRT in full screen, the OSD draws it.)
      const lab = sporeLabel(), full = isFull();
      if (!sporesOn) { $('sporedot').hidden = true; const off = '<span class="sl-idle">Spores off: clicks do nothing, and E emerges freely.</span>'; if ($('sporeline').innerHTML !== off) $('sporeline').innerHTML = off; }
      else {
      const blocks = lab.frac !== undefined ? ' <span class="sbar">' + Array.from({ length: 8 }, (_, k) => k < Math.floor(lab.frac * 8) ? '<i class="on"></i>' : '<i></i>').join('') + '</span>' : '';
      const pd = $('sporedot');
      pd.hidden = !full || osdActive() || logoGone === null;
      if (!pd.hidden) {
        const html = lab.text + blocks;
        if (pd.innerHTML !== html) pd.innerHTML = html;
        pd.classList.toggle('warn', !!lab.warn); pd.classList.toggle('below', !!replay.keeper);
      }
      const sl = $('sporeline'), page = { 'SPORE READY': 'Spore ready: click or tap the world to release a new law there.',
        'GERMINATING\u2026': 'Spore germinating\u2026', 'SPORE WAIT': 'Spore waiting for the current emergence to settle.',
        'NOT READY': 'Not ready yet.', 'SPORE': 'Spore recharging' }[lab.text] ?? 'Spore ready: click or tap the world to release a new law there.';
      const html = '<span class="sl-' + (lab.warn ? 'warn' : lab.ready ? 'ready' : 'idle') + '">' + page + '</span>' + blocks;
      if (sl.innerHTML !== html) sl.innerHTML = html;
      }
    }
    $('gen').textContent = world.gen.toLocaleString();
    $('ftier').textContent = world.frontier;
    $('fage').textContent = world.frontierAge.toLocaleString();
    $('fext').textContent = world.extinct.length;
    $('factive').textContent = world.active;
    $('hgen').textContent = world.gen.toLocaleString(); $('htier').textContent = world.frontier;
    sampleScopes();
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
      if (sonic.timbres) el.querySelector('.meta').textContent += ` · sounds ${sonic.classOf(T)}`;
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
    if (soundOn && !running) syncPauseAudio(true); // switched on while paused: silent until play
    const on = soundOn;
    for (const id of ['sound', 'hsound']) { $(id).textContent = on ? 'Sound off' : 'Sound on'; $(id).setAttribute('aria-pressed', String(on)); }
  }
  $('sound').addEventListener('click', toggleSound);
  // VHS audio: the tape chain on the mix (wow and flutter, band limits, saturation, hiss and hum).
  // Its own switch, independent of the CRT picture; on by default. Key: V.
  let vhsOn = true;
  function setVhs(on) {
    vhsOn = on; sonic.setTape(on);
    $('vhs').textContent = on ? 'VHS audio: on' : 'VHS audio: off'; $('vhs').setAttribute('aria-pressed', String(on));
    osdDrawn = 0;
  }
  $('vhs').addEventListener('click', () => setVhs(!vhsOn));
  setVhs(true);
  function setTimbres(on) {
    sonic.setTimbres(on);
    $('timbres').textContent = on ? 'Timbres: on' : 'Timbres: off'; $('timbres').setAttribute('aria-pressed', String(on));
    renderLedger();
  }
  $('timbres').addEventListener('click', () => setTimbres(!sonic.timbres));
  function setRhythm(on) {
    sonic.setRhythm(on);
    $('rhythm').textContent = on ? 'Drums: on' : 'Drums: off'; $('rhythm').setAttribute('aria-pressed', String(on));
    $('hdrums').textContent = on ? 'Drums on' : 'Drums off'; $('hdrums').setAttribute('aria-pressed', String(on));
    osdDrawn = 0;
  }
  $('rhythm').addEventListener('click', () => setRhythm(sonic.rhythm === false));
  $('hdrums').addEventListener('click', () => { setRhythm(sonic.rhythm === false); wake(); });
  $('hsound').addEventListener('click', toggleSound);
  // Pausing halts the sound as well as the world (from the site, mind-lathe D38): a short fade,
  // then the audio clock is suspended. Every part (drums, arpeggios, bells) is scheduled against
  // that clock with a short lookahead, so it freezes with it and picks up where it was on resume,
  // instead of releasing a burst of queued notes. Sound stays "on" while paused.
  let pauseFade = 0;
  function syncPauseAudio(instant) {
    if (!soundOn || !sonic.ctx || !sonic.master) return;
    const g = sonic.master.gain, now = sonic.ctx.currentTime;
    clearTimeout(pauseFade); g.cancelScheduledValues(now);
    if (running) { sonic.start(); g.setValueAtTime(g.value, now); g.setTargetAtTime(sonic.volume, now, 0.05); }
    else if (instant) { g.setValueAtTime(0, now); sonic.stop(); }
    else { g.setTargetAtTime(0, now, 0.03); pauseFade = setTimeout(() => { if (!running) sonic.stop(); }, 200); }
  }
  function setRunning(r) {
    running = r;
    syncPauseAudio(false);
    for (const id of ['run', 'hrun']) $(id).textContent = running ? 'Pause' : 'Run';
  }
  $('hrun').addEventListener('click', () => setRunning(!running));
  function nudgeSpeed(d) {
    const el = $('speed'); el.value = Math.max(0, Math.min(+el.max, +el.value + d)); wantSpeed = +el.value; el.dispatchEvent(new Event('input'));
  }
  // The speed asked for, kept separately from the speed allowed, so a limit lifted later (a smaller
  // world) brings the asked-for speed back.
  let wantSpeed = +$('speed').value;
  $('speed').addEventListener('input', e => { if (e.isTrusted) wantSpeed = +$('speed').value; });
  // Speed limit. A generation's cost grows with the world (about 2 ms at 165×105, 20 ms or more at
  // 550×350 on a laptop), so the fastest real speed depends on the size and the device. The page
  // times its own generations and offers only the speeds it can keep up with while leaving room to
  // draw: about 14 ms of simulation per frame. 1× always stays available; a world too big for 1×
  // simply runs slower than real time.
  let stepMs = 0, capAt = 0;
  function noteStep(ms) {
    stepMs = stepMs ? stepMs + (ms - stepMs) * 0.05 : ms;
    const t = performance.now();
    if (t - capAt < 1000) return;
    capAt = t;
    const el = $('speed'), perFrame = 14 / stepMs;
    let cap = 2; // index of 1×
    for (let i = 0; i < SPEEDS.length; i++) if (SPEEDS[i] <= Math.max(1, perFrame)) cap = Math.max(cap, i);
    if (+el.max !== cap) { el.max = cap; el.title = `Fastest this world runs here: ${SPEEDS[cap]}×`; osdDrawn = 0; }
    const target = Math.min(wantSpeed, cap);
    if (+el.value !== target) { el.value = target; el.dispatchEvent(new Event('input')); }
  }
  $('hslower').addEventListener('click', () => nudgeSpeed(-1));
  $('hfaster').addEventListener('click', () => nudgeSpeed(1));
  $('speed').addEventListener('input', () => { $('hspeed').textContent = $('speedo').textContent; });
  $('hspeed').textContent = $('speedo').textContent;
  // Full screen: the browser's own full screen where allowed, otherwise the box fills the window.
  const theater = $('theater');
  let idleTimer = 0;
  function wake() {
    theater.classList.remove('idle'); clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (isFull()) theater.classList.add('idle'); }, 2500);
  }
  // The box is always laid out by the 'on' class. Browser full screen, where allowed, is requested
  // for the whole page rather than for the box itself, which keeps the WebGL canvas out of the
  // browser's special full-screen layer and lets exit restore the page cleanly.
  let apiFull = false;
  function isFull() { return theater.classList.contains('on'); }
  // In full screen the box is sized to the screen. On a portrait screen it turns 90° so the world's
  // long side runs along the screen's long side. Fit shows the whole world; Fill covers the screen
  // and crops the edges of the torus.
  const box = theater.querySelector('.canvas-box');
  let fillMode = false;
  function layout() {
    if (!isFull()) { box.style.cssText = `aspect-ratio:${W} / ${H};width:min(100%, calc(78vh * ${W} / ${H}))`; sonic.rotated = false; return; }
    const vw = theater.clientWidth, vh = theater.clientHeight, a = W / H;
    const rot = vh > vw && W > H;
    const sw = rot ? vh : vw, sh = rot ? vw : vh;
    const w = (fillMode ? Math.max : Math.min)(sw, sh * a), h = w / a;
    box.style.cssText = `position:absolute;left:50%;top:50%;width:${w}px;height:${h}px;max-width:none;aspect-ratio:auto;` +
      `border:0;border-radius:0;transform:translate(-50%,-50%)${rot ? ' rotate(90deg)' : ''}`;
    sonic.rotated = rot;
  }
  addEventListener('resize', layout);
  addEventListener('orientationchange', () => setTimeout(layout, 250));
  $('hfill').addEventListener('click', () => {
    fillMode = !fillMode;
    $('hfill').textContent = fillMode ? 'Fit' : 'Fill';
    $('hfill').setAttribute('aria-label', fillMode ? 'Show the whole world' : 'Fill the screen');
    layout();
  });
  function enterFull() {
    theater.classList.add('on');
    layout(); wake();
    // iPhone browsers have no page full screen; there the box simply fills the window.
    const root = document.documentElement;
    try {
      const p = root.requestFullscreen ? root.requestFullscreen() : null;
      if (p && p.then) p.then(() => { apiFull = true; layout(); }, () => {});
    } catch (e) {}
  }
  function exitFull() {
    clearTimeout(idleTimer);
    if (crt && crtOn) $('crtview').width = 1; // rebuild the CRT buffer at the new size right away
    theater.classList.remove('on', 'idle');
    layout();
    if (document.fullscreenElement) { apiFull = false; document.exitFullscreen().catch(() => {}); }
  }
  $('full').addEventListener('click', enterFull);
  $('hexit').addEventListener('click', exitFull);
  // Capture: an optional rolling buffer, and Record/Stop. Saving goes through the viewer's
  // download prompt; where that isn't available the finished clip is shown to save by hand.
  function setBuffer(on) {
    replay.arm(on);
    $('buffer').setAttribute('aria-pressed', String(on));
    $('rechint').textContent = on
      ? 'Holding the last 15–20 seconds. Record starts from that far back.'
      : 'Record starts from now. Turn on "Keep last 15 s" to start from 15–20 seconds earlier.';
  }
  async function toggleRecord() {
    if (!replay.keeper) {
      const back = replay.start(sonic.recordStream());
      $('rec').classList.add('live'); $('hrec').classList.add('live');
      $('rechint').textContent = back >= 1 ? `Recording, including ${Math.round(back)} s from before you pressed Record.` : 'Recording.';
      return;
    }
    $('rec').disabled = $('hrec').disabled = true;
    const blob = await replay.stop();
    $('rec').disabled = $('hrec').disabled = false;
    $('rec').classList.remove('live'); $('hrec').classList.remove('live');
    $('rec').textContent = 'Record'; $('hrec').textContent = '● Rec';
    setBuffer($('buffer').getAttribute('aria-pressed') === 'true');
    if (blob && blob.size) offerClip(blob);
  }
  async function offerClip(blob) {
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const filename = `culture-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.${replay.ext}`;
    const mb = (blob.size / 1048576).toFixed(1);
    let downloads = null;
    try { downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) {}
    if (downloads) {
      try { await downloads.save({ filename, data: blob }); $('rechint').textContent = `Saved ${filename} (${mb} MB).`; return; }
      catch (e) {
        if (e && e.code === 'declined') { $('rechint').textContent = 'Not saved.'; return; }
      }
    }
    // Outside the Claude viewer (e.g. on your own site) an ordinary download link works.
    if (!(window.claude && window.claude.use)) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      $('rechint').textContent = `Saved ${filename} (${mb} MB).`;
      return;
    }
    // Fallback: show the clip so it can be saved from the video's own menu.
    const v = $('clip'); v.src = URL.createObjectURL(blob); $('clipwrap').hidden = false;
    $('rechint').textContent = `Clip ready (${mb} MB). Saving isn't available in this view; use the video's menu to save it.`;
  }
  if (!replay.supported) {
    for (const id of ['buffer', 'rec', 'hrec']) $(id).disabled = true;
    $('rechint').textContent = 'This browser cannot record video from the page.';
  } else {
    replay.setShape(W === H);
    setBuffer(false);
  }
  $('buffer').addEventListener('click', () => setBuffer($('buffer').getAttribute('aria-pressed') !== 'true'));
  $('rec').addEventListener('click', toggleRecord);
  $('hrec').addEventListener('click', () => { toggleRecord(); wake(); });
  $('clipclose').addEventListener('click', () => { $('clipwrap').hidden = true; URL.revokeObjectURL($('clip').src); $('clip').removeAttribute('src'); });
  $('crt').addEventListener('click', () => setCrt(!crtOn));
  const MASKS = ['Grille', 'Slot', 'Dots'];
  function cycleMask(d) {
    if (!crt) return;
    crt.maskType = (crt.maskType + d + 3) % 3;
    $('mask').textContent = 'Mask: ' + MASKS[crt.maskType];
  }
  $('mask').addEventListener('click', () => cycleMask(1));
  $('hcrt').addEventListener('click', () => { setCrt(!crtOn); wake(); });
  function stepSize(d) {
    const el = $('size'), v = Math.max(0, Math.min(4, +el.value + d));
    if (v === +el.value) return;
    el.value = v; showSize(); newWorld(); wake();
  }
  $('hsizedown').addEventListener('click', () => stepSize(-1));
  $('hsizeup').addEventListener('click', () => stepSize(1));
  $('hforce').addEventListener('click', () => { forceEmerge(); wake(); });
  $('hreset').addEventListener('click', () => { newWorld(); layout(); wake(); });
  theater.addEventListener('pointermove', () => { if (isFull()) wake(); });
  theater.addEventListener('pointerdown', () => {
    wokeFromIdle = theater.classList.contains('idle');
    if (isFull()) wake(); // a tap brings the controls back on touch screens
  });
  // On-screen menu: hover selects, a click or tap acts (left or right half of a value adjusts).
  theater.addEventListener('pointermove', e => {
    if (!osdActive() || !menuOpen || e.pointerType === 'touch') return;
    const h = osd.hit(...osdPoint(e));
    if (h && h.i !== osd.sel) { osd.sel = h.i; osdDrawn = 0; }
  });
  theater.addEventListener('click', e => {
    if (logoJustDismissed) { logoJustDismissed = false; e.cultureSkip = true; return; } // that click only dismissed the logo
    if (!osdActive() || e.target.closest('.hud')) return;
    const pt = osdPoint(e);
    if (menuOpen && scopeOn) {
      const k = osd.hitScope(...pt);
      if (k === 'back') { scopeOn = false; openMenu(true); } else if (k === 'prev') scopeTurn(-1); else if (k === 'next') scopeTurn(1);
      wake(); return;
    }
    if (menuOpen) {
      const h = osd.hit(...pt);
      if (h) { osd.sel = h.i; osdRun(osdList[h.i], h.side); } else openMenu(false); // a click outside the box closes it
      return;
    }
    if (wokeFromIdle) return; // that tap only brought the strip back
    const b = osd.hitBar(...pt);
    if (b && !b.disabled) { b.act(); osdDrawn = 0; return; }
    sporeAt(e);
  });
  // A click on the world, anywhere the controls aren't, releases a spore there. The CRT path in
  // full screen is handled above, after the menu and hint strip have had their chance; this one
  // covers the flat view and the page outside full screen.
  theater.addEventListener('click', e => {
    if (e.cultureSkip || osdActive() || e.target.closest('.hud, button')) return;
    if (logoGone === null || (isFull() && wokeFromIdle)) return;
    sporeAt(e);
  });
  // Pointer -> world cell, undoing the portrait rotation and (with CRT on) the tube's curvature.
  function cellAt(e) {
    const el = crtOn && crt ? $('crtview') : cv, r = el.getBoundingClientRect();
    let lx, ly;
    if (sonic.rotated) { lx = (e.clientY - r.top) / r.height; ly = 1 - (e.clientX - r.left) / r.width; }
    else { lx = (e.clientX - r.left) / r.width; ly = (e.clientY - r.top) / r.height; }
    if (crtOn && crt) { const [ux, uy] = CRT.curve(lx, 1 - ly); lx = ux; ly = 1 - uy; }
    if (lx < 0 || lx >= 1 || ly < 0 || ly >= 1) return null;
    return [Math.floor(lx * W), Math.floor(ly * H)];
  }
  // Spends the shared budget on an emergence (a spore or a forced one). A refusal flashes NOT READY.
  // With the Spores switch off there is no budget, so forced emergence is free again.
  function spend(fn, kind) {
    const ev = !sporesOn || sporeState().ready ? fn() : null;
    if (ev) {
      sporePending = world.tiers.length; pendingBudgeted = sporesOn;
      runLog.push({ gen: ev.gen, kind, x: ev.x, y: ev.y });
      handle(ev);
    } else if (sporesOn) sporeDenied = performance.now();
    osdDrawn = 0;
  }
  function sporeAt(e) {
    if (!sporesOn) return;
    const c = cellAt(e);
    if (c) spend(() => world.emergeAt(c[0], c[1], params), 'spore');
  }
  function setSpores(on) {
    sporesOn = on;
    $('spores').textContent = on ? 'Spores: on' : 'Spores: off'; $('spores').setAttribute('aria-pressed', String(on));
    osdDrawn = 0;
  }
  $('spores').addEventListener('click', () => setSpores(!sporesOn));
  // ready: an emergence can be spent now. frac: how far through the recharge (1 = full).
  // busy: a rule search or retreat is under way (natural or spent), which blocks spending.
  function sporeState() {
    if (sporePending !== null) return { ready: false, frac: 1, busy: true, pending: true };
    if (world.gen < sporeReadyGen) return { ready: false, frac: 1 - (sporeReadyGen - world.gen) / SPORE_COOL, busy: false };
    if (world.search || world.retreat) return { ready: false, frac: 1, busy: true };
    return { ready: true, frac: 1, busy: false };
  }
  // VCR-style readout: SPORE READY; SPORE with eight blocks filling from hollow to solid while it
  // recharges; GERMINATING… while a spent emergence searches for its rule; SPORE WAIT while the
  // world's own search or a retreat runs. A refused click or E flashes NOT READY for a second.
  function sporeLabel() {
    if (performance.now() < hintUntil) return { text: (touch ? 'TAP' : 'CLICK') + ' THE WORLD TO RELEASE A SPORE', ready: true, hint: true };
    const st = sporeState();
    if (performance.now() - sporeDenied < 1000 && !st.ready) return { text: 'NOT READY', warn: true };
    if (st.ready) return { text: 'SPORE READY', ready: true };
    if (st.busy) return { text: st.pending ? 'GERMINATING\u2026' : 'SPORE WAIT' };
    return { text: 'SPORE', frac: st.frac };
  }
  // Leaving browser full screen by its own means (Esc, the system button) also leaves our view.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && apiFull) { apiFull = false; exitFull(); }
    else layout();
  });
  document.addEventListener('keydown', e => {
    // E emerges, R starts or stops recording, S switches sound. None of them wakes the controls or the on-screen menu,
    // so they can be used mid-take without anything appearing on screen.
    const typing = e.target.closest && e.target.closest('textarea, select, input:not([type=range])');
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); forceEmerge(); return; }
      if ((e.key === 'r' || e.key === 'R') && replay.supported) { e.preventDefault(); toggleRecord(); return; }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleSound(); osdDrawn = 0; return; }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setRhythm(sonic.rhythm === false); return; }
      if (e.key === 'v' || e.key === 'V') { e.preventDefault(); setVhs(!vhsOn); return; }
    }
    if (osdActive() && !typing && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); openMenu(!menuOpen); return; }
    if (osdActive() && menuOpen && scopeOn && ['ArrowLeft', 'ArrowRight', 'Escape', 'Backspace', 'Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); wake();
      if (e.key === 'ArrowLeft') scopeTurn(-1); else if (e.key === 'ArrowRight') scopeTurn(1);
      else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Enter') { scopeOn = false; openMenu(true); }
      return;
    }
    if (osdActive() && menuOpen && (e.key === 'Escape' || e.key === 'Backspace')) { e.preventDefault(); menuBack(); if (menuOpen) openMenu(true); return; }
    if (osdActive() && menuOpen && osdList && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
      e.preventDefault(); wake(); osdDrawn = 0;
      const n = osdList.length, it = osdList[osd.sel];
      if (e.key === 'ArrowUp') osd.sel = (osd.sel + n - 1) % n;
      else if (e.key === 'ArrowDown') osd.sel = (osd.sel + 1) % n;
      else osdRun(it, e.key === 'ArrowLeft' ? 'dec' : e.key === 'ArrowRight' ? 'inc' : null);
      return;
    }
    if (e.target.closest && e.target.closest('input, button, textarea, select')) { if (e.key !== 'Escape') return; }
    if (e.key === 'f' || e.key === 'F') { isFull() ? exitFull() : enterFull(); }
    else if (e.key === 'Escape' && isFull()) exitFull();
    else if (e.key === ' ') { e.preventDefault(); setRunning(!running); if (isFull()) wake(); }
  });
  $('volume').addEventListener('input', () => { const v = $('volume').value / 100; sonic.setVolume(v * v); $('volumeo').textContent = $('volume').value + '%'; });
  sonic.setVolume(0.49); $('volumeo').textContent = '70%';
  $('run').addEventListener('click', () => setRunning(!running));
  $('step').addEventListener('click', () => { setRunning(false); handle(world.step(params)); handle(world.work(params, 3)); });
  $('force').addEventListener('click', () => forceEmerge());
  $('reset').addEventListener('click', newWorld);
  const showSize = () => {
    const [w, h] = sizes()[+$('size').value];
    $('sizeo').textContent = `${w} × ${h}`; $('hsizeo').textContent = `${w}×${h}`;
    $('hsizedown').disabled = +$('size').value === 0; $('hsizeup').disabled = +$('size').value === 4;
  };
  function setShape(s) {
    shape = s;
    for (const [id, v] of [['shapeWide', 'wide'], ['shapeSquare', 'square']]) $(id).setAttribute('aria-pressed', String(v === s));
    showSize(); newWorld();
  }
  $('shapeWide').addEventListener('click', () => { if (shape !== 'wide') setShape('wide'); });
  $('shapeSquare').addEventListener('click', () => { if (shape !== 'square') setShape('square'); });
  $('size').addEventListener('input', showSize);
  $('size').addEventListener('change', newWorld);
  showSize();
  $('vlife').addEventListener('click', () => setView('life'));
  $('vmem').addEventListener('click', () => setView('mem'));
  $('markers').addEventListener('click', () => {
    markers = !markers;
    $('markers').classList.toggle('on', markers); $('markers').setAttribute('aria-pressed', String(markers));
  });
  newWorld();
  // CRT on for computers, off on touch devices, where the tube aliases on small screens and is heavy
  // for a phone's GPU (from the site, mind-lathe D36). Browsers without WebGL fall back to flat.
  setCrt(!touch);
  loop();
})();
