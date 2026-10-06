// @ts-check
// Seeded randomness. Nothing here touches Math.random: every function that
// needs randomness receives an Rng and draws from it.

/** @typedef {() => number} Rng  Returns a float in [0, 1). */

/**
 * Scrambles a 32-bit integer so that inputs differing by one bit give
 * unrelated outputs (the murmur3 finaliser).
 * @param {number} h
 * @returns {number} unsigned 32-bit integer
 */
function mix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Turns any seed into an unsigned 32-bit integer. Numbers and strings go
 * through the same path, so `generate(42)` and `generate('42')` match.
 * FNV-1a over the characters, then mix32 so that "moth1" and "moth2" land
 * far apart.
 * @param {string | number} seed
 * @returns {number}
 */
export function hashSeed(seed) {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/**
 * Creates an sfc32 generator (Chris Doty-Humphrey's "small fast counting"
 * PRNG): 128 bits of state, passes PractRand, and needs only additions,
 * shifts and xors on 32-bit integers.
 * @param {number} seed32 unsigned 32-bit integer, e.g. from hashSeed
 * @returns {Rng}
 */
export function createRng(seed32) {
  // Spread the 32-bit seed over the four state words.
  let s = seed32 >>> 0;
  const next = () => mix32((s = (s + 0x9e3779b9) | 0));
  let a = next();
  let b = next();
  let c = next();
  let d = next();

  const rng = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // The first few outputs still show the seeding pattern; discard them.
  for (let i = 0; i < 12; i++) rng();
  return rng;
}

/**
 * An independent generator for one purpose (for example 'plan', 'detail',
 * 'name'). Each purpose draws from its own stream, so adding a random call
 * in the detail code does not change a seed's body plan or name.
 * @param {number} seed32
 * @param {string} label
 * @returns {Rng}
 */
export function stream(seed32, label) {
  return createRng(mix32(seed32 ^ hashSeed(label)));
}

/**
 * @param {Rng} rng
 * @param {number} lo
 * @param {number} hi
 */
export function uniform(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

/**
 * Integer in [lo, hi], both ends included.
 * @param {Rng} rng
 * @param {number} lo
 * @param {number} hi
 */
export function int(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * True with probability p.
 * @param {Rng} rng
 * @param {number} p
 */
export function chance(rng, p) {
  return rng() < p;
}

/**
 * Triangular distribution: most values near `mode`, never outside
 * [lo, hi]. Sampled by inverting its cumulative distribution.
 * @param {Rng} rng
 * @param {number} lo
 * @param {number} mode
 * @param {number} hi
 */
export function triangular(rng, lo, mode, hi) {
  const span = hi - lo;
  if (span <= 0) return lo;
  const u = rng();
  const f = (mode - lo) / span;
  return u < f
    ? lo + Math.sqrt(u * span * (mode - lo))
    : hi - Math.sqrt((1 - u) * span * (hi - mode));
}

/**
 * Picks one item, optionally weighted.
 * @template T
 * @param {Rng} rng
 * @param {readonly T[]} items
 * @param {readonly number[]} [weights] same length as items
 * @returns {T}
 */
export function pick(rng, items, weights) {
  if (!weights) return items[Math.floor(rng() * items.length)];
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let r = rng() * total;
  for (let i = 0; i < items.length - 1; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
