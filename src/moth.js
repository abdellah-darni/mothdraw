// @ts-check
// Assembles one moth from a plan: builds every part, then draws each part
// with the parts in front of it hiding what they cover.
//
// Depth, front to back: antennae, thorax, head, abdomen, forewing, hindwing.

import { drawAntenna } from './antennae.js';
import { buildAbdomen, buildBody, drawBodyDetail } from './body.js';
import { LAYER } from './builder.js';
import { drawVisible } from './clip.js';
import { vlen } from './geom.js';
import { noise2 } from './noise.js';
import { drawWingPattern } from './pattern.js';
import { Polyline } from './polyline.js';
import { ProfileShape } from './shapes.js';
import { buildForewing, buildHindwing, Wing } from './wings.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./plans.js').Plan} Plan */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./pattern.js').WingContext} WingContext */

/** Forewing costa length in model units. Everything else scales from it. */
export const L = 400;

// Scratch parts, reused for every moth.
const head = new ProfileShape();
const thorax = new ProfileShape();
const abdomen = new ProfileShape();
const fore = new Wing();
const hind = new Wing();
const bodyPl = new Polyline(1024);
const spine = new Polyline(64);
const antOutline = new Polyline(128);
const anchors = { foreX: 0, foreY: 0, hindX: 0, hindY: 0, antX: 0, antY: 0 };

// Who hides whom. Front-most first, so the cheap body tests run before the
// wing's.
const NONE = /** @type {const} */ ([]);
const BEHIND_THORAX = [thorax];
const BEHIND_BODY = [thorax, head, abdomen];
const BEHIND_FOREWING = [thorax, abdomen, head, fore.shape];
const BEHIND_HEAD = [head];

/** @type {WingContext} */
const ctx = { b: /** @type {any} */ (null), w: fore, occ: BEHIND_BODY, skip: null, rng: () => 0, L, spacing: 1, cellEnd: 0.5 };

/**
 * Sets the overall texture density on the page: texture cells are sized
 * for this many frame units per model unit. Lower means denser.
 */
const TUNED_SCALE = 1.17;

/**
 * @param {Builder} b
 * @param {Plan} plan
 * @param {import('./pattern.js').Look} look  pattern numbers (samplePattern)
 * @param {Rng} rng  detail stream: texture and fringe placement
 * @param {{ width: number, height: number }} box  where the specimen will be fitted
 * @param {number} density  texture density, 1 by default
 */
export function drawMoth(b, plan, look, rng, box, density) {
  buildBody(plan.body, L, head, thorax, anchors);
  buildForewing(fore, plan.fore, plan.look, L, anchors.foreX, anchors.foreY, rng);
  const analY = buildHindwing(hind, plan.hind, plan.fore, plan.look, L, anchors.hindX, anchors.hindY, anchors.foreX, anchors.foreY, rng);
  buildAbdomen(plan.body, L, thorax, abdomen, analY);

  // Body outlines are symmetric and drawn whole, so they are not mirrored.
  thorax.outline(bodyPl);
  drawVisible(b, LAYER.BODY, false, bodyPl.xy, bodyPl.n, true, null, NONE);
  head.outline(bodyPl);
  drawVisible(b, LAYER.BODY, false, bodyPl.xy, bodyPl.n, true, null, BEHIND_THORAX);
  abdomen.outline(bodyPl);
  drawVisible(b, LAYER.BODY, false, bodyPl.xy, bodyPl.n, true, null, BEHIND_THORAX);
  drawBodyDetail(b, look, head, thorax, abdomen, rng);

  drawVisible(b, LAYER.WING, true, fore.outline.xy, fore.outline.n, true, null, BEHIND_BODY);
  drawVisible(b, LAYER.WING, true, hind.outline.xy, hind.outline.n, true, null, BEHIND_FOREWING);

  // Estimate how large the specimen will be on the page (the builder fits
  // it to the box later), so texture spacing can be set in page units:
  // the same ink density for a broad silk moth as for a narrow hawk moth.
  const halfSpan = Math.max(fore.shape.maxX, hind.shape.maxX);
  const antTip = anchors.antY - plan.antenna.length * L * Math.cos((plan.antenna.angle * Math.PI) / 180);
  const top = Math.min(fore.shape.minY, antTip);
  const bottom = Math.max(hind.shape.maxY, abdomen.y0 + abdomen.dy * (abdomen.n - 1));
  const scale = Math.min(box.width / (2 * halfSpan), box.height / (bottom - top));
  ctx.spacing = TUNED_SCALE / scale / Math.sqrt(density);

  // Patterns, from the same numbers on both wings.
  ctx.b = b;
  ctx.rng = rng;
  ctx.w = fore;
  ctx.occ = BEHIND_BODY;
  ctx.skip = null;
  drawWingPattern(ctx, plan.family, true, false, look);
  ctx.w = hind;
  ctx.occ = BEHIND_FOREWING;
  ctx.skip = fore.shape;
  drawWingPattern(ctx, plan.family, false, plan.hind.tail, look);

  drawFringe(b, fore, BEHIND_BODY);
  drawFringe(b, hind, BEHIND_FOREWING);

  // Keep the antennae at least 12° forward of the costa.
  const maxAngle = ((90 - plan.fore.costaAngle - 12) * Math.PI) / 180;
  drawAntenna(b, plan.antenna, L, anchors.antX, anchors.antY, maxAngle, spine, antOutline, BEHIND_HEAD);
}

const pair = new Float64Array(4);

/**
 * @param {Builder} b @param {Wing} w @param {readonly import('./clip.js').Occluder[]} occ
 */
function drawFringe(b, w, occ) {
  const f = w.fringe.xy;
  for (let i = 0; i + 1 < w.fringe.n; i += 2) {
    pair[0] = f[2 * i];
    pair[1] = f[2 * i + 1];
    pair[2] = f[2 * i + 2];
    pair[3] = f[2 * i + 3];
    drawVisible(b, LAYER.FRINGE, true, pair, 2, false, null, occ);
  }
}

/**
 * The plate's frame: a rectangle `inset` from the edges of a `width` ×
 * `height` frame, in frame units, drawn with a slight hand wobble.
 * @param {Builder} b @param {number} width @param {number} height @param {number} inset
 */
export function drawFrame(b, width, height, inset) {
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;
  const corners = [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
  for (let side = 0; side < 4; side++) {
    const ax = corners[2 * side];
    const ay = corners[2 * side + 1];
    const bx = corners[2 * side + 2];
    const by = corners[2 * side + 3];
    const len = vlen(bx - ax, by - ay);
    const n = Math.ceil(len / 30);
    // Unit normal to this side.
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    b.begin(LAYER.FRAME, false, true);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // No wobble at the corners, so the sides meet cleanly.
      const d = 0.8 * (2 * noise2(t * len * 0.02, 50 + side) - 1) * Math.sin(Math.PI * t);
      b.point(ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d);
    }
    b.end();
  }
}

/** Exposed for tests: the wings of the last moth drawn. */
export function lastWings() {
  return { fore, hind };
}
