// Replay recorder, like a high-speed camera's pre-record buffer. While "keep last 15 s" is on,
// a new encoder starts every few seconds on a composited copy of the view, and old ones are
// dropped, so there is always one encoder that began 15–20 s ago. Pressing Record keeps that
// one running (the backlog) and discards the rest; Stop finishes it into a single video file.
// Each encoder produces a complete, playable file, which is why no trimming or remuxing is needed.
const Recorder = (() => {
  const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  class Replay {
    constructor({ touch }) {
      this.touch = touch;
      this.BACK = 15; this.SEG = touch ? 7.5 : 5;
      this.mime = (window.MediaRecorder && MIMES.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } })) || '';
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;pointer-events:none';
      document.body.appendChild(this.canvas);
      this.g = this.canvas.getContext('2d');
      this.supported = !!(this.mime && this.canvas.captureStream);
      this.segs = []; this.keeper = null; this.armed = false; this.video = null; this.shape = '';
    }
    get ext() { return this.mime.startsWith('video/mp4') ? 'mp4' : 'webm'; }
    get busy() { return this.armed || !!this.keeper; }
    // Output size depends only on the world's shape, so changing world size mid-recording is safe.
    setShape(square) {
      const shape = square ? 'square' : 'wide';
      if (shape === this.shape) return;
      if (this.keeper) { this.pendingShape = square; return; }
      this.shape = shape;
      const long = this.touch ? 1280 : 1920;
      if (square) { this.canvas.width = this.canvas.height = this.touch ? 720 : 1080; }
      else { this.canvas.width = long; this.canvas.height = Math.round(long * 140 / 220 / 2) * 2; }
      this.g.fillStyle = '#000'; this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.dropAll();
      if (this.video) { this.video.getTracks().forEach(t => t.stop()); this.video = null; }
    }
    // Called every animation frame, in the same task the view was drawn (a WebGL canvas can only
    // be copied before the browser presents it).
    frame(source, smooth, overlay) {
      if (!this.busy) return;
      const g = this.g, w = this.canvas.width, h = this.canvas.height;
      g.imageSmoothingEnabled = smooth;
      g.drawImage(source, 0, 0, w, h);
      if (overlay) { g.imageSmoothingEnabled = true; g.drawImage(overlay, 0, 0, w, h); }
    }
    stream(audio) {
      if (!this.video) this.video = this.canvas.captureStream(30);
      return new MediaStream([...this.video.getVideoTracks(), ...(audio ? audio.getAudioTracks() : [])]);
    }
    startSeg(audio) {
      const chunks = [];
      const rec = new MediaRecorder(this.stream(audio), { mimeType: this.mime, videoBitsPerSecond: this.touch ? 5e6 : 10e6 });
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(1000);
      const seg = { rec, chunks, t0: performance.now() };
      this.segs.push(seg);
      return seg;
    }
    drop(seg) { try { seg.rec.ondataavailable = null; if (seg.rec.state !== 'inactive') seg.rec.stop(); } catch (e) {} }
    dropAll() { for (const s of this.segs) if (s !== this.keeper) this.drop(s); this.segs = this.keeper ? [this.keeper] : []; }
    tick(audio) {
      if (!this.armed || this.keeper) return;
      const now = performance.now(), last = this.segs[this.segs.length - 1];
      if (!last || now - last.t0 >= this.SEG * 1000) this.startSeg(audio);
      const keepFrom = now - (this.BACK + this.SEG) * 1000 - 500;
      while (this.segs.length > 1 && this.segs[0].t0 < keepFrom && this.segs[1].t0 <= now - this.BACK * 1000) this.drop(this.segs.shift());
    }
    arm(on) { this.armed = on; if (!on) this.dropAll(); }
    // Starts keeping video. Returns the seconds of backlog included.
    start(audio) {
      if (this.keeper) return 0;
      const now = performance.now();
      let pick = null;
      for (const s of this.segs) if (now - s.t0 >= this.BACK * 1000) pick = s;
      if (!pick) pick = this.segs[0] || this.startSeg(audio);
      this.keeper = pick;
      this.dropAll();
      return (now - pick.t0) / 1000;
    }
    elapsed() { return this.keeper ? (performance.now() - this.keeper.t0) / 1000 : 0; }
    stop() {
      const k = this.keeper;
      if (!k) return Promise.resolve(null);
      return new Promise(resolve => {
        k.rec.onstop = () => {
          this.keeper = null; this.segs = [];
          if (this.pendingShape !== undefined) { const s = this.pendingShape; this.pendingShape = undefined; this.setShape(s); }
          resolve(new Blob(k.chunks, { type: this.mime.split(';')[0] }));
        };
        k.rec.stop();
      });
    }
  }
  return { Replay };
})();
