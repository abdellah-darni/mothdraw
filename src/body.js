// @ts-check
// Head, thorax and abdomen as width profiles along the body axis (x = 0,
// head towards negative y). The thorax starts at y = 0.

import { LAYER } from './builder.js';
import { drawStroke, drawVisible } from './clip.js';
import { noise2 } from './noise.js';
import { Polyline } from './polyline.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./shapes.js').ProfileShape} ProfileShape */
/** @typedef {import('./plans.js').Plan} Plan */
/** @typedef {import('./rng.js').Rng} Rng */

/** Row spacing of the body profiles, in model units. */
const ROW = 2;
/** Hand-drawn wobble of the body outlines, model units. */
const WOBBLE = 0.35;

const line = new Polyline(64);
const NONE = /** @type {const} */ ([]);

/**
 * Where the wings attach and the antennae start, filled by buildBody.
 * @typedef {object} BodyAnchors
 * @property {number} foreX @property {number} foreY  forewing base
 * @property {number} hindX @property {number} hindY  hindwing base
 * @property {number} antX  @property {number} antY   antenna base
 */

/**
 * Nudges each row's width by smooth noise, keeping the zero-width ends at
 * zero, so the outline looks drawn by hand and stays symmetric.
 * @param {ProfileShape} shape @param {number} row
 */
function wobble(shape, row) {
  for (let i = 1; i < shape.n - 1; i++) {
    const w = shape.w[i];
    shape.w[i] = Math.max(0, w + WOBBLE * (2 * noise2(i * 0.12, row) - 1) * Math.min(1, w / 3));
  }
}

/**
 * @param {Plan['body']} p
 * @param {number} L  forewing length in model units
 * @param {ProfileShape} head
 * @param {ProfileShape} thorax
 * @param {ProfileShape} abdomen
 * @param {BodyAnchors} anchors
 */
export function buildBody(p, L, head, thorax, abdomen, anchors) {
  const tl = p.thoraxLength * L;
  const tw = p.thoraxWidth * L;

  // Thorax: a squarish oval (superellipse), a little narrower at the front
  // where the collar meets the head.
  let n = thorax.reset(0, tl, ROW);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = Math.abs(2 * t - 1);
    thorax.w[i] = tw * Math.pow(1 - Math.pow(u, 2.6), 1 / 2.6) * (0.86 + 0.14 * Math.min(1, 2 * t));
  }
  wobble(thorax, 41);
  thorax.finish();

  // Head: round, slightly wider at the back where the eyes bulge, tucked
  // partly under the front of the thorax.
  const hr = p.headRadius * L;
  const hy = -hr * 0.55;
  n = head.reset(hy - hr, 2 * hr, ROW);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 2 * t - 1;
    head.w[i] = hr * Math.sqrt(Math.max(0, 1 - u * u)) * (0.92 + 0.16 * t);
  }
  wobble(head, 42);
  head.finish();

  // Abdomen: starts under the thorax, swells quickly to its widest point,
  // then tapers to the tip. The taper exponent sets pointed or blunt.
  const al = p.abdomenLength * L;
  const aw = p.abdomenWidth * L;
  const widest = p.abdomenWidest;
  n = abdomen.reset(tl * 0.8, al, ROW);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let w;
    if (t < widest) {
      w = Math.pow(Math.sin((Math.PI / 2) * (t / widest)), 0.55);
    } else {
      const s = (t - widest) / (1 - widest);
      w = Math.pow(Math.max(0, 1 - Math.pow(s, p.abdomenTip)), 0.7);
    }
    abdomen.w[i] = aw * w;
  }
  abdomen.w[n - 1] = 0;
  wobble(abdomen, 43);
  abdomen.finish();

  anchors.foreX = tw * 0.55;
  anchors.foreY = tl * 0.28;
  anchors.hindX = tw * 0.5;
  // Level with the forewing base, so the forewing covers the hindwing's
  // leading edge all the way to the body (the thorax hides both roots).
  anchors.hindY = tl * 0.24;
  anchors.antX = hr * 0.38;
  anchors.antY = hy - hr * 0.72;
}

/**
 * Half-width of a profile at height y (0 outside it).
 * @param {ProfileShape} s @param {number} y
 */
function widthAt(s, y) {
  const k = (y - s.y0) / s.dy;
  if (!(k >= 0 && k < s.n - 1)) return 0;
  const i = k | 0;
  return s.w[i] + (s.w[i + 1] - s.w[i]) * (k - i);
}

