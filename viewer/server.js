// Dev viewer server: serves viewer/index.html and relays culture_stream's
// binary frames to the browser over a streamed HTTP response.
// Node built-ins only (no dependencies). Usage:
//   node viewer/server.js            (PORT env var, default 5180)
// Needs the C++ build: cmake --build build --target culture_stream
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'build', 'culture_stream');
const PAGE = path.join(__dirname, 'index.html');
// The frozen v0 sound engine, served unmodified (D-030 freezes reference/;
// the viewer adapts the C++ stream to it instead of editing it).
const SOUND = path.join(ROOT, 'reference', 'sound.js');
const PORT = Number(process.env.PORT) || 5180;

// Only whitelisted, range-checked values ever reach the child's argv; it is
// spawned without a shell, so nothing from the URL is interpreted.
function streamArgs(q) {
  const int = (k, lo, hi, d) => {
    const v = Number.parseInt(q.get(k) ?? '', 10);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : d;
  };
  const sizes = ['165x105', '220x140', '330x210', '440x280', '550x350'];
  const size = sizes.includes(q.get('size')) ? q.get('size') : '220x140';
  const profile = q.get('profile') === 'stress' ? 'stress' : 'default';
  // search: worker (deterministic latency, default) | sliced | instant.
  const search = ['worker', 'sliced', 'instant'].includes(q.get('search')) ? q.get('search') : 'worker';
  return ['--size', size, '--seed', String(int('seed', 0, 4294967295, 1)), '--profile', profile,
    '--spf', String(int('spf', 1, 64, 1)), '--fps', String(int('fps', 1, 60, 60)),
    '--latency', search === 'worker' ? '30' : '-1', '--slice', search === 'instant' ? '0' : '2'];
}

// Live streams by id, so /control can pause one. Pausing must stop the
// SIMULATION, not just the drawing: if the browser merely stopped reading,
// culture_stream would run on until the pipe and socket buffers filled
// (measured: ~1,500 gens of backlog at 16 gens/frame), then dump it on resume.
const streams = new Map();
let nextId = 1;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    fs.createReadStream(PAGE).pipe(res);
    return;
  }
  if (url.pathname === '/sound.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    fs.createReadStream(SOUND).pipe(res);
    return;
  }
  if (url.pathname === '/stream') {
    if (!fs.existsSync(BIN)) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('culture_stream is not built. Run: cmake --build build --target culture_stream\n');
      return;
    }
    const child = spawn(BIN, streamArgs(url.searchParams), { stdio: ['ignore', 'pipe', 'inherit'] });
    const id = String(nextId++);
    streams.set(id, child);
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-stream-id': id });
    child.stdout.pipe(res);
    const stop = () => {
      streams.delete(id);
      if (child.exitCode === null) { child.kill('SIGCONT'); child.kill(); }  // a stopped process must be resumed to die cleanly
    };
    req.on('close', stop);
    res.on('close', stop);
    child.on('exit', () => res.end());
    return;
  }
  if (url.pathname === '/control' && req.method === 'POST') {
    const child = streams.get(url.searchParams.get('id') ?? '');
    const op = url.searchParams.get('op');
    if (!child || (op !== 'pause' && op !== 'resume')) { res.writeHead(400); res.end(); return; }
    child.kill(op === 'pause' ? 'SIGSTOP' : 'SIGCONT');
    res.writeHead(204); res.end();
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found\n');
});

server.listen(PORT, '127.0.0.1', () => console.log(`culture viewer: http://localhost:${PORT}`));
