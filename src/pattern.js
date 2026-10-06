// @ts-check
// Wing patterns. Most of the ink in a naturalist's plate is texture, so
// most of this file is about where short strokes go and how dark each part
// of the wing should be.
//
// Each family gets a tone function: darkness from 0 to 1 at a point,
// written in wing-local coordinates (u from base to margin, v from apex end
// to tornus end; see Wing in wings.js). A jittered grid of candidate
// strokes is laid over the wing and each is kept with probability equal to
// the tone there. Lines (bands, veins, spots) are drawn on top.
//
// The hand-drawn feel comes from variation between strokes: each one
// differs a little in angle, length and position, and some are broken by
// a small gap. A stroke is 2 or 3 points; only long lines get per-point
// wobble.

import { LAYER } from './builder.js';
import { drawStroke, drawVisible } from './clip.js';
import { smoothstep } from './geom.js';
import { fbm2, noise2 } from './noise.js';
import { Polyline } from './polyline.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./clip.js').Occluder} Occluder */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./wings.js').Wing} Wing */
/** @typedef {(u: number, v: number, x: number, y: number) => number} Tone */

const uv = new Float64Array(2);
const xy = new Float64Array(2);
const line = new Polyline(512);

/** @param {number} x */
const bump = (x) => Math.exp(-x * x);

// Stroke directions.
const RADIAL = 0; // away from the wing base: the lie of the scales
const ACROSS = 1; // at right angles to that: follows the bands, like engraving
const ANY = 2; // random: speckle

/**
 * @typedef {object} Texture
 * @property {number} cell    grid spacing (model units): sets the density
 * @property {number} len     typical stroke length
 * @property {number} dir     RADIAL, ACROSS or ANY
 * @property {number} jitter  random turn of each stroke, radians
 * @property {number} cross   tone above which a crossing stroke is added (> 1: never)
 * @property {number} gap     chance that a stroke is broken by a small gap
 */

/**
 * Everything a wing's detail needs to know about its surroundings.
 * @typedef {object} WingContext
 * @property {Builder} b
 * @property {Wing} w
 * @property {readonly Occluder[]} occ   shapes in front of this wing
 * @property {Occluder | null} skip     candidates under this shape are skipped early
 * @property {Rng} rng
 * @property {number} L                  forewing length, model units
 * @property {number} spacing            multiplies every texture cell: set so the
 *                                       ink density on the page is the same for
 *                                       every moth, then by the density option
 */

/**
 * Lays a jittered grid of candidate strokes over the wing and keeps each
 * with probability tone(u, v).
 * @param {WingContext} c
 * @param {Texture} tex
 * @param {Tone} tone
 */
function texture(c, tex, tone) {
  const { b, w, occ, skip, rng } = c;
  const s = w.shape;
  const cell = tex.cell * c.spacing;
  for (let gy = s.minY; gy < s.maxY; gy += cell) {
    for (let gx = s.minX; gx < s.maxX; gx += cell) {
      const x = gx + rng() * cell;
      const y = gy + rng() * cell;
      if (!s.contains(x, y) || (skip !== null && skip.contains(x, y))) continue;
      w.toUV(x, y, uv);
      const t = tone(uv[0], uv[1], x, y);
      if (rng() >= t) continue;
      let a;
      if (tex.dir === ANY) a = rng() * Math.PI;
      else a = Math.atan2(y - w.by, x - w.bx) + (tex.dir === ACROSS ? Math.PI / 2 : 0);
      a += (rng() - 0.5) * 2 * tex.jitter;
      // Darker places get longer strokes: more ink for the same 2 points.
      const len = tex.len * (0.6 + 0.8 * rng()) * (0.55 + 0.9 * Math.min(1, t));
      stroke(c, x, y, a, len, tex.gap);
      // Cross-hatching where darkest. The crossing stroke is offset so the
      // pair does not form an X.
      if (t > tex.cross) {
        const ox = (rng() - 0.5) * cell;
        const oy = (rng() - 0.5) * cell;
        stroke(c, x + ox, y + oy, a + 1.0 + (rng() - 0.5) * 0.3, len * 0.85, tex.gap);
      }
    }
  }
}

