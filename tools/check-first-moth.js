// node tools/check-first-moth.js [--runs 200] [--query "hold=2"] [--dwell ms]
// Launches a fresh headless Chrome per run and measures how long the first
// moth takes to start drawing (its first animation frame, from navigation).
// Fails if any run takes more than 1 second. Slow runs print a timing
// breakdown: when the worker was created, when it first replied, when the
// moth started.

import { spawn } from 'node:child_process';
import { launch, openPage } from './cdp.js';

const args = process.argv.slice(2);
/** @param {string} name @param {string} fallback */
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const RUNS = Number(arg('--runs', '200'));
const QUERY = arg('--query', '');
const LIMIT = 1000;
/** Keep each browser open this long after measuring, before killing it. */
const DWELL = Number(arg('--dwell', '0'));
const PORT = 9420;
const HTTP = 8773;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(HTTP) }, stdio: 'ignore' });
await sleep(400);

const times = [];
const slow = [];
try {
  for (let i = 0; i < RUNS; i++) {
    const chrome = await launch(PORT);
    try {
      const page = await openPage(PORT);
      await page.send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/tools/perf/mount.html?${QUERY}` });
      let drawStart = -1;
      for (let k = 0; k < 600 && drawStart < 0; k++) {
        await sleep(25);
        drawStart = await page.eval('window.__rafTimes && window.__rafTimes.length ? window.__rafTimes[0] : -1').catch(() => -1);
      }
      times.push(drawStart);
      if (drawStart < 0 || drawStart > LIMIT) {
        const d = await page.eval(`({ worker: window.__workerTimes, moth: window.__moths[0] && window.__moths[0].t,
          visibility: document.visibilityState })`).catch((e) => ({ error: String(e) }));
        slow.push({ run: i + 1, drawStart: Math.round(drawStart), ...d });
      }
      if (DWELL) await sleep(DWELL);
    } finally {
      chrome.close();
    }
    if ((i + 1) % 20 === 0) process.stdout.write(`  ${i + 1}/${RUNS}\n`);
  }
} finally {
  server.kill();
}

const ok = times.filter((t) => t >= 0).sort((a, b) => a - b);
const q = (p) => Math.round(ok[Math.min(ok.length - 1, Math.floor(p * ok.length))]);
console.log(`first moth starts drawing (ms from navigation), ${RUNS} fresh browsers${QUERY ? ` with ?${QUERY}` : ''}:`);
console.log(`  median ${q(0.5)}, p95 ${q(0.95)}, max ${q(1)}; over ${LIMIT} ms: ${slow.length}`);
for (const s of slow) console.log('  slow:', JSON.stringify(s));
if (slow.length) process.exit(1);
