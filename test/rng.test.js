import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, hashSeed, pick, stream, triangular } from '../src/rng.js';

test('same seed gives the same sequence', () => {
  const a = createRng(hashSeed('moth'));
  const b = createRng(hashSeed('moth'));
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});

test('numbers and strings hash alike', () => {
  assert.equal(hashSeed(42), hashSeed('42'));
});

test('nearby seeds and different streams diverge', () => {
  assert.notEqual(createRng(hashSeed('moth1'))(), createRng(hashSeed('moth2'))());
  const s = hashSeed('x');
  assert.notEqual(stream(s, 'plan')(), stream(s, 'name')());
});

test('output stays in [0, 1) with a sane mean', () => {
  const r = createRng(7);
  let sum = 0;
  for (let i = 0; i < 100000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  assert.ok(Math.abs(sum / 100000 - 0.5) < 0.01);
});

test('triangular stays in range and pick respects zero weights', () => {
  const r = createRng(1);
  for (let i = 0; i < 10000; i++) {
    const v = triangular(r, 2, 3, 7);
    assert.ok(v >= 2 && v <= 7);
    assert.equal(pick(r, ['a', 'b', 'c'], [0, 1, 0]), 'b');
  }
});
