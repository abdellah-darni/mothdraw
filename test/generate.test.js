import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generate, toSVG } from '../src/index.js';

test('same seed, identical drawing; different seed, different drawing', () => {
  const a = generate('abc').drawing;
  const b = generate('abc').drawing;
  const c = generate('abd').drawing;
  assert.deepEqual(a.points, b.points);
  assert.deepEqual(a.offsets, b.offsets);
  assert.notDeepEqual(a.points, c.points);
});

test('every point lies inside the frame', () => {
  for (let s = 0; s < 50; s++) {
    const { points, width, height } = generate(s).drawing;
    for (let i = 0; i < points.length; i += 2) {
      assert.ok(points[i] >= 0 && points[i] <= width && points[i + 1] >= 0 && points[i + 1] <= height);
    }
  }
});

test('svg has one path with one subpath per polyline and an escaped title', () => {
  const { drawing } = generate(3);
  const svg = toSVG(drawing, { title: 'A & <B>' });
  assert.equal(svg.match(/<path /g).length, 1);
  assert.equal(svg.match(/M/g).length, drawing.offsets.length - 1);
  assert.ok(svg.includes('<title>A &amp; &lt;B&gt;</title>'));
  assert.ok(svg.includes('stroke="currentColor"'));
});

test('blending keeps every proportion within the two families\' ranges', async () => {
  const { FAMILIES, samplePlan } = await import('../src/plans.js');
  const { createRng } = await import('../src/rng.js');
  const rng = createRng(9);
  for (let i = 0; i < 2000; i++) {
    const p = samplePlan(rng);
    const f = FAMILIES.find((x) => x.name === p.family);
    const g = FAMILIES.find((x) => x.name === p.leansTo);
    assert.ok(p.mix >= 0 && p.mix <= 0.4);
    for (const part of ['fore', 'body']) {
      for (const key in f[part]) {
        const lo = Math.min(f[part][key][0], g[part][key][0]);
        const hi = Math.max(f[part][key][2], g[part][key][2]);
        assert.ok(p[part][key] >= lo - 1e-9 && p[part][key] <= hi + 1e-9, `${part}.${key}`);
      }
    }
  }
});
