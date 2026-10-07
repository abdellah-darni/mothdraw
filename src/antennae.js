// @ts-check
// Antennae: a curved shaft from the head, set forward in a V as on a
// pinned specimen. Three forms:
//   thread   a single fine line (most moths)
//   serrate  a fine line with small saw teeth on its outer side
//   hooked   a thickened shaft ending in a small hook (hawk moths)
//   feather  a shaft with comb-like branches on both sides (silk moths)

import { LAYER } from './builder.js';
import { drawVisible } from './clip.js';
import { smoothstep, vlen } from './geom.js';
import { outlineAround } from './polyline.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./polyline.js').Polyline} Polyline */
/** @typedef {import('./clip.js').Occluder} Occluder */
/** @typedef {import('./plans.js').Plan} Plan */

const DEG = Math.PI / 180;
const SEGMENTS = 48;

/**
 * Builds the shaft as a polyline from the base. The direction starts at
 * `angle` from the body axis and bends outwards by `curve` over the length;
 * the hooked form adds a sharp outward turn at the tip.
 * @param {Plan['antenna']} p
 * @param {number} angle  starting angle from the axis, radians
 * @param {number} len    model units
 * @param {number} x0 @param {number} y0
 * @param {Polyline} out
 */
function shaft(p, angle, len, x0, y0, out) {
  out.reset();
  let x = x0;
  let y = y0;
  out.push(x, y);
  const ds = len / SEGMENTS;
  for (let i = 1; i <= SEGMENTS; i++) {
    const t = (i - 0.5) / SEGMENTS;
    let th = angle + p.curve * DEG * t;
    if (p.type === 'hooked') th += 70 * DEG * smoothstep(0.82, 1, t);
    x += Math.sin(th) * ds;
    y -= Math.cos(th) * ds;
    out.push(x, y);
  }
}

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
export function drawAntenna(b, p, L, x0, y0, maxAngle, spine, outline, occ) {
  const len = p.length * L;
  const angle = Math.min(p.angle * DEG, maxAngle - p.curve * DEG);
  shaft(p, angle, len, x0, y0, spine);
  const xy = spine.xy;
  const n = spine.n;

  if (p.type === 'thread' || p.type === 'serrate') {
    // A slim tapering shape rather than a hairline: widest at the base,
    // narrowing to a point.
    const w0 = 0.0045 * L;
    outlineAround(spine, outline, (t) => w0 * (1 - 0.9 * t));
    drawVisible(b, LAYER.ANTENNA, true, outline.xy, outline.n, true, null, occ);
    if (p.type === 'serrate') {
      // A tooth on every other segment, leaning towards the tip, shrinking
      // along the length.
      for (let i = 4; i < n - 2; i += 2) {
        const t = i / (n - 1);
        const tx = xy[2 * i + 2] - xy[2 * i - 2];
        const ty = xy[2 * i + 3] - xy[2 * i - 1];
        const tl = vlen(tx, ty);
        const l = 0.007 * L * (1 - 0.6 * t);
        // Outer side is to the right of travel for the right antenna.
        const c = Math.cos(50 * DEG);
        const s = Math.sin(50 * DEG);
        const dx = (tx / tl) * c - (ty / tl) * s;
        const dy = (ty / tl) * c + (tx / tl) * s;
        const ex = xy[2 * i] + dx * w0 * (1 - 0.9 * t);
        const ey = xy[2 * i + 1] + dy * w0 * (1 - 0.9 * t);
        b.begin(LAYER.ANTENNA, true);
        b.point(ex, ey);
        b.point(ex + dx * l, ey + dy * l);
        b.end();
      }
    }
    return;
  }

  if (p.type === 'hooked') {
    // Thickest in the outer third (the club), thinning into the hook.
    const w0 = p.width * L;
    outlineAround(spine, outline, (t) => w0 * (0.45 + 0.75 * smoothstep(0, 0.7, t) - 1.1 * smoothstep(0.75, 1, t)));
    drawVisible(b, LAYER.ANTENNA, true, outline.xy, outline.n, true, null, occ);
    return;
  }

  // Feather: a tapering shaft plus paired branches angled towards the tip,
  // longest a little before the middle, giving a leaf-shaped outline.
  outlineAround(spine, outline, (t) => 0.004 * L * (1 - 0.85 * t));
  drawVisible(b, LAYER.ANTENNA, true, outline.xy, outline.n, true, null, occ);
  const wMax = p.width * L;
  // One pair every other shaft segment: denser reads as a solid blob.
  for (let i = 3; i < n - 1; i += 2) {
    const t = i / (n - 1);
    const reach = wMax * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.7);
    if (reach < 0.8) continue;
    const tx = xy[2 * i + 2] - xy[2 * i - 2];
    const ty = xy[2 * i + 3] - xy[2 * i - 1];
    const tl = vlen(tx, ty);
    const ux = tx / tl;
    const uy = ty / tl;
    for (let side = -1; side <= 1; side += 2) {
      // 55° off the shaft, leaning towards the tip.
      const c = Math.cos(55 * DEG);
      const s = Math.sin(55 * DEG) * side;
      const dx = ux * c - uy * s;
      const dy = uy * c + ux * s;
      b.begin(LAYER.ANTENNA, true);
      b.point(xy[2 * i], xy[2 * i + 1]);
      b.point(xy[2 * i] + dx * reach, xy[2 * i + 1] + dy * reach);
      b.end();
    }
  }
}