/**
 * One texture stroke centred on (x, y). Long strokes get a slight bend
 * through a third point; some are broken by a small gap.
 * @param {WingContext} c @param {number} x @param {number} y
 * @param {number} a @param {number} len @param {number} gap
 */
function stroke(c, x, y, a, len, gap) {
  const { b, w, occ, rng } = c;
  const dx = Math.cos(a) * len * 0.5;
  const dy = Math.sin(a) * len * 0.5;
  if (rng() < gap) {
    drawStroke(b, LAYER.SHADE, true, x - dx, y - dy, x - dx * 0.15, y - dy * 0.15, NaN, NaN, w.shape, occ);
    drawStroke(b, LAYER.SHADE, true, x + dx * 0.2, y + dy * 0.2, x + dx, y + dy, NaN, NaN, w.shape, occ);
  } else if (len > 9) {
    const bend = (rng() - 0.5) * len * 0.08;
    drawStroke(b, LAYER.SHADE, true, x - dx, y - dy, x - dy * bend / len * 2, y + dx * bend / len * 2, x + dx, y + dy, w.shape, occ);
  } else {
    drawStroke(b, LAYER.SHADE, true, x - dx, y - dy, x + dx, y + dy, NaN, NaN, w.shape, occ);
  }
}

/**
 * A line across the wing from costa to dorsum at distance u0 from the
 * base, running a little past both edges so the clip ends it exactly on
 * the outline.
 * @param {WingContext} c
 * @param {number} u0     position
 * @param {number} amp    wave or tooth size, in u
 * @param {number} waves  across the wing
 * @param {number} kind   0 smooth wave, 1 zigzag, 2 dentate (teeth pointing outward)
 * @param {number} bulge  extra outward bow in the middle, in u
 * @param {number} row    noise row for the wobble
 */
function crossLine(c, u0, amp, waves, kind, bulge, row) {
  const { b, w, occ } = c;
  line.reset();
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const v = -0.08 + (1.16 * i) / n;
    const ph = v * waves;
    let off;
    if (kind === 0) off = Math.sin(ph * Math.PI * 2);
    else {
      const f = ph - Math.floor(ph);
      off = kind === 1 ? Math.abs(f * 2 - 1) * 2 - 1 : Math.pow(f, 3) * 2 - 1;
    }
    const u = u0 + amp * off + bulge * Math.sin(Math.PI * Math.max(0, Math.min(1, v))) + 0.006 * (noise2(v * 7, row) - 0.5);
    w.toXY(u, v, xy);
    line.push(xy[0], xy[1]);
  }
  drawVisible(b, LAYER.PATTERN, true, line.xy, line.n, false, w.shape, occ);
}

/**
 * A line between two wing-local points, with gentle wobble.
 * @param {WingContext} c @param {number} layer
 * @param {number} u0 @param {number} v0 @param {number} u1 @param {number} v1
 * @param {number} gap   chance per point of a break
 * @param {number} bend  sideways bow in the middle, in v
 * @param {number} row
 */
function uvLine(c, layer, u0, v0, u1, v1, gap, bend, row) {
  const { b, w, occ, rng } = c;
  w.toXY(u0, v0, xy);
  const x0 = xy[0];
  const y0 = xy[1];
  w.toXY(u1, v1, xy);
  const n = Math.max(2, Math.ceil(Math.hypot(xy[0] - x0, xy[1] - y0) / 5));
  line.reset();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wob = 0.004 * (noise2(t * 5, row) - 0.5);
    w.toXY(u0 + (u1 - u0) * t + wob, v0 + (v1 - v0) * t + bend * Math.sin(Math.PI * t), xy);
    if (gap > 0 && i > 0 && i < n && rng() < gap) {
      drawVisible(b, layer, true, line.xy, line.n, false, w.shape, occ);
      line.reset();
      continue;
    }
    line.push(xy[0], xy[1]);
  }
  drawVisible(b, layer, true, line.xy, line.n, false, w.shape, occ);
}

