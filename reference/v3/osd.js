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
      if (!view.menu) { if (view.bar) this.drawBar(view.bar, status, s, cw, ch); return; }
      // On touch screens the box widens to nearly the full screen width for bigger rows to tap,
      // and drops below the channel readout instead of sharing the top with it.
      const sz = this.touch ? Math.min(ch / 18.5, (cw * 0.9) / 13.5) : s;
      const rowH = sz * 1.08, pw = sz * 13.5;
      const x0 = this.touch ? (cw - pw) / 2 : cw * 0.06, y0 = this.touch ? ch * 0.13 : ch * 0.08;
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
      g.fillStyle = 'rgba(8, 18, 92, 0.8)'; g.fillRect(x0, y0, pw, ph);
      g.strokeStyle = 'rgba(120, 220, 255, 0.9)'; g.lineWidth = Math.max(2, sz * 0.08); g.strokeRect(x0, y0, pw, ph);
      g.font = `${sz}px ${FONT}`; g.textAlign = 'left';
      this.text('CULTURE', x0 + sz * 0.6, y0 + rowH * 0.75, '#ffe65c');
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
    // VCR-style strip of key hints across the bottom, in the deck's green lettering.
    drawBar(bar, status, s, cw, ch) {
      const g = this.g;
      g.textBaseline = 'middle';
      g.font = `${s * 1.25}px ${FONT}`; g.textAlign = 'right';
      this.text(status.big, cw - cw * 0.06, ch * 0.08 + s * 0.6, '#7dff8a');
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
