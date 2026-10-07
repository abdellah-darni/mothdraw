/**
 * @param {string | number} seed
 * @param {GenerateOptions} [options]
 * @returns {Moth}
 */
export function generate(seed: string | number, options?: GenerateOptions): Moth;
/**
 * The main family a seed will produce, without generating the moth: only
 * the body plan is sampled, which takes microseconds. Continuous mode uses
 * it to avoid showing the same family twice in a row.
 * @param {string | number} seed
 * @returns {string}
 */
export function peekFamily(seed: string | number): string;
/** @typedef {import('./builder.js').Drawing} Drawing */
/** @typedef {import('./builder.js').Reuse} Reuse */
/**
 * @typedef {object} GenerateOptions
 * @property {number} [density]  texture density: 1 is the default plate (about
 *   10,000 to 15,000 points); 0.5 gives roughly half the texture strokes
 * @property {boolean} [frame]  draw the ruled frame (default true). Without it
 *   the specimen fills more of the plate and the name sits just below it, for
 *   a moth placed directly on a page's background.
 * @property {Reuse} [reuse]  previous output arrays to write into, if they fit
 */
/**
 * @typedef {object} Moth
 * @property {Drawing} drawing
 * @property {string} name   pseudo-Latin "Genus species" to show under the specimen
 * @property {string} family the real moth family whose body plan was used
 * @property {string | number} seed  the seed as given
 */
export const FRAME_WIDTH: 1000;
export const FRAME_HEIGHT: 750;
export type Drawing = import("./builder.js").Drawing;
export type Reuse = import("./builder.js").Reuse;
export type GenerateOptions = {
    /**
     * texture density: 1 is the default plate (about
     * 10,000 to 15,000 points); 0.5 gives roughly half the texture strokes
     */
    density?: number | undefined;
    /**
     * draw the ruled frame (default true). Without it
     * the specimen fills more of the plate and the name sits just below it, for
     * a moth placed directly on a page's background.
     */
    frame?: boolean | undefined;
    /**
     * previous output arrays to write into, if they fit
     */
    reuse?: import("./builder.js").Reuse | undefined;
};
export type Moth = {
    drawing: Drawing;
    /**
     * pseudo-Latin "Genus species" to show under the specimen
     */
    name: string;
    /**
     * the real moth family whose body plan was used
     */
    family: string;
    /**
     * the seed as given
     */
    seed: string | number;
};
