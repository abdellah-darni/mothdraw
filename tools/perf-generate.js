// node tools/perf-generate.js
// Times generate() in headless Chrome: first (cold) call and later calls,
// on the main thread in idle callbacks and in a module worker, at normal
// speed and at 6x CPU throttling. Also records the longest main-thread
// task. A fresh browser per run, so the first call is truly cold.

import { spawn } from 'node:child_process';
import { launch, openPage, traceMainThreadTasks } from './cdp.js';

const PORT = 9333;
const HTTP = 8766;
const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(HTTP) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
try {
  for (const rate of [1, 6]) {
    for (const mode of ['main', 'worker']) {
      const chrome = await launch(PORT);
      try {
        const page = await openPage(PORT);
        await page.send('Emulation.setCPUThrottlingRate', { rate });
        let result;
        const tasks = await traceMainThreadTasks(page, async () => {
          await page.send('Page.enable');
          await page.send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/tools/perf/gen.html?mode=${mode}&n=10` });
          for (let i = 0; i < 200 && !result; i++) {
            await new Promise((r) => setTimeout(r, 100));
            result = await page.eval('window.__result').catch(() => undefined);
          }
        });
        const first = result.times[0];
        const later = median(result.times.slice(1));
        rows.push({ rate, mode, first, later, longest: Math.max(...tasks), longTasks: result.longTasks.length });
        page.close();
      } finally {
        chrome.close();
      }
    }
  }
} finally {
  server.kill();
}
console.log('CPU   mode    first call  later calls (median)  longest main-thread task  long tasks (>50 ms)');
for (const r of rows) {
  console.log(
    `${(r.rate + 'x').padEnd(5)} ${r.mode.padEnd(7)} ${r.first.toFixed(1).padStart(7)} ms  ${r.later.toFixed(1).padStart(10)} ms` +
      `          ${r.longest.toFixed(1).padStart(8)} ms           ${r.longTasks}`,
  );
}
