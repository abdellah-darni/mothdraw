/**
 * @param {Builder} b
 * @param {Plan} plan
 * @param {import('./pattern.js').Look} look  pattern numbers (samplePattern)
 * @param {Rng} rng  detail stream: texture and fringe placement
 * @param {{ width: number, height: number }} box  where the specimen will be fitted
 * @param {number} density  texture density, 1 by default
 */
export function drawMoth(b: Builder, plan: Plan, look: import("./pattern.js").Look, rng: Rng, box: {
    width: number;
    height: number;
}, density: number): void;
/**
 * The plate's frame: a rectangle `inset` from the edges of a `width` ×
 * `height` frame, in frame units, drawn with a slight hand wobble.
 * @param {Builder} b @param {number} width @param {number} height @param {number} inset
 */
export function drawFrame(b: Builder, width: number, height: number, inset: number): void;
/** Exposed for tests: the wings of the last moth drawn. */
export function lastWings(): {
    fore: Wing;
    hind: Wing;
};
/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./plans.js').Plan} Plan */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./pattern.js').WingContext} WingContext */
/** Forewing costa length in model units. Everything else scales from it. */
export const L: 400;
export type Builder = import("./builder.js").Builder;
export type Plan = import("./plans.js").Plan;
export type Rng = import("./rng.js").Rng;
export type WingContext = import("./pattern.js").WingContext;
import { Wing } from './wings.js';
