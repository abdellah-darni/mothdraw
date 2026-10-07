/**
 * One moth's pattern numbers, sampled from its family's table.
 * @param {Rng} rng
 * @param {string} family
 * @returns {Look}
 */
export function samplePattern(rng: Rng, family: string): Look;
/**
 * Draws one wing's pattern: texture, cross lines, spots and veins.
 * @param {WingContext} c
 * @param {string} family
 * @param {boolean} fore
 * @param {boolean} tailed  hindwing has tails
 * @param {Look} p          this moth's pattern numbers (samplePattern)
 */
export function drawWingPattern(c: WingContext, family: string, fore: boolean, tailed: boolean, p: Look): void;
export type Texture = {
    /**
     * grid spacing (model units): sets the density
     */
    cell: number;
    /**
     * typical stroke length
     */
    len: number;
    /**
     * angle away from the radial direction (radians)
     */
    turn: number;
    /**
     * random angles instead (speckle)
     */
    any: boolean;
    /**
     * random turn of each stroke, radians
     */
    jitter: number;
    /**
     * tone above which a crossing stroke is added (> 1: never)
     */
    cross: number;
    /**
     * chance that a stroke is broken by a small gap
     */
    gap: number;
    /**
     * last row (default 1; beyond 1 reaches into tails)
     */
    uMax?: number | undefined;
};
/**
 * Everything a wing's detail needs to know about its surroundings.
 */
export type WingContext = {
    b: Builder;
    w: Wing;
    /**
     * shapes in front of this wing
     */
    occ: readonly Occluder[];
    /**
     * candidates under this shape are skipped early
     */
    skip: Occluder | null;
    rng: Rng;
    /**
     * forewing length, model units
     */
    L: number;
    /**
     * multiplies every texture cell: set so the
     * ink density on the page is the same for
     * every moth, then by the density option
     */
    spacing: number;
    /**
     * u of the discal cell's outer end, where the
     * radial veins start (set per wing)
     */
    cellEnd: number;
};
export type Eye = {
    x: number;
    /**
     * centre
     */
    y: number;
    /**
     * radial direction (the eye's long axis follows it)
     */
    a: number;
    /**
     * radius along the radial direction
     */
    rx: number;
    /**
     * radius across it
     */
    ry: number;
    rings: number;
    /**
     * clear centre as a fraction of the radius
     */
    window: number;
};
export type Builder = import("./builder.js").Builder;
export type Occluder = import("./clip.js").Occluder;
export type Rng = import("./rng.js").Rng;
export type Wing = import("./wings.js").Wing;
export type Tone = (u: number, v: number, x: number, y: number) => number;
/**
 * one moth's sampled pattern numbers
 */
export type Look = Record<string, number>;
