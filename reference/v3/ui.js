(() => {
  // Two shapes, five sizes each, with matching cell counts.
  const SHAPES = {
    wide: [[165, 105], [220, 140], [330, 210], [440, 280], [550, 350]],
    square: [[132, 132], [176, 176], [264, 264], [352, 352], [440, 440]],
  };
  let shape = 'wide';
  const sizes = () => SHAPES[shape];
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
  let crtOn = false, crt = null;
  // With CRT on in full screen, the controls become the television's own on-screen menu.
  const osd = new OSD.Menu();
  let osdDrawn = 0, wokeFromIdle = false;
  const osdActive = () => crtOn && !!crt && isFull();
  const osdItems = () => [
    { label: 'PICTURE', value: () => (running ? 'PLAY' : 'PAUSE'), act: () => setRunning(!running) },
    { label: 'SPEED', value: () => $('speedo').textContent.replace('×', 'X'), dec: () => nudgeSpeed(-1), inc: () => nudgeSpeed(1) },
    { label: 'SIZE', value: () => $('hsizeo').textContent.replace('×', 'X'), dec: () => stepSize(-1), inc: () => stepSize(1) },
    { label: 'EMERGE', act: () => handle(world.forceEmerge(params)) },
    { label: 'NEW WORLD', act: () => { newWorld(); layout(); } },
    { label: 'RECORD', disabled: !replay.supported, act: () => toggleRecord(),
      value: () => replay.keeper ? `REC ${Math.floor(replay.elapsed() / 60)}:${String(Math.floor(replay.elapsed()) % 60).padStart(2, '0')}` : replay.armed ? 'BUFFERING' : 'READY' },
    { label: 'SOUND', value: () => (soundOn ? 'ON' : 'OFF'), act: () => toggleSound() },
    { label: 'VOLUME', bar: () => $('volume').value / 100, dec: () => nudgeVolume(-10), inc: () => nudgeVolume(10) },
    { label: 'MASK', value: () => MASKS[crt ? crt.maskType : 1].toUpperCase(), act: () => cycleMask(1), dec: () => cycleMask(-1), inc: () => cycleMask(1) },
    { label: 'SCREEN', value: () => (fillMode ? 'FILL' : 'FIT'), act: () => $('hfill').click() },
    { label: 'CRT', value: () => 'ON', act: () => setCrt(false) },
    { label: 'EXIT', act: () => exitFull() },
  ];
  let osdList = null, menuOpen = false, menuTimer = 0;
  // The menu box opens only on M (or its hint); like a television's, it closes itself after
  // 10 s without input. Mouse movement only brings up the hint strip along the bottom.
  function openMenu(o) {
    menuOpen = o; clearTimeout(menuTimer); osdDrawn = 0;
    if (o) menuTimer = setTimeout(() => { menuOpen = false; osdDrawn = 0; }, 10000);
  }
  // On touch screens the strip drops the key letters: every entry is a tap target instead.
  const barItems = () => {
    const k = touch ? '' : 'x ';
    return [
      { label: running ? 'PLAY \u25B6' : 'PAUSE \u2759\u2759', reserve: 'PAUSE \u2759\u2759', act: () => setRunning(!running) },
      { label: k.replace('x', 'E') + 'EMERGE', act: () => handle(world.forceEmerge(params)) },
      { label: k.replace('x', 'R') + (replay.keeper ? 'STOP' : 'REC'), reserve: k.replace('x', 'R') + 'STOP', act: () => toggleRecord(), disabled: !replay.supported },
      { label: k.replace('x', 'S') + (soundOn ? 'SOUND ON' : 'SOUND OFF'), reserve: k.replace('x', 'S') + 'SOUND OFF', act: () => toggleSound() },
      { label: k.replace('x', 'M') + 'MENU', act: () => openMenu(true) },
      { label: k.replace('x', 'F') + 'EXIT', act: () => exitFull() },
    ];
  };
  function nudgeVolume(d) { const el = $('volume'); el.value = Math.max(0, Math.min(100, +el.value + d)); el.dispatchEvent(new Event('input')); }
  function osdRun(it, side) {
    if (!it || it.disabled) return;
    if (side === 'dec' && it.dec) it.dec(); else if (side === 'inc' && it.inc) it.inc(); else if (it.act) it.act(); else if (it.inc) it.inc();
    osdDrawn = 0; wake();
    if (menuOpen) openMenu(true);
  }
  // Pointer position on the glass -> position in the menu canvas, through the tube's curvature.
  function osdPoint(e) {
    const r = $('crtview').getBoundingClientRect();
    let lx, ly;
    if (sonic.rotated) { lx = (e.clientY - r.top) / r.height; ly = 1 - (e.clientX - r.left) / r.width; }
    else { lx = (e.clientX - r.left) / r.width; ly = (e.clientY - r.top) / r.height; }
    const [ux, uy] = CRT.curve(lx, 1 - ly);
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
    crtOn = on && !!crt;
    $('crtview').hidden = !crtOn;
    sonic.setTape(crtOn);
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
    if (crtOn && crt) {
      const t = performance.now() / 1000;
      crt.glitchAmt = 0;
      // On-screen menu: fades with the controls, redrawn about 15 times a second while showing.
      const showing = osdActive() && (menuOpen || !theater.classList.contains('idle'));
      theater.classList.toggle('osd', osdActive());
      crt.osdAmt += ((showing ? 1 : 0) - crt.osdAmt) * 0.25;
      if (crt.osdAmt > 0.01 && t - osdDrawn > 0.066) {
        osdList = osdList || osdItems();
        osd.resize(W, H); osd.rot = sonic.rotated;
        osd.draw(osdList, { big: 'CH 00', line: `GEN ${String(world.gen).padStart(6, '0')}` }, { menu: menuOpen, bar: barItems(), touch });
        crt.setOsd(osd.canvas); osdDrawn = t;
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
    if (markers && world.search) {
      const S = world.search;
      fctx.setLineDash([4, 4]); fctx.strokeStyle = 'rgba(242,184,75,0.85)'; fctx.lineWidth = 1.5;
      fctx.beginPath(); fctx.arc((S.cx + 0.5) * sx, (S.cy + 0.5) * sy, 7 * sx, 0, Math.PI * 2); fctx.stroke();
      fctx.setLineDash([]);
    }
    // Recorder copy of exactly what is on screen (CRT included, markers if shown).
    if (replay.busy) {
      replay.tick(sonic.recordStream());
      replay.frame(crtOn && crt ? $('crtview') : cv, crtOn && !!crt, markers ? fx : null);
    }
    if (replay.keeper) {
      const t = Math.floor(replay.elapsed()), lab = `Stop ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if ($('rec').textContent !== lab) { $('rec').textContent = lab; $('hrec').textContent = '■ ' + lab.slice(5); $('rectime').textContent = lab.slice(5); }
    }
    $('recdot').hidden = !replay.keeper;
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
  $('hforce').addEventListener('click', () => { handle(world.forceEmerge(params)); wake(); });
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
    if (!osdActive() || e.target.closest('.hud')) return;
    const pt = osdPoint(e);
    if (menuOpen) {
      const h = osd.hit(...pt);
      if (h) { osd.sel = h.i; osdRun(osdList[h.i], h.side); } else openMenu(false); // a click outside the box closes it
      return;
    }
    if (wokeFromIdle) return; // that tap only brought the strip back
    const b = osd.hitBar(...pt);
    if (b && !b.disabled) { b.act(); osdDrawn = 0; }
  });
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
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handle(world.forceEmerge(params)); return; }
      if ((e.key === 'r' || e.key === 'R') && replay.supported) { e.preventDefault(); toggleRecord(); return; }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleSound(); osdDrawn = 0; return; }
    }
    if (osdActive() && !typing && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); openMenu(!menuOpen); return; }
    if (osdActive() && menuOpen && e.key === 'Escape') { e.preventDefault(); openMenu(false); return; }
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
  $('force').addEventListener('click', () => handle(world.forceEmerge(params)));
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
  newWorld(); loop();
})();