/**
 * Venation, simplified from the real lepidopteran plan: a closed discal
 * cell in the middle of the wing, veins along the costa and dorsum, and
 * radial veins from the cell to the termen, each ending at a scallop cusp.
 * @param {WingContext} c
 * @param {number} cellEnd  u of the cell's outer end
 * @param {number} gap      chance of small breaks (scales hide veins on some moths)
 */
function veins(c, cellEnd, gap) {
  const k = c.w.scallops;
  // Near the base the veins merge into a few trunks under dense scales, so
  // drawn veins start a little way out; every vein has a few small breaks.
  gap = Math.max(gap, 0.06);
  // Cell: upper edge, outer end, lower edge.
  uvLine(c, LAYER.VEIN, 0.16, 0.33, cellEnd, 0.3, gap, 0, 1.1);
  uvLine(c, LAYER.VEIN, cellEnd, 0.3, cellEnd - 0.05, 0.64, gap, 0, 2.2);
  uvLine(c, LAYER.VEIN, cellEnd - 0.05, 0.64, 0.16, 0.62, gap, 0, 3.3);
  // Costal and anal veins, the anal one broken more so it does not double
  // the inner margin.
  uvLine(c, LAYER.VEIN, 0.14, 0.07, 0.9, 0.02, gap, 0, 4.4);
  uvLine(c, LAYER.VEIN, 0.25, 0.9, 1.04, 0.975, Math.max(gap, 0.3), 0, 5.5);
  // Radial veins bow slightly towards the costa, as real ones do.
  for (let j = 1; j < k; j++) {
    const v = j / k;
    const s = Math.max(0, Math.min(1, (v - 0.12) / 0.76));
    uvLine(c, LAYER.VEIN, cellEnd - 0.05 * s, 0.3 + 0.34 * s, 1.04, v, gap, -0.03, 6.6 + j);
  }
}

/**
 * A closed spot: circle, ellipse, or kidney (dent > 0 pinches one side).
 * @param {WingContext} c
 * @param {number} cx @param {number} cy  centre
 * @param {number} rx @param {number} ry  radii; rx lies along `rot`
 * @param {number} rot
 * @param {number} dent
 */
function spot(c, cx, cy, rx, ry, rot, dent) {
  const { b, w, occ } = c;
  line.reset();
  const n = Math.max(12, Math.ceil((rx + ry) * 1.2));
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 1 - dent * bump((t - Math.PI) / 0.6) + 0.04 * (noise2(t, cx * 0.1) - 0.5);
    const px = Math.cos(t) * rx * r;
    const py = Math.sin(t) * ry * r;
    line.push(cx + px * cr - py * sr, cy + px * sr + py * cr);
  }
  drawVisible(b, LAYER.PATTERN, true, line.xy, line.n, true, w.shape, occ);
}

/**
 * Eyespot: concentric rings around a clear window, as on silk moths.
 * Returns a tone contribution function for the hatching around it.
 * @param {WingContext} c @param {number} u @param {number} v @param {number} R
 * @returns {Tone}
 */
function eyespot(c, u, v, R) {
  c.w.toXY(u, v, xy);
  const ex = xy[0];
  const ey = xy[1];
  spot(c, ex, ey, R, R * 0.92, 0, 0);
  spot(c, ex, ey, R * 0.7, R * 0.64, 0, 0);
  spot(c, ex, ey, R * 0.34, R * 0.3, 0, 0);
  return (_u, _v, x, y) => {
    const d = Math.hypot(x - ex, (y - ey) / 0.92) / R;
    if (d < 0.34) return -9; // the window stays clear
    if (d < 0.7) return 0.25;
    if (d < 1) return 0.85;
    return 0;
  };
}

/**
 * The spot's centre and radius, in model units, at wing-local (u, v).
 * @param {WingContext} c @param {number} u @param {number} v
 */
function at(c, u, v) {
  c.w.toXY(u, v, xy);
  return { x: xy[0], y: xy[1], a: Math.atan2(xy[1] - c.w.by, xy[0] - c.w.bx) };
}

