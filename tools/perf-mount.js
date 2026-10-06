// node tools/perf-mount.js
// Measures continuous mode (mount) in headless Chrome. See DESIGN.md §8.

import { spawn } from 'node:child_process';
import { launch, openPage, traceMainThreadTasks } from './cdp.js';

const PORT = 9334;
const HTTP = 8767;
const BASE = `http://127.0.0.1:${HTTP}/tools/perf/mount.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(HTTP) }, stdio: 'ignore' });
await sleep(400);

/** Opens the measurement page in a fresh browser and runs `fn(page)`. */
async function withPage(query, fn, { rate = 1, media = [] } = {}) {
  const chrome = await launch(PORT);
  try {
    const page = await openPage(PORT);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setCPUThrottlingRate', { rate });
    if (media.length) await page.send('Emulation.setEmulatedMedia', { features: media });
    return await fn(page, () => page.send('Page.navigate', { url: `${BASE}?${query}` }));
  } finally {
    chrome.close();
  }
}

/** Waits until at least `n` moths have started. */
async function waitMoths(page, n, timeout = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const k = await page.eval('window.__count || 0').catch(() => 0);
    if (k >= n) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${n} moths`);
}

const results = {};

// 1. A full cycle at the default timings: longest main-thread task, and
//    frames requested during the hold.
for (const rate of [1, 6]) {
  await withPage('', async (page, go) => {
    let out;
    const tasks = await traceMainThreadTasks(page, async () => {
      await go();
      await waitMoths(page, 2, 60000);
      await sleep(500);
      out = await page.eval(`(() => {
        const [a, b] = window.__moths;
        // Hold: from the end of drawing (7 s) plus a frame, to the next moth.
        const holdFrames = window.__rafTimes.filter((t) => t > a.t + 7000 + 50 && t < b.t - 5).length;
        const drawFrames = window.__rafTimes.filter((t) => t >= a.t && t <= a.t + 7050).length;
        return { holdFrames, drawFrames, cycle: b.t - a.t, first: a.t };
      })()`);
    });
    results[`cycle ${rate}x`] = { ...out, longestTask: Math.max(...tasks), tasksOver50: tasks.filter((d) => d > 50).length };
  }, { rate });
}

