// npm run bench: generates 1,000 moths and reports time, size and memory.
// Run through npm so the bundle is rebuilt first and --expose-gc is set.

import { build } from 'esbuild';
import { cpus } from 'node:os';
import { brotliCompressSync, constants } from 'node:zlib';
import { generate } from '../src/index.js';

const N = 1000;
const WARMUP = 50;
const HEAP_EVERY = 100;

const gc = /** @type {(() => void) | undefined} */ (globalThis.gc);

// Warm-up lets the JIT optimise the hot functions before we time them.
for (let i = 0; i < WARMUP; i++) generate(`warmup-${i}`);

const times = new Float64Array(N);
const points = new Float64Array(N);
const lines = new Float64Array(N);
/** @type {number[]} */
const heap = [];

gc?.();
heap.push(process.memoryUsage().heapUsed);
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const { drawing } = generate(i);
  times[i] = performance.now() - t0;
  points[i] = drawing.points.length / 2;
  lines[i] = drawing.offsets.length - 1;
  if (gc && (i + 1) % HEAP_EVERY === 0) {
    gc();
    heap.push(process.memoryUsage().heapUsed);
  }
}

/** @param {Float64Array} a  @param {number} q */
const quantile = (a, q) => {
  const s = a.slice().sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const ms = (/** @type {number} */ v) => v.toFixed(2) + ' ms';
const kb = (/** @type {number} */ v) => (v / 1024).toFixed(1) + ' KB';
const mark = (/** @type {boolean} */ ok) => (ok ? 'pass' : 'FAIL');

const median = quantile(times, 0.5);
const p95 = quantile(times, 0.95);

/**
 * Minified bundle of one entry, and its size after Brotli (quality 11).
 * @param {string} entry
 */
async function size(entry) {
  const r = await build({ entryPoints: [entry], bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent' });
  const code = r.outputFiles[0].contents;
  return { min: code.length, br: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
}
const lib = await size('src/index.js');
const worker = await size('src/worker.js');
// What the 404 page loads: mount (main thread) plus the worker.
const page = await size('src/mount.js');
const brotli = page.br + worker.br;

console.log(`mothdraw bench: ${N} moths, Node ${process.version}, ${cpus()[0].model}`);
console.log(`generate  median ${ms(median)}   p95 ${ms(p95)}   max ${ms(quantile(times, 1))}`);
console.log(
  `points    median ${quantile(points, 0.5)}   min ${quantile(points, 0)}   max ${quantile(points, 1)}`,
);
console.log(`lines     median ${quantile(lines, 0.5)}`);
console.log(`bundle    library ${kb(lib.min)} min / ${kb(lib.br)} br; continuous mode = mount ${kb(page.br)} br + worker ${kb(worker.br)} br = ${kb(brotli)} br`);
if (gc) {
  // The whole series, so a one-off step (JIT warm-up) is not mistaken for a
  // leak. A leak shows as a steady climb.
  const series = heap.map((h) => (h / 1024).toFixed(0)).join(' ');
  const last = heap[heap.length - 1];
  console.log(`heap      KB after GC, every ${HEAP_EVERY}: ${series}`);
  console.log(`          second sample to end: ${(last - heap[1] >= 0 ? '+' : '') + kb(last - heap[1])}`);
} else {
  console.log('heap      skipped (run with --expose-gc)');
}
console.log(
  `targets   median < 20 ms ${mark(median < 20)}, p95 < 60 ms ${mark(p95 < 60)}, ` +
    `continuous-mode bundle < 20 KB brotli ${mark(brotli < 20 * 1024)}`,
);
