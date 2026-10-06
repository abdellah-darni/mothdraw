// npm run similar [-- --count 100 --pairs 5 --out out/similar.png --crop]
// Finds the pairs of seeds whose plates look most alike, by numbers rather
// than by eye: each drawing's ink (line length) is laid onto a coarse grid,
// blurred a little so near misses still match, and every pair is compared
// by correlation. This measures silhouette and where the dark areas fall,
// which is what makes two plates look alike at a glance; it does not
// compare individual strokes. The top pairs are rendered side by side.
//
// --crop measures each specimen inside its own bounding box instead of the
// whole plate, so size on the plate drops out and only shape and pattern
// count. (On the plate, two small specimens share wide empty margins, which
// the plate-level number counts as likeness.)

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generate, toSVG } from '../src/index.js';

const args = process.argv.slice(2);
/** @param {string} name  @param {string} fallback */
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const COUNT = Number(arg('--count', '100'));
const PAIRS = Number(arg('--pairs', '5'));
const out = resolve(arg('--out', 'out/similar.png'));
const CROP = args.includes('--crop');
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const GW = 64;
const GH = 48;
/** The frame's four sides are the first lines of every drawing. */
const FRAME_LINES = 4;

/** Ink length per grid cell, blurred, centred and normalised. */
function signature(drawing) {
  const { points, offsets } = drawing;
  // The area mapped onto the grid: the whole plate, or the specimen's own
  // bounding box (same aspect as the plate, centred) with --crop.
  let x0b = 0;
  let y0b = 0;
  let width = drawing.width;
  let height = drawing.height;
  if (CROP) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 2 * offsets[FRAME_LINES]; i < points.length; i += 2) {
      minX = Math.min(minX, points[i]);
      maxX = Math.max(maxX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      maxY = Math.max(maxY, points[i + 1]);
    }
    const k = Math.max((maxX - minX) / drawing.width, (maxY - minY) / drawing.height);
    width = drawing.width * k;
    height = drawing.height * k;
    x0b = (minX + maxX - width) / 2;
    y0b = (minY + maxY - height) / 2;
  }
  let g = new Float64Array(GW * GH);
  for (let l = FRAME_LINES; l < offsets.length - 1; l++) {
    for (let v = offsets[l] + 1; v < offsets[l + 1]; v++) {
      const x0 = points[2 * v - 2];
      const y0 = points[2 * v - 1];
      const x1 = points[2 * v];
      const y1 = points[2 * v + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(len / 2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const cx = Math.max(0, Math.min(GW - 1, Math.floor(((x0 + (x1 - x0) * t - x0b) / width) * GW)));
        const cy = Math.max(0, Math.min(GH - 1, Math.floor(((y0 + (y1 - y0) * t - y0b) / height) * GH)));
        g[cy * GW + cx] += len / n;
      }
    }
  }
  // Two passes of a 3 x 3 box blur.
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float64Array(GW * GH);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
            s += g[yy * GW + xx];
            c++;
          }
        }
        b[y * GW + x] = s / c;
      }
    }
    g = b;
  }
  let mean = 0;
  for (const v of g) mean += v;
  mean /= g.length;
  let norm = 0;
  for (let i = 0; i < g.length; i++) {
    g[i] -= mean;
    norm += g[i] * g[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < g.length; i++) g[i] /= norm;
  return g;
}

const moths = [];
for (let s = 1; s <= COUNT; s++) {
  const m = generate(s);
  moths.push({ seed: s, moth: m, sig: signature(m.drawing) });
}

const pairs = [];
for (let i = 0; i < moths.length; i++) {
  for (let j = i + 1; j < moths.length; j++) {
    let r = 0;
    const a = moths[i].sig;
    const b = moths[j].sig;
    for (let k = 0; k < a.length; k++) r += a[k] * b[k];
    pairs.push({ i, j, r });
  }
}
pairs.sort((p, q) => q.r - p.r);

const all = pairs.map((p) => p.r).sort((a, b) => a - b);
const pct = (q) => all[Math.floor(q * (all.length - 1))].toFixed(3);
console.log(`${pairs.length} pairs; correlation median ${pct(0.5)}, p90 ${pct(0.9)}, p99 ${pct(0.99)}, max ${pct(1)}`);
console.log('most alike:');
for (const p of pairs.slice(0, PAIRS * 2)) {
  const a = moths[p.i];
  const b = moths[p.j];
  console.log(`  ${p.r.toFixed(3)}  seed ${a.seed} (${a.moth.family}) & seed ${b.seed} (${b.moth.family})`);
}

const W = 700;
let rows = '';
for (const p of pairs.slice(0, PAIRS)) {
  const a = moths[p.i];
  const b = moths[p.j];
  rows += `<div class="row"><div>${toSVG(a.moth.drawing, { width: W, label: a.moth.name })}<p>seed ${a.seed}</p></div>` +
    `<div>${toSVG(b.moth.drawing, { width: W, label: b.moth.name })}<p>seed ${b.seed}</p></div>` +
    `<div class="r">r = ${p.r.toFixed(3)}</div></div>`;
}
const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: #f6f3ec; color: #1d1b18; font: 15px Georgia, serif; }
  .row { display: grid; grid-template-columns: ${W}px ${W}px 110px; gap: 10px; align-items: center; padding: 6px 10px; }
  p { margin: 0 0 4px; text-align: center; } .r { font-size: 18px; }
</style>${rows}`;
mkdirSync(dirname(out), { recursive: true });
const page = out.replace(/\.png$/, '.html');
writeFileSync(page, html);
const rowH = Math.round(W * 0.75) + 32;
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${2 * W + 150},${PAIRS * rowH}`, `--screenshot=${out}`, pathToFileURL(page).href], { stdio: 'ignore' });
console.log(out);