// 2. Hidden tab: no frames requested while hidden; drawing resumes after.
await withPage('', async (page, go) => {
  await go();
  await waitMoths(page, 1);
  await sleep(1500);
  const other = await openPage(PORT);
  await other.send('Target.activateTarget', { targetId: other.targetId }).catch(() => {});
  await page.send('Target.activateTarget', { targetId: other.targetId }).catch(() => {});
  // Fall back to simulating it if headless Chrome does not hide the tab.
  let state = await page.eval('document.visibilityState');
  let simulated = false;
  if (state !== 'hidden') {
    simulated = true;
    await page.eval(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange')); 'ok'`);
    state = await page.eval('document.visibilityState');
  }
  const before = await page.eval('window.__rafTimes.length');
  await sleep(4000);
  const during = (await page.eval('window.__rafTimes.length')) - before;
  if (simulated) {
    await page.eval(`delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); 'ok'`);
  } else {
    await page.send('Target.activateTarget', { targetId: page.targetId });
  }
  const t0 = await page.eval('performance.now()');
  await waitMoths(page, 2, 30000);
  const next = await page.eval('window.__moths[1].t');
  // Drawing had 5.5 s left (7 s minus 1.5 s) plus 6.8 s of fade and hold.
  results.hidden = { simulated, state, framesWhileHidden: during, secondMothAfterResume: ((next - t0) / 1000).toFixed(1) + ' s (expected about 12.3 s)' };
  other.close();
});

// 3. Allocations inside the per-frame draw loop, sampled for 4 s (about
//    240 frames) during the first moth and again during the second. Frame
//    counting is off, so the measuring wrapper does not allocate in the loop.
async function sampleDrawLoop(page) {
  await page.send('HeapProfiler.enable');
  await page.send('HeapProfiler.collectGarbage');
  await page.send('HeapProfiler.startSampling', { samplingInterval: 16 });
  await sleep(4000);
  const { profile } = await page.send('HeapProfiler.stopSampling');
  let loop = 0;
  const walk = (node, inLoop) => {
    const here = inLoop || node.callFrame.functionName === 'frame' || node.callFrame.functionName === 'advance';
    if (here) loop += node.selfSize;
    for (const c of node.children) walk(c, here);
  };
  walk(profile.head, false);
  return loop;
}
await withPage('count=0&hold=0.5&fade=0', async (page, go) => {
  await go();
  await waitMoths(page, 1);
  await sleep(500);
  const first = await sampleDrawLoop(page);
  await waitMoths(page, 2, 30000);
  await sleep(500);
  const second = await sampleDrawLoop(page);
  results.allocations = { firstMothBytes: first, secondMothBytes: second, window: '4 s of drawing each (about 240 frames), 16-byte sampling' };
});

// 4. Memory over 1,000 moths in a row (fast timings), main thread and
//    worker; and the main family never repeats. Frame counting is off so the
//    measuring page itself does not grow.
await withPage('count=0&draw=0.03&hold=0.01&fade=0', async (page, go) => {
  const workers = [];
  page.on('Target.attachedToTarget', (p) => workers.push(p.sessionId));
  await page.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await go();
  const heap = async () => {
    await page.send('HeapProfiler.collectGarbage');
    const main = (await page.send('Runtime.getHeapUsage')).usedSize;
    let worker = 0;
    for (const s of workers) {
      await page.send('HeapProfiler.collectGarbage', {}, s).catch(() => {});
      worker += (await page.send('Runtime.getHeapUsage', {}, s).catch(() => ({ usedSize: 0 }))).usedSize;
    }
    return { main, worker };
  };
  const kb = (v) => (v / 1024).toFixed(0);
  const series = { main: [], worker: [] };
  for (const n of [10, 100, 200, 400, 700, 1000]) {
    await waitMoths(page, n, 300000);
    const h = await heap();
    series.main.push(`${n}: ${kb(h.main)}`);
    series.worker.push(`${n}: ${kb(h.worker)}`);
  }
  const repeats = await page.eval('window.__repeats');
  results.memory = { mainKB: series.main.join(', '), workerKB: series.worker.join(', '), familyRepeatsIn1000: repeats };
});

// 5. Reduced motion: one finished moth, no frames, no cycling; click still works.
await withPage('draw=2&hold=1', async (page, go) => {
  await go();
  await waitMoths(page, 1);
  await sleep(5000);
  const moths = await page.eval('window.__count');
  const frames = await page.eval('window.__rafTimes.length');
  const opacity = await page.eval(`document.querySelector('#plate div').style.opacity`);
  await page.eval(`document.querySelector('#plate canvas').click(); 'ok'`);
  await waitMoths(page, 2, 10000);
  results.reducedMotion = { mothsAfter5s: moths, framesRequested: frames, nameShown: opacity === '1', clickGivesNext: true };
}, { media: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

// 6. Theme change and resize: redrawn without regenerating; DPR capped at 2.
await withPage('draw=1&hold=30', async (page, go) => {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 3, mobile: false });
  await go();
  await waitMoths(page, 1);
  await sleep(1500);
  const shot = async (name) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`out/${name}.png`, Buffer.from(data, 'base64'));
  };
  await shot('mount-light');
  await page.eval(`document.documentElement.dataset.theme = 'dark'; 'ok'`);
  await sleep(300);
  await shot('mount-dark');
  await page.eval(`document.getElementById('plate').style.width = '600px'; document.getElementById('plate').style.height = '450px'; 'ok'`);
  await sleep(300);
  await shot('mount-resized');
  const canvasW = await page.eval(`document.querySelector('#plate canvas').width`);
  const moths = await page.eval('window.__count');
  results.themeAndResize = { mothsAfterThemeAndResize: moths, canvasWidthAt600cssPxDpr3: canvasW, screenshots: 'out/mount-light.png, out/mount-dark.png, out/mount-resized.png' };
});

// 7. destroy(): nothing runs afterwards, canvas and worker gone.
await withPage('draw=7&hold=6', async (page, go) => {
  let workerGone = false;
  page.on('Target.detachedFromTarget', () => { workerGone = true; });
  await page.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await go();
  await waitMoths(page, 1);
  await sleep(1000);
  await page.eval('window.__api.destroy(); "ok"');
  const before = await page.eval('window.__rafTimes.length');
  await sleep(3000);
  const after = await page.eval('window.__rafTimes.length');
  const canvas = await page.eval(`document.querySelector('#plate canvas') === null`);
  results.destroy = { framesAfterDestroy: after - before, canvasRemoved: canvas, workerTerminated: workerGone };
});

// 8. Time to the first moth, untraced, three fresh browsers.
const firsts = [];
for (let i = 0; i < 3; i++) {
  await withPage('', async (page, go) => {
    await go();
    await waitMoths(page, 1);
    const w = await page.eval('window.__workerTimes');
    firsts.push(`${Math.round(await page.eval('window.__moths[0].t'))} (worker created ${Math.round(w.created)}, replied ${Math.round(w.firstMessage)})`);
  });
}
results.firstMothMs = firsts.join(', ');

server.kill();
console.log(JSON.stringify(results, null, 2));
