// node tools/perf-fallback.js
// Continuous mode when the worker cannot be used: missing script, a worker
// that never answers, workers blocked by CSP, no Worker at all. Checks that
// moths still appear and cycle, and measures main-thread tasks.

import { spawn } from 'node:child_process';
import { launch, openPage, traceMainThreadTasks } from './cdp.js';

const PORT = 9440;
const HTTP = 8775;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(HTTP) }, stdio: 'ignore' });
await sleep(400);

const cases = [
  ['worker script 404', 'mount.html?worker=404'],
  ['worker never answers', 'mount.html?worker=stall'],
  ['CSP blocks workers', 'mount-csp.html?'],
  ['no Worker at all', 'mount.html?worker=missing'],
];
const rows = [];
try {
  for (const rate of [1, 6]) {
    for (const [label, path] of cases) {
      const chrome = await launch(PORT);
      try {
        const page = await openPage(PORT);
        await page.send('Emulation.setCPUThrottlingRate', { rate });
        let first = -1;
        let count = 0;
        const tasks = await traceMainThreadTasks(page, async () => {
          await page.send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/tools/perf/${path}&draw=1&hold=0.5&fade=0` });
          for (let k = 0; k < 400 && first < 0; k++) {
            await sleep(25);
            first = await page.eval('window.__moths && window.__moths[0] ? window.__moths[0].t : -1').catch(() => -1);
          }
          await sleep(5000);
          count = await page.eval('window.__count').catch(() => 0);
        });
        rows.push(`${(rate + 'x').padEnd(3)} ${label.padEnd(22)} first moth ${String(Math.round(first)).padStart(5)} ms   moths in 5 s: ${count}   longest main-thread task ${Math.max(...tasks).toFixed(1)} ms`);
      } finally {
        chrome.close();
      }
    }
  }
} finally {
  server.kill();
}
console.log(rows.join('\n'));
