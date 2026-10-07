/**
 * Draws the right antenna (the builder mirrors it).
 * @param {Builder} b
 * @param {Plan['antenna']} p
 * @param {number} L
 * @param {number} x0 @param {number} y0  base, on the head
 * @param {number} maxAngle  keep the antenna this far forward of the
 *   forewing costa, so the two never overlap (radians from the axis)
 * @param {Polyline} spine   scratch
 * @param {Polyline} outline scratch
 * @param {readonly Occluder[]} occ  the head hides the antenna's root
 */
export function drawAntenna(b: Builder, p: Plan["antenna"], L: number, x0: number, y0: number, maxAngle: number, spine: Polyline, outline: Polyline, occ: readonly Occluder[]): void;
export type Builder = import("./builder.js").Builder;
export type Polyline = import("./polyline.js").Polyline;
export type Occluder = import("./clip.js").Occluder;
export type Plan = import("./plans.js").Plan;
