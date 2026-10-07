/**
 * Refills the value table from a generator.
 * @param {Rng} rng
 */
export function seedNoise(rng: Rng): void;
/**
 * 2D value noise in [0, 1), smooth (C1) between grid points.
 * @param {number} x
 * @param {number} y
 */
export function noise2(x: number, y: number): number;
/**
 * Sum of `octaves` layers of noise, each twice the frequency and half the
 * strength of the one before. Result in [0, 1).
 * @param {number} x
 * @param {number} y
 * @param {number} octaves
 */
export function fbm2(x: number, y: number, octaves: number): number;
export type Rng = import("./rng.js").Rng;
