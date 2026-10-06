import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generate } from '../src/index.js';
import { makeName } from '../src/name.js';
import { createRng, hashSeed, stream } from '../src/rng.js';

test('the same seed always gives the same name', () => {
  for (let s = 0; s < 200; s++) assert.equal(generate(s).name, generate(s).name);
  // The name stream alone decides it: same stream state, same name.
  const seed = hashSeed('luna');
  assert.equal(makeName(stream(seed, 'name'), 'Saturniidae'), makeName(stream(seed, 'name'), 'Saturniidae'));
});

test('names are "Genus species" and read as Latin', () => {
  const rng = createRng(1);
  for (let i = 0; i < 5000; i++) {
    for (const family of ['Noctuidae', 'Geometridae', 'Sphingidae', 'Saturniidae']) {
      const name = makeName(rng, family);
      assert.match(name, /^[A-Z][a-z]{4,10} [a-z]{4,10}$/, name);
      for (const word of name.toLowerCase().split(' ')) {
        assert.doesNotMatch(word, /(.)\1\1|(..)\2|[aeiouy]{3}|[^aeiouy]{4}|^y/, name);
      }
    }
  }
});

test('inchworm species carry inchworm endings', () => {
  const rng = createRng(2);
  for (let i = 0; i < 500; i++) assert.match(makeName(rng, 'Geometridae'), /(aria|ata|alis|ella)$/);
});