/**
 * Mottling: soft cloudy variation so no two areas are flat.
 * @param {number} x @param {number} y
 */
const mottle = (x, y) => fbm2(x * 0.02, y * 0.02, 2) - 0.45;

// --- Families -------------------------------------------------------------

/**
 * Owlet moths: dusky, dense scaly texture; double zigzag cross lines; the
 * classic kidney (reniform) and ring (orbicular) spots; hindwings pale with
 * a dark border (Noctua) or two dark bands (Catocala).
 * @param {WingContext} c @param {boolean} fore
 */
function noctuid(c, fore) {
  const { rng, L } = c;
  const ph = rng() * 6.3;
  /** @param {number} v */
  const wav = (v) => 0.022 * Math.sin(v * 8 + ph);
  if (fore) {
    const ren = at(c, 0.57, 0.48);
    const orb = at(c, 0.38, 0.4);
    const renR = 0.042 * L;
    texture(c, { cell: 4.2, len: 5.5, dir: RADIAL, jitter: 0.22, cross: 0.95, gap: 0.1 }, (u, v, x, y) => {
      let t = 0.3 + 0.4 * mottle(x, y);
      t += 0.5 * bump((u - 0.32 - wav(v)) / 0.045);
      t += 0.45 * bump((u - 0.64 - wav(v)) / 0.05);
      t += 0.22 * bump((u - 0.49) / 0.06);
      t += 0.45 * smoothstep(0.84, 0.97, u);
      t -= 0.3 * bump((u - 0.77) / 0.035);
      t += 0.25 * bump(u / 0.12);
      if (Math.hypot(x - ren.x, y - ren.y) < renR) t += 0.45;
      return t;
    });
    crossLine(c, 0.3, 0.012, 5, 1, 0, 1);
    crossLine(c, 0.335, 0.012, 5, 1, 0, 2);
    crossLine(c, 0.62, 0.01, 9, 2, 0.02, 3);
    crossLine(c, 0.66, 0.01, 9, 2, 0.02, 4);
    crossLine(c, 0.8, 0.014, 4, 0, 0, 5);
    spot(c, orb.x, orb.y, 0.026 * L, 0.022 * L, orb.a, 0);
    spot(c, ren.x, ren.y, 0.028 * L, renR, ren.a, 0.35);
    veins(c, 0.52, 0.35);
  } else {
    const bands = rng() < 0.5;
    texture(c, { cell: 4.4, len: 5.5, dir: RADIAL, jitter: 0.2, cross: 0.9, gap: 0.08 }, (u, v, x, y) => {
      let t = 0.08 + 0.1 * mottle(x, y) + 0.35 * bump(u / 0.22);
      if (bands) t += 0.8 * bump((u - 0.55 - wav(v)) / 0.06) + 0.8 * bump((u - 0.84 - wav(v)) / 0.05);
      else t += 0.85 * (smoothstep(0.6, 0.68, u) - smoothstep(0.88, 0.95, u));
      return t;
    });
    veins(c, 0.42, 0.25);
  }
}

/**
 * Inchworm moths: pale, with crisp thin cross lines that carry on from the
 * forewing across the hindwing, small discal dots, and dots along the
 * margin between the veins. Three looks:
 *   0 peppered (Biston): fine speckle all over
 *   1 banded (Xanthorhoe): a dark median band between the cross lines
 *   2 clean (the emeralds): almost no speckle, doubled fine lines
 * @param {WingContext} c @param {boolean} fore
 * @param {number} pepper   speckle density, chosen once per moth
 * @param {number} variant  0, 1 or 2
 */
