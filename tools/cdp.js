// A minimal Chrome DevTools Protocol client for the measurement scripts:
// launches headless Chrome, opens pages, sends commands and listens for
// events over Node's built-in WebSocket. No dependencies.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Starts headless Chrome with remote debugging on `port`.
 * @param {number} port
 * @returns {Promise<{ port: number, close: () => void }>}
 */
export async function launch(port) {
  const profile = mkdtempSync(join(tmpdir(), 'mothdraw-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1200,900',
    '--js-flags=--expose-gc',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      return {
        port,
        close() {
          proc.kill();
          try {
            rmSync(profile, { recursive: true, force: true });
          } catch {}
        },
      };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  proc.kill();
  throw new Error('Chrome did not start');
}

/**
 * Opens a new tab and connects to it.
 * @param {number} port
 * @param {string} [url]
 */
export async function openPage(port, url = 'about:blank') {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURI(url)}`, { method: 'PUT' });
  const target = await res.json();
  return connect(target.webSocketDebuggerUrl, target.id);
}

/**
 * @param {string} wsUrl
 * @param {string} targetId
 */
async function connect(wsUrl, targetId) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: any) => void }>} */
  const pending = new Map();
  /** @type {Map<string, Set<(params: any, sessionId?: string) => void>>} */
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} ${msg.error.data || ''}`));
      else p.resolve(msg.result);
    } else if (msg.method) {
      for (const cb of listeners.get(msg.method) || []) cb(msg.params, msg.sessionId);
    }
  };
  return {
    targetId,
    /**
     * @param {string} method @param {object} [params] @param {string} [sessionId]
     * @returns {Promise<any>}
     */
    send(method, params = {}, sessionId) {
      const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
      ws.send(JSON.stringify(msg));
      return new Promise((resolve, reject) => pending.set(msg.id, { resolve, reject }));
    },
    /** @param {string} method @param {(params: any, sessionId?: string) => void} cb */
    on(method, cb) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method)?.add(cb);
    },
    /**
     * Evaluates an expression in the page and returns its value (awaits promises).
     * @param {string} expression @param {string} [sessionId]
     */
    async eval(expression, sessionId) {
      const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    close() {
      ws.close();
    },
  };
}

/**
 * Records a trace of the page's main thread while `body` runs, and returns
 * the durations (ms) of every task the renderer's main thread ran.
 * @param {Awaited<ReturnType<typeof openPage>>} page
 * @param {() => Promise<void>} body
 */
export async function traceMainThreadTasks(page, body) {
  const events = [];
  page.on('Tracing.dataCollected', (p) => events.push(...p.value));
  const done = new Promise((r) => page.on('Tracing.tracingComplete', r));
  await page.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline',
    transferMode: 'ReportEvents',
  });
  await body();
  await page.send('Tracing.end');
  await done;
  // The page's main thread is the renderer thread named CrRendererMain.
  const mains = new Set(
    events
      .filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
      .map((e) => `${e.pid}:${e.tid}`),
  );
  return events
    .filter((e) => e.name === 'RunTask' && e.ph === 'X' && mains.has(`${e.pid}:${e.tid}`))
    .map((e) => e.dur / 1000);
}
