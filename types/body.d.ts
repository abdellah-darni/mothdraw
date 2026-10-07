/**
 * Head and thorax, and the anchors where the wings and antennae attach.
 * The abdomen comes later (buildAbdomen), once the hindwing is known.
 * @param {Plan['body']} p
 * @param {number} L  forewing length in model units
 * @param {ProfileShape} head
 * @param {ProfileShape} thorax
 * @param {BodyAnchors} anchors
 */
export function buildBody(p: Plan["body"], L: number, head: ProfileShape, thorax: ProfileShape, anchors: BodyAnchors): void;
/**
 * Abdomen: starts under the thorax, swells quickly to its widest point,
 * then tapers to the tip. Its length is tied to the hindwing: the tip sits
 * `abdomenReach` of the way from the abdomen's start to the hindwing's
 * anal angle (owlet moths about level with it, hawk moths well past it).
 * The taper exponent sets pointed or blunt.
 * @param {Plan['body']} p
 * @param {number} L
 * @param {ProfileShape} thorax
 * @param {ProfileShape} abdomen
 * @param {number} analY  y of the hindwing's anal angle
 */
export function buildAbdomen(p: Plan["body"], L: number, thorax: ProfileShape, abdomen: ProfileShape, analY: number): void;
/**
 * Body detail: hair on thorax and head, eyes, collar and tegulae (the
 * shoulder covers at the wing bases), abdominal segments with shading at
 * the sides, and lateral tufts. Alternate segments are darkened at the
 * sides by `abdomenBands` (strong on hawk moths), from `abdomenLateral`
 * of the way out from the midline.
 * @param {Builder} b
 * @param {Record<string, number>} look  uses look.abdomenBands and look.abdomenLateral
 * @param {ProfileShape} head @param {ProfileShape} thorax @param {ProfileShape} abdomen
 * @param {Rng} rng
 */
export function drawBodyDetail(b: Builder, look: Record<string, number>, head: ProfileShape, thorax: ProfileShape, abdomen: ProfileShape, rng: Rng): void;
/**
 * Where the wings attach and the antennae start, filled by buildBody.
 */
export type BodyAnchors = {
    foreX: number;
    /**
     * forewing base
     */
    foreY: number;
    hindX: number;
    /**
     * hindwing base
     */
    hindY: number;
    antX: number;
    /**
     * antenna base
     */
    antY: number;
};
export type Builder = import("./builder.js").Builder;
export type ProfileShape = import("./shapes.js").ProfileShape;
export type Plan = import("./plans.js").Plan;
export type Rng = import("./rng.js").Rng;