function geometrid(c, fore, pepper, variant) {
  const { b, w, occ, rng, L } = c;
  const dot = at(c, fore ? 0.47 : 0.36, fore ? 0.42 : 0.45);
  const dotR = (variant === 2 ? 0.016 : 0.012) * L;
  const inner = fore ? 0.3 : 0.2;
  const outer = fore ? 0.58 : 0.52;
  const speck = variant === 0 ? pepper : variant === 1 ? pepper * 0.45 : 0.04;
  texture(c, { cell: 3.3, len: 2, dir: ANY, jitter: 0, cross: 2, gap: 0 }, (u, v, x, y) => {
    let t = speck * (0.5 + 1.2 * mottle(x, y)) + 0.1;
    t += 0.25 * smoothstep(0.88, 1, u) + 0.15 * bump(u / 0.18);
    if (Math.hypot(x - dot.x, y - dot.y) < dotR) t += 1;
    return t;
  });
  if (variant === 1) {
    // The band is hatched with short radial strokes, darkest at its edges.
    texture(c, { cell: 3.8, len: 5, dir: RADIAL, jitter: 0.15, cross: 2, gap: 0.08 }, (u, v) => {
      const bow = (fore ? 0.06 : 0.05) * Math.sin(Math.PI * Math.max(0, Math.min(1, v)));
      const lo = inner + 0.02;
      const hi = outer + bow - 0.01;
      if (u < lo || u > hi) return 0;
      const edge = Math.min(u - lo, hi - u) / (hi - lo);
      return (fore ? 0.85 : 0.6) - 0.5 * smoothstep(0, 0.5, edge);
    });
  }
  const pair = variant === 2 ? 0.025 : 0;
  if (fore) {
    crossLine(c, inner, 0.018, 2.5, 0, 0, 11);
    crossLine(c, outer, 0.012, 3, 0, 0.06, 12);
    if (pair) crossLine(c, outer + pair, 0.012, 3, 0, 0.06, 16);
    crossLine(c, 0.83, 0.01, 7, 0, 0, 13);
  } else {
    if (variant === 1) crossLine(c, inner, 0.015, 2.5, 0, 0, 17);
    crossLine(c, outer, 0.012, 3, 0, 0.05, 14);
    if (pair) crossLine(c, outer + pair, 0.012, 3, 0, 0.05, 18);
    crossLine(c, 0.8, 0.01, 7, 0, 0, 15);
  }
  spot(c, dot.x, dot.y, dotR, dotR, 0, 0);
  // Terminal dots: one short dash between each pair of veins.
  const k = w.scallops;
  for (let j = 0; j < k; j++) {
    w.toXY(0.965, (j + 0.5) / k, xy);
    const a = Math.atan2(xy[1] - w.by, xy[0] - w.bx) + Math.PI / 2;
    const l = 1.6 + rng();
    drawStroke(b, LAYER.PATTERN, true, xy[0] - Math.cos(a) * l, xy[1] - Math.sin(a) * l, xy[0] + Math.cos(a) * l, xy[1] + Math.sin(a) * l, NaN, NaN, w.shape, occ);
  }
  veins(c, fore ? 0.5 : 0.4, 0.55);
}

/**
 * Hawk moths: long streaks that follow the wing's length. Two looks:
 *   0 streaked (Sphinx): a dark streak through the middle, pale costa,
 *     dark margin; hindwings crossed by two dark bands
 *   1 banded (Hyles): dark wings crossed by a pale oblique band from the
 *     apex to the inner margin, dark costal patches; hindwings with a pale
 *     band between a dark base and a dark border
 * @param {WingContext} c @param {boolean} fore @param {number} variant  0 or 1
 */
