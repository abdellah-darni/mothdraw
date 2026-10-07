/**
 * Turns any seed into an unsigned 32-bit integer. Numbers and strings go
 * through the same path, so `generate(42)` and `generate('42')` match.
 * FNV-1a over the characters, then mix32 so that "moth1" and "moth2" land
 * far apart.
 * @param {string | number} seed
 * @returns {number}
 */
export function hashSeed(seed: string | number): number;
/**
 * Creates an sfc32 generator (Chris Doty-Humphrey's "small fast counting"
 * PRNG): 128 bits of state, passes PractRand, and needs only additions,
 * shifts and xors on 32-bit integers.
 * @param {number} seed32 unsigned 32-bit integer, e.g. from hashSeed
 * @returns {Rng}
 */
export function createRng(seed32: number): Rng;
/**
 * An independent generator for one purpose (for example 'plan', 'detail',
 * 'name'). Each purpose draws from its own stream, so adding a random call
 * in the detail code does not change a seed's body plan or name.
 * @param {number} seed32
 * @param {string} label
 * @returns {Rng}
 */
export function stream(seed32: number, label: string): Rng;
/**
 * @param {Rng} rng
 * @param {number} lo
 * @param {number} hi
 */
export function uniform(rng: Rng, lo: number, hi: number): number;
/**
 * Integer in [lo, hi], both ends included.
 * @param {Rng} rng
 * @param {number} lo
 * @param {number} hi
 */
export function int(rng: Rng, lo: number, hi: number): number;
/**
 * True with probability p.
 * @param {Rng} rng
 * @param {number} p
 */
export function chance(rng: Rng, p: number): boolean;
/**
 * Triangular distribution: most values near `mode`, never outside
 * [lo, hi]. Sampled by inverting its cumulative distribution.
 * @param {Rng} rng
 * @param {number} lo
 * @param {number} mode
 * @param {number} hi
 */
export function triangular(rng: Rng, lo: number, mode: number, hi: number): number;
/**
 * Picks one item, optionally weighted.
 * @template T
 * @param {Rng} rng
 * @param {readonly T[]} items
 * @param {readonly number[]} [weights] same length as items
 * @returns {T}
 */
export function pick<T>(rng: Rng, items: readonly T[], weights?: readonly number[]): T;
/**
 * Samples every [low, typical, high] range in a table (other entries are
 * skipped), in the table's key order, so the result is the same for the
 * same generator state.
 * @param {Rng} rng
 * @param {Record<string, any>} spec
 * @returns {Record<string, number>}
 */
export function sampleRanges(rng: Rng, spec: Record<string, any>): Record<string, number>;
/**
 * Returns a float in [0, 1).
 */
export type Rng = () => number;
