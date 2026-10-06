import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Builder, LAYER } from '../src/builder.js';
import { drawVisible } from '../src/clip.js';
import { generate } from '../src/index.js';
import { lastForewing } from '../src/moth.js';
import { createRng } from '../src/rng.js';
import { ProfileShape } from '../src/shapes.js';

/** Distance from (px, py) to the nearest edge of a closed polygon. */
function distToOutline(px, py, xs, ys, n) {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = xs[j] - xs[i];
    const ey = ys[j] - ys[i];
    const l2 = ex * ex + ey * ey;
    const t = l2 ? Math.max(0, Math.min(1, ((px - xs[i]) * ex + (py - ys[i]) * ey) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - xs[i] - t * ex, py - ys[i] - t * ey));
  }
  return best;
}

/**
 * Clips random segments against `shape` and returns the largest distance
 * from a cut endpoint to the outline. Endpoints of the original segment
 * are not cuts and are skipped.
 */
function worstCut(shape, xs, ys, n, box, rng, count) {
  const b = new Builder();
  const seg = new Float64Array(4);
  let worst = 0;
  for (let k = 0; k < count; k++) {
    for (let i = 0; i < 4; i++) seg[i] = box[i % 2] + rng() * (box[2 + (i % 2)] - box[i % 2]);
    b.reset();
    drawVisible(b, LAYER.WING, false, seg, 2, false, [shape]);
    for (let l = 0; l < b.lineCount; l++) {
      for (const v of [b.starts[l], b.starts[l + 1] - 1]) {
        const x = b.pts[2 * v];
        const y = b.pts[2 * v + 1];
        const original = (Math.abs(x - seg[0]) < 1e-3 && Math.abs(y - seg[1]) < 1e-3) ||
          (Math.abs(x - seg[2]) < 1e-3 && Math.abs(y - seg[3]) < 1e-3);
        if (!original) worst = Math.max(worst, distToOutline(x, y, xs, ys, n));
      }
    }
  }
  return worst;
}

test('every forewing over 1,000 seeds is a valid star shape', () => {
  for (let s = 0; s < 1000; s++) {
    generate(s);
    assert.ok(lastForewing().valid, `seed ${s}: forewing vertex out of angle order`);
  }
});

test('cuts against forewings land on the outline (within 0.01 units)', () => {
  const rng = createRng(99);
  let worst = 0;
  for (let s = 0; s < 200; s++) {
    generate(s);
    const f = lastForewing();
    const pad = 20;
    const box = [f.minX - pad, f.minY - pad, f.maxX + pad, f.maxY + pad];
    worst = Math.max(worst, worstCut(f, f.x, f.y, f.n, box, rng, 40));
  }
  assert.ok(worst < 0.01, `worst cut is ${worst} units from the outline`);
});

test('cuts against a body profile land on the outline (within 0.01 units)', () => {
  const p = new ProfileShape();
  const n = p.reset(0, 100, 1);
  for (let i = 0; i < n; i++) p.w[i] = 30 * Math.sin((Math.PI * i) / (n - 1));
  p.finish();
  // The drawn polygon: right side down, left side back up.
  const xs = [];
  const ys = [];
  for (let i = 0; i < n; i++) { xs.push(p.w[i]); ys.push(i * p.dy); }
  for (let i = n - 2; i > 0; i--) { xs.push(-p.w[i]); ys.push(i * p.dy); }
  const worst = worstCut(p, xs, ys, xs.length, [-50, -20, 50, 120], createRng(5), 2000);
  assert.ok(worst < 0.01, `worst cut is ${worst} units from the outline`);
});

test('a line through a shape is split into two visible parts', () => {
  const p = new ProfileShape();
  const n = p.reset(0, 10, 1);
  for (let i = 0; i < n; i++) p.w[i] = i === 0 || i === n - 1 ? 0 : 5;
  p.finish();
  const b = new Builder();
  drawVisible(b, LAYER.WING, false, new Float64Array([-20, 5, 20, 5]), 2, false, [p]);
  assert.equal(b.lineCount, 2);
  assert.ok(Math.abs(b.pts[2] + 5) < 1e-9 && Math.abs(b.pts[4] - 5) < 1e-9);
});
