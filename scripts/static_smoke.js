// Smoke test the static site exactly as a static host (Vercel) would serve it.
// Verifies the runtime-critical files resolve, are 200, and carry a fetchable
// content type. Uses only Node built-ins (no npm install needed).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8123;

const TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': (TYPES[ext] || 'application/octet-stream') + (ext === '.json' || ext === '.js' || ext === '.css' || ext === '.html' || ext === '.md' || ext === '.svg' ? '; charset=utf-8' : '') });
  fs.createReadStream(file).pipe(res);
});

const urls = [
  '/',
  '/learner/',
  '/learner/index.html',
  '/learner/style.css',
  '/learner/data.js',
  '/learner/evidence.js',
  '/learner/engine.js',
  '/learner/catalog.js',
  '/learner/ui.js',
  '/learner/app.js',
  '/learner/assessor.js',
  '/learner/favicon.svg',
  '/learner/chunks/money.json',
  '/learner/chunks/health.json',
  '/learner/chunks/capstones.json',
  '/assessor/feedback/MONEY-BUDGET-I01.json',
  '/assessor/calibration/C01.json',
  '/START-HERE.md',
  '/guides/02-money.md',
];

function get(u) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: u }, (res) => {
      let bytes = 0;
      res.on('data', (c) => (bytes += c.length));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', bytes }));
    });
    req.on('error', (e) => resolve({ status: 0, type: String(e), bytes: 0 }));
  });
}

server.listen(PORT, '127.0.0.1', async () => {
  let fail = 0;
  for (const u of urls) {
    const r = await get(u);
    const ok = r.status === 200 && r.bytes > 0;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${u.padEnd(46)} ${r.status}  ${String(r.bytes).padStart(7)}b  ${r.type}`);
  }
  // Verify the critical invariant: data.js has no embedded solutions.
  const body = fs.readFileSync(path.join(ROOT, 'learner/data.js'), 'utf8');
  const leaks = ['"solution":', '"benchmarks":'].filter((k) => body.includes(k));
  if (leaks.length) { fail++; console.log('FAIL learner/data.js embeds', leaks.join(', ')); }
  else console.log('PASS learner/data.js contains no solutions/benchmarks');

  // Verify the Vercel deploy contract: everything the app fetches at runtime is
  // covered by .vercelignore's exclusions (i.e. NOT ignored), and the aggregate
  // answer/benchmark files ARE excluded so a static host never serves them.
  const ignoreText = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8');
  const ignored = new Set(
    ignoreText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  );
  const runtimeAssets = ['learner/data.js', 'learner/index.html', 'learner/chunks/money.json', 'assessor/feedback/MONEY-BUDGET-I01.json', 'assessor/calibration/C01.json', 'index.html', 'START-HERE.md'];
  const wronglyIgnored = runtimeAssets.filter((f) => ignored.has(f));
  if (wronglyIgnored.length) { fail++; console.log('FAIL .vercelignore would exclude required runtime asset(s):', wronglyIgnored.join(', ')); }
  else console.log('PASS .vercelignore keeps every runtime asset');

  const mustExclude = ['assessor/answers.json', 'assessor/benchmarks.json'];
  const notExcluded = mustExclude.filter((f) => !ignored.has(f));
  if (notExcluded.length) { fail++; console.log('FAIL aggregate solution files not excluded from deploy:', notExcluded.join(', ')); }
  else console.log('PASS .vercelignore excludes aggregate answers/benchmarks');

  server.close();
  console.log(fail === 0 ? '\nALL STATIC ROUTES OK' : `\n${fail} FAILURE(S)`);
  process.exit(fail === 0 ? 0 : 1);
});