function sphingid(c, fore, variant) {
  const streak = { cell: 3.9, len: 13, dir: RADIAL, jitter: 0.07, cross: 2, gap: 0.15 };
  if (fore && variant === 0) {
    texture(c, streak, (u, v, x, y) => {
      let t = 0.32 + 0.35 * mottle(x, y);
      t += 0.55 * bump((v - (0.72 - 0.45 * u)) / 0.1) * smoothstep(0.15, 0.4, u);
      t -= 0.25 * bump(v / 0.1);
      t += 0.35 * smoothstep(0.88, 1, u);
      t += 0.2 * bump(u / 0.15);
      return t;
    });
    uvLine(c, LAYER.PATTERN, 0.99, 0.02, 0.55, 0.48, 0, 0.03, 21);
  } else if (fore) {
    // The band runs from the apex (u 1, v 0) to the inner margin (u 0.4, v 1).
    texture(c, streak, (u, v, x, y) => {
      const centre = 1 - 0.6 * v;
      let t = 0.62 + 0.3 * mottle(x, y);
      t -= 0.6 * bump((u - centre) / 0.07);
      t += 0.3 * bump((v - 0.08) / 0.07) * (bump((u - 0.3) / 0.06) + bump((u - 0.55) / 0.06));
      return t;
    });
    uvLine(c, LAYER.PATTERN, 1.02, -0.02, 0.38, 1.04, 0, 0.02, 25);
  }
  if (fore) {
    crossLine(c, 0.22, 0.012, 3, 0, 0, 22);
    crossLine(c, 0.3, 0.012, 3, 0, 0, 23);
    if (variant === 0) crossLine(c, 0.38, 0.012, 3, 0, 0, 24);
    veins(c, 0.5, 0.15);
    return;
  }
  texture(c, { cell: 3.8, len: 7, dir: RADIAL, jitter: 0.12, cross: 0.95, gap: 0.1 }, (u, v, x, y) => {
    if (variant === 0) return 0.12 + 0.8 * bump((u - 0.5) / 0.08) + 0.85 * bump((u - 0.82) / 0.065) + 0.3 * bump(u / 0.2) + 0.1 * mottle(x, y);
    return 0.1 + 0.85 * bump(u / 0.38) + 0.85 * smoothstep(0.74, 0.82, u) + 0.1 * mottle(x, y);
  });
  veins(c, 0.4, 0.3);
}

/**
 * Silk moths: engraver's hatching that follows the bands, crossed where dark; a dark
 * costal stripe and pale band beyond a smooth postmedial line; eyespots,
 * large on the hindwing unless it carries tails.
 * @param {WingContext} c @param {boolean} fore @param {boolean} tailed
 */
function saturniid(c, fore, tailed) {
  const { L } = c;
  const R = fore ? 0.032 * L : tailed ? 0.04 * L : 0.075 * L;
  const eye = eyespot(c, fore ? 0.52 : 0.47, fore ? 0.5 : 0.48, R);
  texture(c, { cell: 4.3, len: 8, dir: ACROSS, jitter: 0.1, cross: 0.7, gap: 0.08 }, (u, v, x, y) => {
    let t = 0.22 + 0.25 * mottle(x, y);
    if (fore) t += 0.55 * bump(v / 0.08) * smoothstep(0.04, 0.2, u);
    t -= 0.15 * bump((u - (fore ? 0.73 : 0.78)) / 0.04);
    t += 0.35 * smoothstep(0.86, 1, u);
    t += 0.2 * bump(u / 0.15);
    if (u > 1.02) t = 0.35; // tail
    return t + eye(u, v, x, y);
  });
  if (fore) {
    crossLine(c, 0.25, 0.015, 1.2, 0, 0, 31);
    crossLine(c, 0.68, 0.01, 1.5, 0, 0.02, 32);
  } else {
    crossLine(c, 0.74, 0.012, 2, 0, 0, 33);
    crossLine(c, 0.88, 0.01, 7, 0, 0, 34);
  }
  veins(c, fore ? 0.5 : 0.42, 0.05);
}

/**
 * Draws one wing's pattern: texture, cross lines, spots and veins.
 * @param {WingContext} c
 * @param {string} family
 * @param {boolean} fore
 * @param {boolean} tailed  hindwing has tails
 * @param {number} pepper   inchworm speckle density
 * @param {number} variant  in [0, 1): picks the family's pattern variant
 */
export function drawWingPattern(c, family, fore, tailed, pepper, variant) {
  if (family === 'Noctuidae') noctuid(c, fore);
  else if (family === 'Geometridae') geometrid(c, fore, pepper, Math.floor(variant * 3));
  else if (family === 'Sphingidae') sphingid(c, fore, Math.floor(variant * 2));
  else saturniid(c, fore, tailed);
}
