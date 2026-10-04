// CRT look as a two-pass WebGL filter over the world canvas. View only: it reads the drawn
// canvas and never touches the simulation.
//   Pass 1, at world resolution: phosphor persistence. Each cell keeps the brighter of its new
//     color and a decayed copy of last frame, so moving cells leave short glowing trails.
//   Pass 2, at screen resolution: the tube (beam, phosphor mask, glow; see SCREEN below),
//     plus barrel curvature, vignette, grain and a faint flicker.
const CRT = (() => {
  const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
  const PHOS = `precision mediump float;
uniform sampler2D src, prev; uniform float decay; varying vec2 v;
void main(){ vec3 c = texture2D(src, v).rgb; vec3 q = texture2D(prev, v).rgb * decay; gl_FragColor = vec4(max(c, q), 1.0); }`;
  // The tube. Everything is computed in linear light and converted back at the end.
  //  - Beam: each world row is a horizontal beam pass. Across a row, neighbouring cells blend with a
  //    gaussian spot. Down the screen, each row's light falls off as a gaussian whose width grows
  //    with brightness, so bright rows swell into the gaps and dim rows stay thin.
  //  - Mask: separate red, green and blue phosphors with dark gaps between them. Grille is
  //    Trinitron-style stripes, slot is a consumer TV's staggered slots, dots is a monitor's
  //    staggered dot triads. The mask darkens strongly, then the image is lifted to compensate.
  //  - Glow: a soft unmasked halo from the glass, added after the mask.
  const SCREEN = `precision mediump float;
uniform sampler2D phos, osd; uniform vec2 srcSize, outSize; uniform float time, maskType, glitchY, glitchAmt, osdAmt; varying vec2 v;
vec2 curve(vec2 uv){ uv = uv * 2.0 - 1.0; uv.x *= 1.0 + 0.035 * uv.y * uv.y; uv.y *= 1.0 + 0.05 * uv.x * uv.x; return uv * 0.5 + 0.5; }
float hash(vec2 q){ return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 cell(float cx, float cy){ return lin(texture2D(phos, (vec2(cx, cy) + 0.5) / srcSize).rgb); }
vec3 rowColor(float r, float x){
  float c0 = floor(x);
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int k = -1; k <= 1; k++) {
    float cx = c0 + float(k); float d = (cx + 0.5) - x;
    float w = exp(-d * d * 3.2);
    acc += cell(cx, r) * w; ws += w;
  }
  return acc / ws;
}
vec3 beam(vec3 c, float dy){
  float l = max(max(c.r, c.g), c.b);
  float w = mix(0.16, 0.34, sqrt(l));
  return c * exp(-0.5 * dy * dy / (w * w)) * (0.4 / w);
}
// The mask is laid out in the same curved cell coordinates as the picture, with a whole number
// of triads per cell and slot breaks on the gaps between rows, so mask and picture never drift
// or beat against each other. x is in cells, y in rows (row gaps fall on whole numbers).
vec3 mask(float x, float y, float n){
  float tx = x * n, ti = floor(tx);
  vec3 d = abs(vec3(fract(tx) * 3.0) - vec3(0.5, 1.5, 2.5));
  vec3 m = vec3(0.18) + 0.82 * clamp(1.6 - d * 2.2, 0.0, 1.0);
  if (maskType > 0.5) {
    float h = maskType > 1.5 ? 0.5 : 1.0;
    float g = fract(y / h + mod(ti, 2.0) * 0.5);
    float dist = min(g, 1.0 - g), br = maskType > 1.5 ? 0.2 : 0.1;
    m *= mix(0.3, 1.0, smoothstep(br * 0.5, br, dist));
  }
  return m;
}
void main(){
  vec2 uv = curve(v);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // Tape timebase: each row is shifted sideways a little, wandering slowly; a dropout tears a band
  // of rows; the last rows at the bottom carry the head-switching skew of a VCR.
  float rowN = floor(uv.y * srcSize.y);
  float jit = (hash(vec2(rowN, floor(time * 24.0))) - 0.5) * 0.08 + sin(uv.y * 9.0 + time * 1.7) * 0.05;
  float band = glitchAmt * smoothstep(0.018, 0.0, abs(uv.y - glitchY));
  float head = smoothstep(0.014, 0.0, uv.y);
  float x = uv.x * srcSize.x + jit + band * (hash(vec2(rowN, time)) - 0.5) * 6.0 + head * (1.5 + hash(vec2(rowN, floor(time * 30.0))) * 2.0);
  float y = uv.y * srcSize.y - 0.5;
  float r0 = floor(y), f = y - r0;
  vec3 a = rowColor(r0, x), b = rowColor(r0 + 1.0, x);
  vec3 scan = beam(a, f) + beam(b, 1.0 - f);
  float rowPx = outSize.y / srcSize.y;
  vec3 soft = mix(a, b, smoothstep(0.0, 1.0, f));
  vec3 col = mix(soft, scan, clamp((rowPx - 1.8) / 1.5, 0.0, 1.0));
  // Triads per cell; below about 3 screen pixels per cell the mask can't be drawn cleanly, so it fades out.
  float cellPx = outSize.x / srcSize.x;
  float n = max(1.0, floor(cellPx / 3.0 + 0.001));
  float amt = clamp((cellPx - 2.5) / 1.5, 0.0, 1.0);
  // On-screen menu: drawn into the tube as light, before the mask, so it gets the same curvature,
  // scanlines and phosphors as the picture, the way a television's own menu did.
  if (osdAmt > 0.0) {
    vec4 o = texture2D(osd, uv);
    float sp = exp(-0.5 * f * f / 0.09) + exp(-0.5 * (1.0 - f) * (1.0 - f) / 0.09);
    sp = mix(1.0, sp, clamp((rowPx - 1.8) / 1.5, 0.0, 1.0));
    col = col * (1.0 - o.a * osdAmt * 0.8) + lin(o.rgb) * o.a * osdAmt * 1.5 * sp;
  }
  col *= mix(vec3(1.0), mask(x, uv.y * srcSize.y, n) * 2.35, amt);
  vec2 px = 1.0 / srcSize;
  vec3 glow = lin(texture2D(phos, uv + px * vec2(2.0, 0.0)).rgb) + lin(texture2D(phos, uv - px * vec2(2.0, 0.0)).rgb)
            + lin(texture2D(phos, uv + px * vec2(0.0, 2.0)).rgb) + lin(texture2D(phos, uv - px * vec2(0.0, 2.0)).rgb)
            + lin(texture2D(phos, uv + px * vec2(1.4, 1.4)).rgb) + lin(texture2D(phos, uv - px * vec2(1.4, 1.4)).rgb);
  col += glow * 0.035;
  vec2 d = uv - 0.5;
  col *= smoothstep(0.0, 0.012, uv.x) * smoothstep(0.0, 0.012, uv.y) * smoothstep(0.0, 0.012, 1.0 - uv.x) * smoothstep(0.0, 0.012, 1.0 - uv.y);
  col *= 1.0 - dot(d, d) * 1.1;
  col *= 0.985 + 0.015 * sin(time * 50.0);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (hash(gl_FragCoord.xy + fract(time) * 100.0) - 0.5) * (0.03 + band * 0.5 + head * 0.15);
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))), band * 0.7);
  gl_FragColor = vec4(col, 1.0);
}`;

  function create(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false }); } catch (e) {}
    if (!gl) return null;
    canvas.addEventListener('webglcontextlost', e => e.preventDefault());
    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = frag => {
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, frag));
      gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      return pr;
    };
    let phosProg, screenProg;
    try { phosProg = program(PHOS); screenProg = program(SCREEN); } catch (e) { console.warn('CRT filter unavailable:', e.message); return null; }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = (filter) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const srcTex = tex(gl.NEAREST);
    const osdTex = tex(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    let W = 0, H = 0, ping = null, pong = null, wantW = 0, wantH = 0, steady = 0;
    // Linear filtering: the beam samples exact cell centres (unaffected), while the glow's
    // in-between taps blend smoothly instead of showing square blocks.
    const target = () => {
      const t = tex(gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, fb };
    };
    const u = (pr, name) => gl.getUniformLocation(pr, name);
    const loc = {
      src: u(phosProg, 'src'), prev: u(phosProg, 'prev'), decay: u(phosProg, 'decay'),
      phos: u(screenProg, 'phos'), srcSize: u(screenProg, 'srcSize'), outSize: u(screenProg, 'outSize'), time: u(screenProg, 'time'),
      maskType: u(screenProg, 'maskType'), glitchY: u(screenProg, 'glitchY'), glitchAmt: u(screenProg, 'glitchAmt'),
      osd: u(screenProg, 'osd'), osdAmt: u(screenProg, 'osdAmt'),
    };
    return {
      // Draws one frame from the world canvas `source` at the CSS size of the CRT canvas.
      // 0 = aperture grille, 1 = slot mask, 2 = dot triads.
      maskType: 1,
      get lost() { return gl.isContextLost(); },
      glitchY: 0.5, glitchAmt: 0, osdAmt: 0,
      // Uploads a freshly drawn on-screen-menu canvas; call only when its contents changed.
      setOsd(c) {
        if (gl.isContextLost()) return;
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, osdTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      },
      render(source, timeSec) {
        if (gl.isContextLost()) return;
        // Resize the drawing buffer only once the on-screen size has held still for a few frames.
        // Resizing every frame through a full-screen transition churns GPU buffers, and some
        // browsers then leave stale frames on screen.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw0 = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch0 = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (cw0 !== canvas.width || ch0 !== canvas.height) {
          if (cw0 === wantW && ch0 === wantH) { if (++steady >= 8 || canvas.width < 2) { canvas.width = cw0; canvas.height = ch0; } }
          else { wantW = cw0; wantH = ch0; steady = 0; if (canvas.width < 2) { canvas.width = cw0; canvas.height = ch0; } }
        }
        const cw = canvas.width, ch = canvas.height;
        if (source.width !== W || source.height !== H) {
          for (const t of [ping, pong]) if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.t); }
          W = source.width; H = source.height; ping = target(); pong = target();
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        // Pass 1: persistence into `ping`, reading last frame from `pong`.
        gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fb); gl.viewport(0, 0, W, H);
        gl.useProgram(phosProg);
        gl.uniform1i(loc.src, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, pong.t); gl.uniform1i(loc.prev, 1);
        gl.uniform1f(loc.decay, 0.42);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // Pass 2: the tube, to the screen.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
        gl.useProgram(screenProg);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ping.t); gl.uniform1i(loc.phos, 0);
        gl.uniform2f(loc.srcSize, W, H); gl.uniform2f(loc.outSize, cw, ch); gl.uniform1f(loc.time, timeSec);
        gl.uniform1f(loc.maskType, this.maskType);
        gl.uniform1f(loc.glitchY, this.glitchY); gl.uniform1f(loc.glitchAmt, this.glitchAmt);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, osdTex); gl.uniform1i(loc.osd, 2);
        gl.uniform1f(loc.osdAmt, this.osdAmt);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const t = ping; ping = pong; pong = t;
      },
    };
  }
  // The tube's barrel mapping, for turning a pointer position on the glass into picture coordinates.
  // x, y in 0..1 with y pointing up, exactly as the shader's curve().
  function curve(x, y) {
    x = x * 2 - 1; y = y * 2 - 1;
    x *= 1 + 0.035 * y * y; y *= 1 + 0.05 * x * x;
    return [x * 0.5 + 0.5, y * 0.5 + 0.5];
  }
  return { create, curve };
})();
