import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generate, toSVG } from '../src/index.js';

/** Bounding box of all points. */
function bounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

/** Polylines that lie entirely along one side of the frame (inset 22). */
function frameLines({ points, offsets, width, height }) {
  let n = 0;
  for (let l = 0; l < offsets.length - 1; l++) {
    const on = (test) => {
      for (let v = offsets[l]; v < offsets[l + 1]; v++) if (!test(points[2 * v], points[2 * v + 1])) return false;
      return true;
    };
    const near = (a, b) => Math.abs(a - b) < 2;
    if (on((x, y) => near(y, 22)) || on((x, y) => near(y, height - 22)) || on((x) => near(x, 22)) || on((x) => near(x, width - 22))) n++;
  }
  return n;
}

test('frame: false draws no frame; the default draws its four sides', () => {
  for (let s = 0; s < 50; s++) {
    assert.equal(frameLines(generate(s).drawing), 4, `seed ${s} framed`);
    assert.equal(frameLines(generate(s, { frame: false }).drawing), 0, `seed ${s} bare`);
  }
});

test('without a frame the specimen fills 85 to 100% of its box, centred with its name', () => {
  // The bare layout's box: 952 x 656 frame units.
  for (let s = 0; s < 200; s++) {
    const { drawing } = generate(s, { frame: false });
    const b = bounds(drawing.points);
    const fill = Math.max((b.maxX - b.minX) / 952, (b.maxY - b.minY) / 656);
    assert.ok(fill >= 0.85 - 1e-3 && fill <= 1 + 1e-3, `seed ${s}: fills ${fill.toFixed(3)}`);
    // The name sits just below the specimen: its baseline 16 units of gap
    // plus most of a line below the lowest point.
    const gap = drawing.label.y - b.maxY;
    assert.ok(gap > 25 && gap < 40, `seed ${s}: name ${gap.toFixed(1)} units below`);
    // Specimen and name together are centred vertically.
    const middle = (b.minY + drawing.label.y + 0.25 * drawing.label.size) / 2;
    assert.ok(Math.abs(middle - drawing.height / 2) < 1, `seed ${s}: centred at ${middle.toFixed(1)}`);
    for (let i = 0; i < drawing.points.length; i += 2) {
      assert.ok(drawing.points[i] >= 0 && drawing.points[i] <= drawing.width);
      assert.ok(drawing.points[i + 1] >= 0 && drawing.points[i + 1] <= drawing.height);
    }
  }
});

test('the same seed is the same moth with or without the frame', () => {
  for (let s = 0; s < 50; s++) {
    const a = generate(s);
    const b = generate(s, { frame: false });
    assert.equal(a.name, b.name);
    assert.equal(a.family, b.family);
  }
});

test('the SVG renderer puts the name where the drawing says', () => {
  const { drawing, name } = generate('luna', { frame: false });
  const svg = toSVG(drawing, { label: name });
  const y = Number(svg.match(/<text x="[^"]+" y="([^"]+)"/)?.[1]);
  assert.ok(Math.abs(y - drawing.label.y) < 1e-6);
});