/**
 * Hair over the right half of a profile shape: short strokes on a jittered
 * grid, combed backward and outward, kept with probability `density(x/w)`
 * where x/w is 0 on the axis and 1 at the edge. Mirrored like the wings.
 * @param {Builder} b @param {ProfileShape} s @param {readonly import('./clip.js').Occluder[]} occ
 * @param {Rng} rng @param {number} cell @param {number} len @param {number} splay
 * @param {(f: number, y: number) => number} density
 */
function hair(b, s, occ, rng, cell, len, splay, density) {
  const y1 = s.y0 + s.dy * (s.n - 1);
  for (let gy = s.y0; gy < y1; gy += cell) {
    for (let gx = 0; gx < s.maxW; gx += cell) {
      const x = gx + rng() * cell;
      const y = gy + rng() * cell;
      const w = widthAt(s, y);
      if (x >= w) continue;
      const f = x / w;
      if (rng() >= density(f, y)) continue;
      // Pointing backward (+y), fanning outward towards the edges.
      const a = Math.PI / 2 - splay * f - (rng() - 0.5) * 0.4;
      const l = len * (0.6 + 0.8 * rng());
      drawStroke(b, LAYER.SHADE, true, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, NaN, NaN, s, occ);
    }
  }
}

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
export function drawBodyDetail(b, look, head, thorax, abdomen, rng) {
  const behindThorax = [thorax];
  const tw = thorax.maxW;
  const tl = thorax.dy * (thorax.n - 1);

  // Thorax: dense hair, then the collar and the tegula curves on top.
  hair(b, thorax, NONE, rng, 3.4, 5.5, 0.9, () => 0.75);
  line.reset();
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    line.push(t * tw * 0.95, tl * (0.13 + 0.06 * t * t));
  }
  drawVisible(b, LAYER.BODY, true, line.xy, line.n, false, thorax, NONE);
  line.reset();
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    line.push(tw * (0.32 + 0.55 * Math.sin(t * 1.4)), tl * (0.16 + 0.55 * t));
  }
  drawVisible(b, LAYER.BODY, true, line.xy, line.n, false, thorax, NONE);

  // Head: an eye on each side, with a few strokes of shine, and fine hair.
  const hr = head.maxW;
  const hcy = head.y0 + (head.dy * (head.n - 1)) / 2;
  const ex = hr * 0.66;
  const ey = hcy + hr * 0.1;
  const er = hr * 0.34;
  line.reset();
  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    line.push(ex + Math.cos(t) * er, ey + Math.sin(t) * er);
  }
  drawVisible(b, LAYER.BODY, true, line.xy, line.n, true, null, behindThorax);
  for (let k = 0; k < 3; k++) {
    const o = (k - 1) * er * 0.38;
    drawStroke(b, LAYER.SHADE, true, ex - er * 0.55, ey + o - er * 0.2, ex + er * 0.55, ey + o + er * 0.2, NaN, NaN, null, behindThorax);
  }
  hair(b, head, behindThorax, rng, 3, 3.5, 0.6, (f) => (f < 0.5 ? 0.5 : 0));

  // Abdomen: segment lines bowed backward, hair shading towards the sides
  // (banded on hawk moths), and tufts along the edge.
  const ay0 = abdomen.y0;
  const al = abdomen.dy * (abdomen.n - 1);
  const segs = 7;
  for (let k = 1; k <= segs; k++) {
    const y = ay0 + al * (0.1 + (0.8 * k) / (segs + 1));
    const w = widthAt(abdomen, y);
    if (w < 2) continue;
    line.reset();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      line.push(t * w * 1.05, y + w * 0.28 * (1 - t * t));
    }
    drawVisible(b, LAYER.BODY, true, line.xy, line.n, false, abdomen, behindThorax);
  }
  hair(b, abdomen, behindThorax, rng, 3.2, 4.5, 0.5, (f, y) => {
    let t = 0.15 + 0.6 * f * f;
    const s = (((y - ay0) / al - 0.1) * (segs + 1)) / 0.8;
    if (f > look.abdomenLateral && Math.floor(s) % 2 === 1) t += 0.7 * look.abdomenBands;
    return t;
  });
  for (let y = ay0 + al * 0.15; y < ay0 + al * 0.95; y += 4) {
    const w = widthAt(abdomen, y);
    if (w < 2 || rng() < 0.4) continue;
    const a = 0.5 + rng() * 0.4;
    const l = 2 + rng() * 2.5;
    drawStroke(b, LAYER.SHADE, true, w - 0.5, y, w - 0.5 + Math.cos(a) * l, y + Math.sin(a) * l, NaN, NaN, null, behindThorax);
  }
}
