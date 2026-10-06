import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Builder, LAYER } from '../src/builder.js';

const BOX = (w, h) => ({ left: 0, top: 0, right: w, bottom: h });
const LABEL = { x: 0, y: 0, size: 10 };

/** Unpacks a Drawing into arrays of [x, y] for easy assertions. */
function lines(d) {
  const out = [];
  for (let l = 0; l < d.offsets.length - 1; l++) {
    const line = [];
    for (let v = d.offsets[l]; v < d.offsets[l + 1]; v++) line.push([d.points[2 * v], d.points[2 * v + 1]]);
    out.push(line);
  }
  return out;
}

test('mirrored lines get a mirror image right after them, in layer order', () => {
  const b = new Builder(4, 2); // tiny capacity forces both grow paths
  b.begin(LAYER.VEIN);
  b.point(10, 0); b.point(20, 10);
  b.begin(LAYER.BODY, false);
  b.point(-5, 0); b.point(5, 0); b.point(5, 10);
  b.end();
  // Box equal to the bounding box's size: scale 1, offset centres x.
  const d = b.pack(40, 10, BOX(40, 10), LABEL);
  const ls = lines(d);
  assert.equal(ls.length, 3);
  assert.deepEqual(ls[0], [[15, 0], [25, 0], [25, 10]]); // body first (layer 0)
  assert.deepEqual(ls[1], [[30, 0], [40, 10]]);           // vein
  assert.deepEqual(ls[2], [[10, 0], [0, 10]]);            // its mirror image
  assert.equal(d.points.length, 14);
  assert.equal(d.offsets.length, 4);
});

test('lines with fewer than two points are dropped', () => {
  const b = new Builder();
  b.begin(LAYER.WING); b.point(1, 1);
  b.begin(LAYER.WING); b.end();
  b.begin(LAYER.WING); b.point(0, 0); b.point(1, 1); b.end();
  assert.equal(b.lineCount, 1);
  assert.equal(b.vertexCount, 2);
});

test('reuse writes exact-length views into big enough buffers', () => {
  const b = new Builder();
  b.begin(LAYER.WING); b.point(1, 1); b.point(2, 2); b.end();
  const reuse = { points: new Float32Array(100), offsets: new Uint32Array(100) };
  const d = b.pack(100, 100, BOX(100, 100), LABEL, reuse);
  assert.equal(d.points.buffer, reuse.points.buffer);
  assert.equal(d.points.length, 8);
  assert.equal(d.offsets.length, 3);
});

test('detached (transferred) buffers are never reused', () => {
  const b = new Builder();
  b.begin(LAYER.WING); b.point(1, 1); b.point(2, 2); b.end();
  const points = new Float32Array(100);
  structuredClone(points.buffer, { transfer: [points.buffer] });
  assert.equal(points.buffer.byteLength, 0);
  const d = b.pack(100, 100, BOX(100, 100), LABEL, { points });
  assert.notEqual(d.points.buffer, points.buffer);
  assert.equal(d.points.length, 8);
});

test('absolute lines are copied as-is and ignored by the fit', () => {
  const b = new Builder();
  b.begin(LAYER.FRAME, false, true);
  b.point(1, 1); b.point(99, 1);
  b.begin(LAYER.WING);
  b.point(0, 0); b.point(10, 10);
  b.end();
  const d = b.pack(100, 100, { left: 40, top: 40, right: 60, bottom: 60 }, LABEL);
  const ls = lines(d);
  assert.deepEqual(ls[0], [[1, 1], [99, 1]]);
  // Specimen spans x in [-10, 10] and y in [0, 10]; the 20 x 20 box scales it by 1.
  assert.deepEqual(ls[1], [[50, 45], [60, 55]]);
  assert.deepEqual(ls[2], [[50, 45], [40, 55]]);
});
