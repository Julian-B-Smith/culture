// On-screen menu in the style of a 1990s television: a blocky, two-column list in a translucent
// box, the selected row in inverse, values with ◂ ▸ adjusters, and a big channel-style readout in
// the corner. It is drawn to its own canvas and handed to the CRT shader, which puts it on the glass
// with the same curvature, scanlines and phosphors as the picture.
const OSD = (() => {
  const FONT = '"VT323", "Courier New", monospace';
  class Menu {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.g = this.canvas.getContext('2d');
      this.sel = 0; this.rows = [];
      try { document.fonts && document.fonts.load('40px "VT323"'); } catch (e) {}
    }
    resize(W, H) {
      const w = 960, h = Math.round(960 * H / W);
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    }
    // items: [{label, value?(), bar?(), act?, dec?, inc?, disabled?}]; status: {big, line}
    // view: {menu: show the menu box, bar: [{label, act, disabled?}] for the strip along the bottom}
    // On an upright phone the picture is turned 90°; `rot` draws the text turned back so it reads
    // upright on the glass. cw/ch below are the upright (screen-facing) width and height.
    draw(items, status, view) {
      const g = this.g, pw0 = this.canvas.width, ph0 = this.canvas.height;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pw0, ph0);
      if (this.rot) g.setTransform(0, -1, 1, 0, 0, ph0);
      const cw = this.rot ? ph0 : pw0, ch = this.rot ? pw0 : ph0;
      this.cw = cw; this.ch = ch; this.touch = !!view.touch;
      this.rows = []; this.barRects = [];
      const s = Math.min(ch / 18.5, cw / 24);
      // An open menu or scope dims the whole picture, as a television does under its own menu; the
      // see-through boxes then read against a quieter picture, in the tube and flat alike.
      if (view.menu || view.scope) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, cw, ch); }
      if (view.logo) Menu.drawLogo(g, view.logo.img, view.logo.alpha, cw, ch, view.logo.prompt, view.logo.pitch);
      if (view.scope) { this.drawScope(view.scope, s, cw, ch, view.pitch); return; }
      this.scopeRects = null;
      if (!view.menu) { if (view.bar) this.drawBar(view.bar, status, s, cw, ch); return; }
      // On touch screens the box widens to nearly the full screen width for bigger rows to tap,
      // and drops below the channel readout instead of sharing the top with it.
      // The box is (rows + 2.6) rows tall (title, rule, hint line). The lettering shrinks if needed so
      // the whole box fits on the glass, leaving a margin above the curved bottom edge.
      const y0 = this.touch ? ch * 0.13 : ch * 0.08;
      const fit = (ch * 0.95 - y0) / ((items.length + 2.6) * 1.08);
      const sz = Math.min(this.touch ? Math.min(ch / 18.5, (cw * 0.9) / 13.5) : s, fit);
      const rowH = sz * 1.08, pw = sz * 13.5;
      const x0 = this.touch ? (cw - pw) / 2 : cw * 0.06;
      const ry = this.touch ? ch * 0.03 : y0;
      const ph = rowH * (items.length + 2.6);
      g.textBaseline = 'middle';
      // Channel-style readout, top right.
      g.font = `${s * (this.touch ? 1.4 : 2)}px ${FONT}`; g.textAlign = 'right';
      this.text(status.big, cw - cw * 0.06, ry + s * 0.9, '#7dff8a');
      g.font = `${s * 0.95}px ${FONT}`;
      if (this.touch) { g.textAlign = 'left'; this.text(status.line, cw * 0.06, ry + s * 0.9, '#7dff8a'); }
      else this.text(status.line, cw - cw * 0.06, ry + s * 2.3, '#7dff8a');
      // Menu box.
      g.fillStyle = 'rgba(8, 18, 92, 0.65)'; g.fillRect(x0, y0, pw, ph);
      g.strokeStyle = 'rgba(120, 220, 255, 0.9)'; g.lineWidth = Math.max(2, sz * 0.08); g.strokeRect(x0, y0, pw, ph);
      g.font = `${sz}px ${FONT}`; g.textAlign = 'left';
      this.text(view.title || 'CULTURE', x0 + sz * 0.6, y0 + rowH * 0.75, '#ffe65c');
      g.fillStyle = 'rgba(120, 220, 255, 0.9)'; g.fillRect(x0 + sz * 0.6, y0 + rowH * 1.35, pw - sz * 1.2, Math.max(2, sz * 0.06));
      this.rows = [];
      items.forEach((it, i) => {
        const top = y0 + rowH * (1.6 + i), mid = top + rowH / 2, sel = i === this.sel;
        if (sel) { g.fillStyle = 'rgba(110, 230, 255, 0.95)'; g.fillRect(x0 + sz * 0.3, top, pw - sz * 0.6, rowH); }
        const fg = it.disabled ? '#6b7aa8' : sel ? '#06103f' : '#f2f6ff';
        g.textAlign = 'left'; this.text(it.label, x0 + sz * 0.7, mid, fg, !sel);
        const valX = x0 + pw * 0.5, right = x0 + pw - sz * 0.7;
        if (it.bar) {
          const n = 10, filled = Math.round(it.bar() * n), bw = (right - valX - sz * 1.4) / n;
          g.textAlign = 'left'; this.text('<', valX, mid, fg, !sel);
          for (let k = 0; k < n; k++) {
            g.fillStyle = k < filled ? fg : (sel ? 'rgba(6,16,63,0.3)' : 'rgba(242,246,255,0.25)');
            g.fillRect(valX + sz * 0.7 + k * bw, mid - sz * 0.28, bw * 0.7, sz * 0.56);
          }
          g.textAlign = 'right'; this.text('>', right, mid, fg, !sel);
        } else if (it.value) {
          const v = it.value();
          g.textAlign = 'right';
          this.text(it.dec || it.inc ? `<  ${v}  >` : v, right, mid, fg, !sel);
        }
        this.rows.push({ top, bottom: top + rowH, left: x0, right: x0 + pw, valX, item: it });
      });
      g.textAlign = 'left'; g.font = `${sz * 0.75}px ${FONT}`;
      this.text(this.touch ? 'TAP TO SELECT   TAP < > TO ADJUST' : 'UP/DN SELECT   </> ADJUST   ENTER OK', x0 + sz * 0.6, y0 + ph - rowH * 0.5, '#9fb4ff');
    }
    // ── Scopes: full-box chart pages ──
    // d comes from the shell (scopeData): { page, pages, index, ... page fields }. Drawn in the menu's
    // box style with blocky bars, segmented meters and a phosphor-green trace, the way a 1990s
    // television drew its own tuning and audio screens.
    drawScope(d, s, cw, ch, pitch) {
      const g = this.g, sz = Math.min(s, ch / 19);
      const x0 = cw * 0.05, y0 = ch * 0.07, pw = cw * 0.9, ph = ch * 0.86;
      const GREEN = '#7dff8a', CYAN = 'rgba(120, 220, 255, 0.9)', DIM = '#6b7aa8', SOFT = '#9fb4ff', INK = '#f2f6ff', GOLD = '#ffe65c';
      // The same see-through box as the menu; each chart sits on its own darker plate.
      g.fillStyle = 'rgba(8, 18, 92, 0.65)'; g.fillRect(x0, y0, pw, ph);
      g.strokeStyle = CYAN; g.lineWidth = Math.max(2, sz * 0.08); g.strokeRect(x0, y0, pw, ph);
      g.textBaseline = 'middle';
      // Title, and the page tabs along the same line (the open page in inverse).
      g.font = `${sz}px ${FONT}`; g.textAlign = 'left';
      this.text('SCOPES', x0 + sz * 0.6, y0 + sz * 0.85, GOLD);
      g.font = `${sz * 0.8}px ${FONT}`;
      let tx = x0 + pw - sz * 0.6;
      for (let i = d.pages.length - 1; i >= 0; i--) {
        const label = d.pages[i], w = g.measureText(label).width + sz * 0.6;
        tx -= w;
        if (i === d.index) { g.fillStyle = 'rgba(110, 230, 255, 0.95)'; g.fillRect(tx, y0 + sz * 0.35, w, sz); }
        g.textAlign = 'center'; this.text(label, tx + w / 2, y0 + sz * 0.85, i === d.index ? '#06103f' : SOFT, i !== d.index);
        tx -= sz * 0.3;
      }
      g.fillStyle = CYAN; g.fillRect(x0 + sz * 0.6, y0 + sz * 1.6, pw - sz * 1.2, Math.max(2, sz * 0.06));
      // Content area and footer.
      // Chart shapes are drawn at one pixel per world cell and scaled back up with hard edges, the
      // way the logo is, so traces and bars are made of the same blocks as the picture.
      const px = Math.max(1, pitch || 3), qc = this.qc ??= document.createElement('canvas');
      const qw = Math.ceil(this.canvas.width / px), qh = Math.ceil(this.canvas.height / px);
      if (qc.width !== qw || qc.height !== qh) { qc.width = qw; qc.height = qh; }
      const q = qc.getContext('2d'), k1 = 1 / px;
      q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, qw, qh);
      if (this.rot) q.setTransform(0, -k1, k1, 0, 0, this.canvas.height * k1); else q.setTransform(k1, 0, 0, k1, 0, 0);
      const cx = x0 + sz * 0.7, cy = y0 + sz * 2.1, cwid = pw - sz * 1.4, chei = ph - sz * 3.6;
      g.font = `${sz * 0.72}px ${FONT}`; g.textAlign = 'left';
      this.text(this.touch ? 'TAP LEFT / RIGHT FOR PAGES   TAP THE TITLE TO GO BACK' : '</> PAGE   ESC BACK', x0 + sz * 0.6, y0 + ph - sz * 0.6, SOFT);
      // Tap regions: the title line goes back; the left and right thirds of the box turn pages.
      this.scopeRects = { back: { left: x0, right: x0 + pw, top: y0, bottom: y0 + sz * 1.6 },
        prev: { left: x0, right: x0 + pw / 3, top: y0 + sz * 1.6, bottom: y0 + ph }, next: { left: x0 + pw * 2 / 3, right: x0 + pw, top: y0 + sz * 1.6, bottom: y0 + ph } };
      const seg = (x, y, w, h, n, frac, on, off) => {
        const k = Math.round(Math.max(0, Math.min(1, frac)) * n), bw = w / n;
        for (let i = 0; i < n; i++) { q.fillStyle = i < k ? (typeof on === 'function' ? on(i, n) : on) : off; q.fillRect(x + i * bw, y, bw * 0.72, h); }
      };
      if (d.page === 'LINEAGE') {
        const rh = sz * 0.98, cols = [0, 0.05, 0.16, 0.42, 0.68, 1];
        g.font = `${sz * 0.7}px ${FONT}`;
        ['', 'TIER', 'RULE', 'TERRITORY', 'SOUND'].forEach((h, i) => { g.textAlign = 'left'; this.text(h, cx + cwid * cols[i], cy + rh * 0.4, SOFT, false); });
        g.textAlign = 'right'; this.text('STATE', cx + cwid, cy + rh * 0.4, SOFT, false);
        const max = Math.max(1, Math.floor(chei / rh) - 1), rows = d.rows.length > max ? d.rows.slice(0, max - 1) : d.rows;
        g.font = `${sz * 0.85}px ${FONT}`;
        rows.forEach((r, i) => {
          const y = cy + rh * (1.4 + i), fg = r.dead ? DIM : INK;
          q.fillStyle = r.dead ? DIM : r.css; q.fillRect(cx, y - sz * 0.3, sz * 0.6, sz * 0.6);
          g.textAlign = 'left'; this.text(r.name, cx + cwid * cols[1], y, fg); this.text(r.rule, cx + cwid * cols[2], y, fg);
          seg(cx + cwid * cols[3], y - sz * 0.22, cwid * 0.22, sz * 0.44, 12, r.cover, r.dead ? DIM : r.css, 'rgba(242,246,255,0.18)');
          this.text(r.cls, cx + cwid * cols[4], y, r.dead ? DIM : SOFT);
          g.textAlign = 'right'; this.text(r.state, cx + cwid, y, r.state === 'FRONTIER' ? GOLD : r.state === 'RETREAT' ? '#ffb347' : r.state === 'SPORE' ? GREEN : fg);
        });
        if (rows.length < d.rows.length) { g.textAlign = 'left'; this.text(`+ ${d.rows.length - rows.length} MORE`, cx + cwid * cols[1], cy + rh * (1.4 + rows.length), DIM); }
      } else if (d.page === 'TERRITORY') {
        // Who holds the world, as a stacked chart over the last minute; newest on the right.
        const ax = sz * 2.6, gx = cx + ax, gw = cwid - ax, gy = cy + sz * 0.3, gh = chei - sz * 3.2;
        g.font = `${sz * 0.7}px ${FONT}`; g.textAlign = 'right';
        for (const [f, lab] of [[1, '100%'], [0.5, '50%'], [0, '0%']]) this.text(lab, gx - sz * 0.3, gy + gh * (1 - f), SOFT, false);
        q.fillStyle = 'rgba(0,0,0,0.8)'; q.fillRect(gx, gy, gw, gh);
        const N = 240, cw1 = gw / N, H = d.hist, start = N - H.length;
        H.forEach((h, i) => {
          let acc = 0; const x = gx + (start + i) * cw1;
          for (const [css, f] of h.covers) { q.fillStyle = css; q.fillRect(x, gy + gh * (1 - acc - f), cw1 + 0.6, gh * f + 0.6); acc += f; }
          if (h.birth) { q.fillStyle = GOLD; q.fillRect(x - sz * 0.08, gy - sz * 0.35, sz * 0.2, sz * 0.3); }
        });
        q.fillStyle = 'rgba(242,246,255,0.25)';
        for (const f of [0.25, 0.5, 0.75]) for (let x = gx; x < gx + gw; x += sz * 0.5) q.fillRect(x, gy + gh * (1 - f), sz * 0.22, 1.5);
        g.textAlign = 'left'; this.text('-60S', gx, gy + gh + sz * 0.5, SOFT, false);
        g.textAlign = 'center'; this.text('-30S', gx + gw / 2, gy + gh + sz * 0.5, SOFT, false);
        g.textAlign = 'right'; this.text('NOW', gx + gw, gy + gh + sz * 0.5, SOFT, false);
        // Legend: the five largest holders right now.
        const last = H.length ? H[H.length - 1].covers.slice().sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
        g.font = `${sz * 0.8}px ${FONT}`; g.textAlign = 'left';
        let lx = gx; const ly = gy + gh + sz * 1.55;
        for (const [css, f] of last) {
          q.fillStyle = css; q.fillRect(lx, ly - sz * 0.28, sz * 0.56, sz * 0.56);
          const lab = Math.round(f * 100) + '%'; this.text(lab, lx + sz * 0.8, ly, INK); lx += sz * 0.8 + g.measureText(lab).width + sz * 0.9;
        }
        if (!H.length) { g.textAlign = 'center'; this.text('COLLECTING…', gx + gw / 2, gy + gh / 2, SOFT); }
      } else if (d.page === 'SURPRISE') {
        // Top: a segmented meter of surprise against the threshold (the gold tick). Middle: its
        // history as a phosphor trace, births marked. Bottom: quiet and reign against a typical epoch.
        g.font = `${sz * 0.85}px ${FONT}`; g.textAlign = 'left';
        const mx = cx + sz * 4.6, mw = cwid - sz * 9.5, my = cy + sz * 0.5, scale = 1.5;
        this.text('SURPRISE', cx, my, INK);
        seg(mx, my - sz * 0.3, mw, sz * 0.6, 30, d.ratio / scale, (i, n) => (i + 1) / n * scale > 1 ? '#ffb347' : GREEN, 'rgba(242,246,255,0.15)');
        q.fillStyle = GOLD; q.fillRect(mx + mw / scale - sz * 0.05, my - sz * 0.55, sz * 0.12, sz * 1.1);
        g.textAlign = 'right';
        this.text(d.searching ? 'SEARCHING' : d.warm ? 'WARMING UP' : Math.round(d.ratio * 100) + '%', cx + cwid, my, d.searching ? GOLD : INK);
        const gx = cx + sz * 2.6, gw = cwid - sz * 2.6, gy = cy + sz * 1.6, gh = chei - sz * 5.2;
        q.fillStyle = 'rgba(0,0,0,0.8)'; q.fillRect(gx, gy, gw, gh);
        g.font = `${sz * 0.7}px ${FONT}`; g.textAlign = 'right';
        this.text('100%', gx - sz * 0.3, gy + gh * (1 - 1 / scale), GOLD, false); this.text('0%', gx - sz * 0.3, gy + gh, SOFT, false);
        q.fillStyle = 'rgba(255,230,92,0.7)';
        for (let x = gx; x < gx + gw; x += sz * 0.5) q.fillRect(x, gy + gh * (1 - 1 / scale), sz * 0.25, 2);
        const N = 240, H = d.hist, start = N - H.length, step = gw / N;
        q.fillStyle = 'rgba(255,230,92,0.35)';
        H.forEach((h, i) => { if (h.birth) q.fillRect(gx + (start + i) * step, gy, Math.max(1.5, sz * 0.06), gh); });
        q.strokeStyle = GREEN; q.lineWidth = Math.max(2, sz * 0.09); q.shadowColor = GREEN; q.shadowBlur = sz * 0.4;
        q.beginPath();
        H.forEach((h, i) => { const x = gx + (start + i) * step, y = gy + gh * (1 - Math.min(scale, h.ratio) / scale); i ? q.lineTo(x, y) : q.moveTo(x, y); });
        q.stroke(); q.shadowBlur = 0;
        const by = gy + gh + sz * 1.1;
        g.font = `${sz * 0.85}px ${FONT}`; g.textAlign = 'left';
        this.text('QUIET', cx, by, INK); seg(cx + sz * 3.2, by - sz * 0.25, cwid * 0.3, sz * 0.5, 16, d.quiet / 2, GREEN, 'rgba(242,246,255,0.15)');
        const rx = cx + cwid * 0.52;
        this.text('REIGN', rx, by, INK);
        if (d.reign) {
          q.fillStyle = d.reign.css; q.fillRect(rx + sz * 3.0, by - sz * 0.28, sz * 0.56, sz * 0.56);
          this.text(d.reign.name, rx + sz * 3.8, by, INK);
          seg(rx + sz * 6.0, by - sz * 0.25, cwid * 0.48 - sz * 6.0, sz * 0.5, 16, d.reign.frac / 2, d.reign.css, 'rgba(242,246,255,0.15)');
        }
        g.font = `${sz * 0.65}px ${FONT}`; g.textAlign = 'left';
        this.text('BOTH METERS FILL AT TWICE A TYPICAL EPOCH', cx, by + sz * 0.9, DIM, false);
      } else if (d.page === 'SIGNAL') {
        // Left: an oscilloscope of the final mix over a graticule, and below it a segmented
        // spectrum like a graphic equaliser. Right: tempo, drums, voices.
        const sw = cwid * 0.66, sh = chei * 0.5, sx = cx, sy = cy + sz * 0.2;
        q.fillStyle = 'rgba(0,0,0,0.8)'; q.fillRect(sx, sy, sw, sh);
        q.fillStyle = 'rgba(125,255,138,0.16)';
        for (let i = 1; i < 8; i++) q.fillRect(sx + sw * i / 8, sy, 1.5, sh);
        for (let i = 1; i < 4; i++) q.fillRect(sx, sy + sh * i / 4, sw, 1.5);
        if (d.live && d.wave) {
          q.strokeStyle = GREEN; q.lineWidth = Math.max(2, sz * 0.08); q.shadowColor = GREEN; q.shadowBlur = sz * 0.5;
          // Trigger: start at the first rising zero crossing, so a steady tone stands still.
          const W2 = d.wave, span = W2.length >> 1;
          let t0 = 0;
          for (let i = 1; i < span; i++) if (W2[i - 1] < 0 && W2[i] >= 0) { t0 = i; break; }
          q.beginPath();
          for (let i = 0; i < span; i++) { const x = sx + sw * i / span, y = sy + sh / 2 - Math.max(-1, Math.min(1, W2[t0 + i] * 2.5)) * sh * 0.46; i ? q.lineTo(x, y) : q.moveTo(x, y); }
          q.stroke(); q.shadowBlur = 0;
        } else {
          q.fillStyle = 'rgba(242,246,255,0.5)';
          for (let i = 0; i < 260; i++) q.fillRect(sx + Math.random() * sw, sy + Math.random() * sh, sz * 0.12, sz * 0.12);
          g.font = `${sz}px ${FONT}`; g.textAlign = 'center'; this.text('NO SIGNAL', sx + sw / 2, sy + sh / 2, INK);
        }
        // 24 bands, log-spaced from 40 Hz to 16 kHz, 12 segments each: green, then gold, then red.
        const ey = sy + sh + sz * 0.6, eh = chei - sh - sz * 1.6, bands = 24, bw = sw / bands;
        for (let b = 0; b < bands; b++) {
          let v = 0;
          if (d.live && d.spec) {
            const f0 = 40 * Math.pow(400, b / bands), f1 = 40 * Math.pow(400, (b + 1) / bands), nyq = (d.rate || 48000) / 2;
            const i0 = Math.floor(f0 / nyq * d.spec.length), i1 = Math.max(i0 + 1, Math.floor(f1 / nyq * d.spec.length));
            for (let i = i0; i < i1 && i < d.spec.length; i++) v = Math.max(v, d.spec[i]);
            v /= 255;
          }
          const segs = 12, lit = Math.round(v * segs), segH = eh / segs;
          for (let k = 0; k < segs; k++) {
            q.fillStyle = k < lit ? (k >= segs - 2 ? '#ff5a4e' : k >= segs - 4 ? GOLD : GREEN) : 'rgba(242,246,255,0.1)';
            q.fillRect(sx + b * bw + bw * 0.12, ey + eh - (k + 1) * segH + segH * 0.18, bw * 0.76, segH * 0.64);
          }
        }
        g.font = `${sz * 0.65}px ${FONT}`; g.textAlign = 'left'; this.text('40', sx, ey + eh + sz * 0.45, SOFT, false);
        g.textAlign = 'center'; this.text('1K', sx + sw * Math.log(1000 / 40) / Math.log(400), ey + eh + sz * 0.45, SOFT, false);
        g.textAlign = 'right'; this.text('16K HZ', sx + sw, ey + eh + sz * 0.45, SOFT, false);
        const rx = sx + sw + sz * 1.0;
        g.font = `${sz * 0.85}px ${FONT}`; g.textAlign = 'left';
        [['TEMPO', d.bpm ? d.bpm + ' BPM' : '--'], ['DRUMS', d.drums], ['VOICES', String(d.voices)], ['VHS', d.vhs ? 'ON' : 'OFF']].forEach(([k, v], i) => {
          const y = sy + sz * (0.5 + i * 2.1);
          this.text(k, rx, y, SOFT, false);
          g.font = `${sz * 1.15}px ${FONT}`; this.text(v, rx, y + sz * 0.95, GREEN); g.font = `${sz * 0.85}px ${FONT}`;
        });
      }
      // Back onto the menu canvas as hard-edged blocks, one per world cell (lettering stays crisp).
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
      g.drawImage(qc, 0, 0, qc.width * px, qc.height * px); g.restore();
    }
    hitScope(mx0, my0) {
      const [mx, my] = this.upright(mx0, my0), R = this.scopeRects;
      if (!R) return null;
      for (const k of ['back', 'prev', 'next']) { const r = R[k]; if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) return k; }
      return null;
    }
    // VCR-style strip of key hints across the bottom, in the deck's green lettering.
    drawBar(bar, status, s, cw, ch) {
      const g = this.g;
      g.textBaseline = 'middle';
      g.font = `${s * 1.25}px ${FONT}`; g.textAlign = 'right';
      this.text(status.big, cw - cw * 0.06, ch * 0.08 + s * 0.6, '#7dff8a');
      // Top left: the spore budget (spore builds only). Drops a line while the page's REC tally
      // occupies the corner.
      if (status.spore) {
        const p = status.spore;
        if (!p.warn || Math.floor(performance.now() / 250) % 2 === 0) {
          g.textAlign = 'left';
          const x = cw * 0.06, y = ch * 0.08 + s * 0.6 + (status.recOn ? s * 1.5 : 0);
          this.text(p.text, x, y, p.warn ? '#ffb347' : '#7dff8a');
          if (p.frac !== undefined) {
            // Recharge: eight blocks that fill from hollow to solid as the wait runs down.
            const n = 8, k = Math.floor(p.frac * n), bx = x + g.measureText(p.text + ' ').width, bw = s * 0.5, bh = s * 0.64, lw = Math.max(2, s * 0.09);
            for (let i = 0; i < n; i++) {
              const xi = bx + i * bw * 1.4, yi = y - bh / 2;
              if (i < k) {
                g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(xi + 2, yi + 2, bw, bh);
                g.fillStyle = '#7dff8a'; g.fillRect(xi, yi, bw, bh);
              } else {
                g.lineWidth = lw;
                g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeRect(xi + lw / 2 + 2, yi + lw / 2 + 2, bw - lw, bh - lw);
                g.strokeStyle = '#7dff8a'; g.strokeRect(xi + lw / 2, yi + lw / 2, bw - lw, bh - lw);
              }
            }
          }
        }
      }
      // Touch screens get bigger lettering (bigger tap targets), wrapped onto two lines if needed.
      const size = s * (this.touch ? 1.6 : 1.15); let gap = size * 1.2;
      g.font = `${size}px ${FONT}`; g.textAlign = 'left';
      // Each entry gets a fixed slot sized for its longest wording (e.g. SOUND OFF vs SOUND ON), so
      // toggling a state never shifts the strip or changes where it wraps.
      const measure = () => bar.map(b => Math.max(g.measureText(b.label).width, b.reserve ? g.measureText(b.reserve).width : 0));
      let widths = measure(), maxW = cw * 0.9;
      // With a keyboard, keep the strip on one line and shrink the lettering to fit if needed.
      if (!this.touch) {
        const total = widths.reduce((a, w) => a + w, 0) + gap * (bar.length - 1);
        if (total > maxW) { const k = maxW / total; g.font = `${size * k}px ${FONT}`; widths = measure(); gap *= k; }
      }
      const lines = [[]]; let lw = 0;
      bar.forEach((b, i) => {
        const add = widths[i] + (lines[lines.length - 1].length ? gap : 0);
        if (this.touch && lw + add > maxW && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
        lines[lines.length - 1].push(i); lw += widths[i] + (lines[lines.length - 1].length > 1 ? gap : 0);
      });
      const lineH = size * 1.25;
      lines.forEach((ln, li) => {
        const total = ln.reduce((a, i) => a + widths[i], 0) + gap * (ln.length - 1);
        let x = (cw - total) / 2;
        const y = ch * 0.92 - (lines.length - 1 - li) * lineH;
        for (const i of ln) {
          const b = bar[i];
          g.textAlign = 'center';
          this.text(b.label, x + widths[i] / 2, y, b.disabled ? '#3f7a48' : '#7dff8a');
          g.textAlign = 'left';
          this.barRects.push({ left: x - gap / 2, right: x + widths[i] + gap / 2, top: y - lineH / 2, bottom: y + lineH / 2, item: b });
          x += widths[i] + gap;
        }
      });
    }
    hitBar(mx0, my0) {
      const [mx, my] = this.upright(mx0, my0);
      for (const r of this.barRects || []) if (mx >= r.left && mx < r.right && my >= r.top && my <= r.bottom) return r.item;
      return null;
    }
    // Centred, about two thirds of the picture's width. Shared with the flat (non-CRT) overlay.
    // prompt: blinking VCR-green line under the logo ("PRESS ENTER"), or null.
    // pitch: size of one world cell in this canvas's units. The logo is first reduced to one pixel
    // per cell, then drawn back as hard blocks snapped to the cell grid, so it looks like an image
    // the picture itself is made of (and its pixels line up with the phosphor mask) rather than a
    // sharp graphic floating on the glass.
    static drawLogo(g, img, alpha, cw, ch, prompt, pitch) {
      if (!img || !img.complete || !img.naturalWidth || alpha <= 0) return;
      let w = Math.min(cw * 0.68, ch * 0.7 * img.naturalWidth / img.naturalHeight), h = w * img.naturalHeight / img.naturalWidth;
      let x = (cw - w) / 2, y = (ch - h) / 2 - ch * 0.04;
      g.save(); g.globalAlpha = alpha;
      if (pitch > 0) {
        const pw = Math.max(1, Math.round(w / pitch)), ph = Math.max(1, Math.round(h / pitch));
        const c = Menu.pixelLogo(img, pw, ph);
        w = pw * pitch; h = ph * pitch;
        x = Math.round((cw - w) / 2 / pitch) * pitch; y = Math.round(((ch - h) / 2 - ch * 0.04) / pitch) * pitch;
        g.imageSmoothingEnabled = false; g.drawImage(c, x, y, w, h); g.imageSmoothingEnabled = true;
      } else g.drawImage(img, x, y, w, h);
      if (prompt && Math.floor(performance.now() / 600) % 2 === 0) {
        const size = Math.max(14, Math.min(ch * 0.06, cw * 0.05));
        g.font = `${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(prompt, cw / 2 + 2, y + h + size * 1.1 + 2);
        g.fillStyle = '#7dff8a'; g.fillText(prompt, cw / 2, y + h + size * 1.1);
      }
      g.restore();
    }
    // The logo reduced to pw × ph pixels (area-averaged in steps, so fine lines become soft
    // intermediate pixels instead of dropping out). Cached until the size changes.
    static pixelLogo(img, pw, ph) {
      const k = pw + 'x' + ph;
      if (Menu.pix && Menu.pix.k === k && Menu.pix.img === img) return Menu.pix.c;
      let src = img, sw = img.naturalWidth, sh = img.naturalHeight;
      while (sw / 2 > pw && sh / 2 > ph) {
        const t = document.createElement('canvas'); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
        const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, 0, 0, t.width, t.height);
        src = t; sw = t.width; sh = t.height;
      }
      const c = document.createElement('canvas'); c.width = pw; c.height = ph;
      const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, pw, ph);
      // Every pixel is either fully lit or empty, so the logo reads as solid against the world
      // rather than as a translucent wash. (Canvas colors are not premultiplied, so a partly
      // covered pixel keeps its true color when made opaque.)
      const d = cg.getImageData(0, 0, pw, ph), a = d.data;
      for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= 90 ? 255 : 0;
      cg.putImageData(d, 0, 0);
      Menu.pix = { k, img, c };
      return c;
    }
    text(str, x, y, color, shadow = true) {
      const g = this.g;
      if (shadow) { g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(str, x + 2, y + 2); }
      g.fillStyle = color; g.fillText(str, x, y);
    }
    // Which row (and which side of an adjustable value) a point in menu-canvas pixels falls on.
    upright(mx, my) { return this.rot ? [this.canvas.height - my, mx] : [mx, my]; }
    hit(mx0, my0) {
      const [mx, my] = this.upright(mx0, my0);
      for (let i = 0; i < this.rows.length; i++) {
        const r = this.rows[i];
        if (my >= r.top && my < r.bottom && mx >= r.left && mx <= r.right) {
          let side = null;
          if ((r.item.dec || r.item.inc || r.item.bar) && mx >= r.valX) side = mx < (r.valX + r.right) / 2 ? 'dec' : 'inc';
          return { i, side };
        }
      }
      return null;
    }
  }
  return { Menu };
})();
