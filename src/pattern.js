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
// Every pattern is controlled by continuous numbers sampled per moth from
// the family's table of [low, typical, high] ranges below, so two moths of
// a family differ by degrees rather than falling into a few fixed looks.
//
// The hand-drawn feel comes from variation between strokes: each one
// differs a little in angle, length and position, and some are broken by
// a small gap. A stroke is 2 or 3 points; only long lines get per-point
// wobble.

import { LAYER } from './builder.js';
import { drawStroke, drawVisible } from './clip.js';
import { smoothstep, vlen } from './geom.js';
import { fbm2, noise2 } from './noise.js';
import { outlineAround, Polyline } from './polyline.js';
import { sampleRanges } from './rng.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./clip.js').Occluder} Occluder */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./wings.js').Wing} Wing */
/** @typedef {(u: number, v: number, x: number, y: number) => number} Tone */
/** @typedef {Record<string, number>} Look  one moth's sampled pattern numbers */

const uv = new Float64Array(2);
const xy = new Float64Array(2);
const line = new Polyline(512);
const markLine = new Polyline(64);
const markOutline = new Polyline(160);

/** @param {number} x */
const bump = (x) => Math.exp(-x * x);

/**
 * Mottling: soft cloudy variation so no two areas are flat.
 * @param {number} x @param {number} y
 */
const mottle = (x, y) => fbm2(x * 0.02, y * 0.02, 2) - 0.45;

// --- Pattern tables ------------------------------------------------------
// Positions are in wing-local u (base 0, margin 1) and v (apex end 0,
// tornus end 1). Every family also sets how the abdomen is banded.

/** Owlet moths (Noctua, Catocala, Agrotis). */
const NOCTUID = {
  dusk: [0.1, 0.28, 0.55], // ground darkness
  ante: [0.26, 0.31, 0.36], // antemedial double line
  post: [0.58, 0.64, 0.7], // postmedial double line
  gap: [0.022, 0.035, 0.05], // between the two strands of a double line
  wave: [0.01, 0.022, 0.035],
  waves: [4, 7, 11],
  sharp: [0.2, 0.8, 1], // 0 smooth wave, 1 zigzag
  teeth: [0, 0.5, 1], // zigzag towards outward-pointing teeth
  bandDark: [0.2, 0.45, 0.7],
  median: [0, 0.22, 0.45], // median shade between the lines
  terminal: [0.15, 0.45, 0.7], // dark outer area
  pale: [0, 0.3, 0.45], // pale subterminal band
  renU: [0.52, 0.57, 0.62],
  renV: [0.42, 0.48, 0.54],
  ren: [0.03, 0.042, 0.055], // kidney spot size
  orb: [0, 0.024, 0.035], // ring spot size (small means absent)
  claviform: [0, 0.4, 1], // club-shaped spot below the ring spot (above 0.45)
  gamma: [0, 0.15, 1], // silver gamma (Y) mark, as on Autographa (above 0.55)
  gammaU: [0.42, 0.47, 0.52],
  gammaV: [0.55, 0.62, 0.7],
  gammaSize: [0.035, 0.045, 0.06],
  dagger: [0, 0.2, 1], // black dagger dashes, as on Acronicta (above 0.55)
  len: [3.6, 4.3, 5.2], // a little under the row spacing, so rows show
  jitter: [0.08, 0.14, 0.2],
  turn: [-0.15, 0, 0.15],
  border: [0.55, 0.65, 0.75], // hindwing dark border: start
  borderWidth: [0.12, 0.2, 0.3],
  borderDark: [0, 0.6, 0.95],
  innerBand: [0, 0.3, 0.9], // second hindwing band (Catocala) strength
  hindBase: [0.15, 0.3, 0.45],
  hindGround: [0.03, 0.08, 0.45], // hindwing ground: pale (Noctua) to dusky (Agrotis)
  abdomenBands: [0, 0.1, 0.4],
  abdomenLateral: [0.3, 0.45, 0.6],
};

/** Inchworm moths (Biston, Xanthorhoe, the emeralds). */
const GEOMETRID = {
  pepper: [0.06, 0.25, 0.5], // speckle density
  band: [0, 0.2, 1], // dark median band strength
  inner: [0.24, 0.3, 0.36],
  outer: [0.52, 0.58, 0.66],
  bow: [0.02, 0.06, 0.1], // outward bow of the outer line
  pair: [0, 0.01, 0.03], // second strand beside the outer line
  wave: [0.006, 0.015, 0.025],
  waves: [2, 3, 5],
  sub: [0, 0.6, 1], // subterminal line strength (below 0.35: absent)
  subU: [0.78, 0.83, 0.88],
  dot: [0.006, 0.012, 0.02], // discal dot radius
  dots: [0, 0.6, 1], // dots along the margin
  margin: [0.1, 0.25, 0.45], // darkening towards the margin
  melanic: [0, 0.08, 0.8], // overall darkening, as in the dark form of the peppered moth
  outerShade: [0, 0.2, 0.8], // dark shading just outside the outer line
  basal: [0, 0.15, 0.7], // dark patch at the base
  abdomenBands: [0, 0.05, 0.3],
  abdomenLateral: [0.3, 0.45, 0.6],
};

/** Hawk moths (Sphinx, Hyles, Smerinthus). */
const SPHINGID = {
  ground: [0.12, 0.32, 0.6],
  streaks: [0, 1.6, 3.6], // number of dark streaks along the wing (0-3)
  streak: [0.2, 0.5, 0.75],
  streakW: [0.05, 0.09, 0.13],
  slope: [0.3, 0.45, 0.6], // how steeply the streaks run towards the apex
  // Oblique band from the apex to the inner margin: positive is a pale band
  // on a darker wing (Hyles), negative a dark band on a pale wing
  // (Smerinthus), near zero no band.
  oblique: [-0.9, 0.05, 0.9],
  obliqueSlope: [0.35, 0.6, 0.85],
  obliqueAt: [-0.08, 0, 0.08],
  obliqueW: [0.05, 0.08, 0.12],
  costa: [0, 0.2, 0.35], // pale costa
  margin: [0.15, 0.35, 0.5],
  apical: [0, 0.6, 1], // dark line from the apex (below 0.3: absent)
  basal: [0, 2, 3.5], // fine cross lines near the base
  len: [10, 13, 16],
  hindBands: [0, 1.6, 3.4], // 0-3 dark bands
  hindBandAt: [0.4, 0.5, 0.62],
  hindBandW: [0.05, 0.07, 0.1],
  hindBase: [0, 0.35, 0.85],
  hindGround: [0.04, 0.12, 0.5], // hindwing ground: pale to dusky
  hindEye: [0, 0.15, 1], // eyespot on the hindwing, as on the eyed hawk-moth (above 0.6)
  abdomenBands: [0.3, 0.7, 1],
  abdomenLateral: [0.15, 0.3, 0.5],
};

/** Silk moths (Antheraea, Saturnia, Actias). */
const SATURNIID = {
  ground: [0.1, 0.22, 0.35],
  turn: [-0.5, 0.9, 1.57], // hatching angle away from radial (π/2: along the bands)
  cross: [0.55, 0.72, 0.9], // darkness above which hatching is crossed
  len: [6, 8, 10],
  costa: [0, 0.5, 0.8], // dark costal stripe
  ante: [0.2, 0.26, 0.32],
  post: [0.6, 0.68, 0.76],
  pale: [0, 0.15, 0.3], // pale band beyond the postmedial line
  sub: [0.1, 0.35, 0.55], // dark submarginal area
  foreEyes: [0, 0.9, 1.6], // eyespots per forewing: 0 or 1
  hindEyes: [1, 1.25, 2.7], // per hindwing: 1 or 2
  eyeU: [0.42, 0.5, 0.58],
  eyeV: [0.38, 0.5, 0.62],
  foreR: [0.02, 0.032, 0.045],
  hindR: [0.045, 0.07, 0.1],
  rings: [2, 3, 4.9], // 2 to 4 rings
  window: [0, 0.3, 0.45], // clear centre (small: solid dark pupil)
  elong: [0.8, 1, 1.35], // eyespot shape: across / along the radius
  abdomenBands: [0, 0.2, 0.5],
  abdomenLateral: [0.3, 0.45, 0.6],
};

/** @type {Record<string, Record<string, number[]>>} */
const TABLES = { Noctuidae: NOCTUID, Geometridae: GEOMETRID, Sphingidae: SPHINGID, Saturniidae: SATURNIID };

/**
 * One moth's pattern numbers, sampled from its family's table.
 * @param {Rng} rng
 * @param {string} family
 * @returns {Look}
 */
export function samplePattern(rng, family) {
  return sampleRanges(rng, TABLES[family]);
}

// --- Drawing tools -------------------------------------------------------

/**
 * @typedef {object} Texture
 * @property {number} cell    grid spacing (model units): sets the density
 * @property {number} len     typical stroke length
 * @property {number} turn    angle away from the radial direction (radians)
 * @property {boolean} any    random angles instead (speckle)
 * @property {number} jitter  random turn of each stroke, radians
 * @property {number} cross   tone above which a crossing stroke is added (> 1: never)
 * @property {number} gap     chance that a stroke is broken by a small gap
 * @property {number} [uMax]  last row (default 1; beyond 1 reaches into tails)
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
 * @property {number} cellEnd            u of the discal cell's outer end, where the
 *                                       radial veins start (set per wing)
 */

/**
 * Lays candidate strokes in rows, like the rows of scales on a real wing:
 * each row runs parallel to the termen (constant u), rows are `cell` apart,
 * positions along a row are `cell` apart and offset by half a step on
 * alternate rows. In the outer wing a narrow gap is left along each radial
 * vein, so the scales sit between the veins. Each candidate is kept with
 * probability tone(u, v).
 * @param {WingContext} c
 * @param {Texture} tex
 * @param {Tone} tone
 */
function texture(c, tex, tone) {
  const { w, skip, rng } = c;
  const s = w.shape;
  const cell = tex.cell * c.spacing;
  const du = cell / w.radius;
  const uMax = tex.uMax || 1;
  const k = w.scallops;
  let row = 0;
  for (let u = du * 0.6; u < uMax; u += du, row++) {
    const n = Math.max(2, Math.round((Math.min(u, 1) * w.termenLength) / cell));
    const off = row % 2 ? 0.5 : 0;
    // Run a little past v = 0 and 1 to reach the bowed costa and dorsum.
    const extra = Math.ceil(n * 0.1) + 1;
    for (let i = -extra; i <= n + extra; i++) {
      // Small jitter only, so the rows stay legible as rows.
      const v = (i + off + (rng() - 0.5) * 0.16) / n;
      const uu = u + (rng() - 0.5) * 0.12 * du;
      if (nearVein(c, uu, v, k)) continue;
      w.toXY(uu, v, xy);
      const x = xy[0];
      const y = xy[1];
      if (!s.contains(x, y) || (skip !== null && skip.contains(x, y))) continue;
      // Beyond the ends of the termen (along the costa and the inner
      // margin) u no longer measures distance to the outer margin, so
      // margin shading must not apply there: pull u back towards the base.
      const outside = v < 0 ? -v : v > 1 ? v - 1 : 0;
      const t = tone(outside > 0 ? uu * (1 - Math.min(0.45, outside * 3)) : uu, v, x, y);
      if (rng() >= t) continue;
      let a = tex.any ? rng() * Math.PI : Math.atan2(y - w.by, x - w.bx) + tex.turn;
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
 * True if (u, v) lies within a narrow band along one of the radial veins,
 * following the same curve veins() draws.
 * @param {WingContext} c @param {number} u @param {number} v @param {number} k
 */
function nearVein(c, u, v, k) {
  if (k < 2 || u < c.cellEnd) return false;
  const j0 = Math.round(v * k);
  for (let j = Math.max(1, j0 - 1); j <= Math.min(k - 1, j0 + 1); j++) {
    const vj = j / k;
    const s = Math.max(0, Math.min(1, (vj - 0.12) / 0.76));
    const u0 = c.cellEnd - 0.05 * s;
    const v0 = 0.3 + 0.34 * s;
    const t = (u - u0) / (1.04 - u0);
    if (t < 0 || t > 1) continue;
    if (Math.abs(v - (v0 + (vj - v0) * t - 0.03 * Math.sin(Math.PI * t))) < 0.07 / k) return true;
  }
  return false;
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
    drawStroke(b, LAYER.SHADE, true, x - dx, y - dy, x - (dy * bend) / len * 2, y + (dx * bend) / len * 2, x + dx, y + dy, w.shape, occ);
  } else {
    drawStroke(b, LAYER.SHADE, true, x - dx, y - dy, x + dx, y + dy, NaN, NaN, w.shape, occ);
  }
}

/**
 * A line across the wing from costa to dorsum at distance u0 from the
 * base, running a little past both edges so the clip ends it exactly on
 * the outline. Its shape blends continuously from a smooth wave (sharp 0)
 * to a zigzag (sharp 1), and from there towards outward-pointing teeth.
 * @param {WingContext} c
 * @param {number} u0     position
 * @param {number} amp    wave or tooth size, in u
 * @param {number} waves  across the wing
 * @param {number} sharp  0..1
 * @param {number} teeth  0..1
 * @param {number} bulge  extra outward bow in the middle, in u
 * @param {number} row    noise row for the wobble
 */
function crossLine(c, u0, amp, waves, sharp, teeth, bulge, row) {
  const { b, w, occ } = c;
  line.reset();
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const v = -0.08 + (1.16 * i) / n;
    const ph = v * waves;
    const f = ph - Math.floor(ph);
    const wave = Math.sin(ph * Math.PI * 2);
    const zig = Math.abs(f * 2 - 1) * 2 - 1;
    const tooth = Math.pow(f, 3) * 2 - 1;
    const off = wave + (zig - wave) * sharp + (tooth - zig) * teeth * sharp;
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
  const n = Math.max(2, Math.ceil(vlen(xy[0] - x0, xy[1] - y0) / 5));
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
 * @param {number} gap      chance of small breaks (scales hide veins on some moths)
 */
function veins(c, gap) {
  const k = c.w.scallops;
  const cellEnd = c.cellEnd;
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
 * The point at wing-local (u, v), and the radial direction there.
 * @param {WingContext} c @param {number} u @param {number} v
 */
function at(c, u, v) {
  c.w.toXY(u, v, xy);
  return { x: xy[0], y: xy[1], a: Math.atan2(xy[1] - c.w.by, xy[0] - c.w.bx) };
}

/**
 * @typedef {object} Eye
 * @property {number} x @property {number} y   centre
 * @property {number} a     radial direction (the eye's long axis follows it)
 * @property {number} rx    radius along the radial direction
 * @property {number} ry    radius across it
 * @property {number} rings
 * @property {number} window  clear centre as a fraction of the radius
 */

/**
 * Draws an eyespot's ring outlines: the outer edge, the boundary between
 * each pair of rings, and the window (if it is large enough to see).
 * @param {WingContext} c @param {Eye} e
 */
function drawEye(c, e) {
  const inner = e.window > 0.08 ? e.window : 0.18;
  for (let k = 0; k <= e.rings; k++) {
    if (k === e.rings && e.window <= 0.08) break;
    const f = 1 - ((1 - inner) * k) / e.rings;
    spot(c, e.x, e.y, e.rx * f, e.ry * f, e.a, 0);
  }
}

/**
 * Tone of a set of eyespots at (x, y): rings alternate dark and pale from
 * the outside in; the window stays clear, a small window becomes a solid
 * dark pupil. Returns NaN outside every eye.
 * @param {readonly Eye[]} eyes @param {number} x @param {number} y
 */
function eyeTone(eyes, x, y) {
  for (let i = 0; i < eyes.length; i++) {
    const e = eyes[i];
    const dx = x - e.x;
    const dy = y - e.y;
    const ca = Math.cos(e.a);
    const sa = Math.sin(e.a);
    const d = vlen((dx * ca + dy * sa) / e.rx, (-dx * sa + dy * ca) / e.ry);
    if (d >= 1) continue;
    if (d < e.window) return e.window > 0.08 ? -9 : 1.2;
    const k = Math.floor(((1 - d) / (1 - e.window)) * e.rings);
    return k % 2 === 0 ? 0.85 : 0.2;
  }
  return NaN;
}

// --- Families -------------------------------------------------------------

/**
 * Owlet moths: dusky, dense scaly texture; double cross lines from smooth
 * to toothed; the kidney (reniform) and ring (orbicular) spots, and when
 * present a club-shaped claviform, a silver gamma mark (Autographa) or
 * black dagger dashes (Acronicta). Hindwings shade from the margin inward,
 * from pale (Noctua) to dusky, sometimes crossed by a second band
 * (Catocala).
 * @param {WingContext} c @param {boolean} fore @param {Look} p
 */
function noctuid(c, fore, p) {
  const { rng, L } = c;
  c.cellEnd = fore ? 0.52 : 0.42;
  const ph = rng() * 6.3;
  /** @param {number} v */
  const wav = (v) => p.wave * Math.sin(v * p.waves + ph);
  const tex = { cell: 4.2, len: p.len, turn: p.turn, any: false, jitter: p.jitter, cross: 0.95, gap: 0.1 };
  if (fore) {
    const ren = at(c, p.renU, p.renV);
    const orb = at(c, p.renU - 0.19, p.renV - 0.07);
    const renR = p.ren * L;
    marks.n = 0;
    if (p.gamma > 0.55) gammaMark(c, p);
    if (p.dagger > 0.55) daggerMarks(c, p);
    if (p.claviform > 0.45) {
      const cl = at(c, p.renU - 0.17, p.renV + 0.12);
      spot(c, cl.x, cl.y, 0.026 * L * p.claviform, 0.009 * L, cl.a, 0);
      addMark(cl.x - Math.cos(cl.a) * 0.02 * L, cl.y - Math.sin(cl.a) * 0.02 * L, cl.x + Math.cos(cl.a) * 0.02 * L, cl.y + Math.sin(cl.a) * 0.02 * L, 0.008 * L, 1.2);
    }
    texture(c, tex, (u, v, x, y) => {
      const m = markTone(x, y);
      if (m === m) return m;
      let t = p.dusk + 0.4 * mottle(x, y);
      t += p.bandDark * bump((u - p.ante - p.gap / 2 - wav(v)) / 0.045);
      t += p.bandDark * bump((u - p.post - p.gap / 2 - wav(v)) / 0.05);
      t += p.median * bump((u - (p.ante + p.post) / 2) / 0.06);
      t += p.terminal * smoothstep(0.84, 0.97, u);
      t -= p.pale * bump((u - 0.77) / 0.035);
      t += 0.25 * bump(u / 0.12);
      if (vlen(x - ren.x, y - ren.y) < renR) t += 0.45;
      return t;
    });
    crossLine(c, p.ante, p.wave * 0.6, p.waves * 0.6, p.sharp, 0, 0, 1);
    crossLine(c, p.ante + p.gap, p.wave * 0.6, p.waves * 0.6, p.sharp, 0, 0, 2);
    crossLine(c, p.post, p.wave * 0.5, p.waves, p.sharp, p.teeth, 0.02, 3);
    crossLine(c, p.post + p.gap, p.wave * 0.5, p.waves, p.sharp, p.teeth, 0.02, 4);
    crossLine(c, 0.8, 0.014, 4, 0, 0, 0, 5);
    if (p.orb > 0.012 && p.gamma <= 0.55) spot(c, orb.x, orb.y, p.orb * L, p.orb * 0.85 * L, orb.a, 0);
    spot(c, ren.x, ren.y, renR * 0.67, renR, ren.a, 0.35);
    veins(c, 0.35);
  } else {
    // Shading darkens towards the outer margin and fades out inward; a
    // second band, when there is one, crosses the whole wing and is edged
    // by fine lines, so nothing reads as an isolated patch.
    const band = p.border - 0.17;
    texture(c, { ...tex, cell: 4.4, jitter: 0.1, cross: 0.9, gap: 0.08 }, (u, v, x, y) => {
      let t = p.hindGround + 0.05 * mottle(x, y) + 0.5 * p.hindBase * bump(u / 0.15);
      t += p.borderDark * Math.pow(smoothstep(p.border - 0.22, Math.min(0.97, p.border + p.borderWidth), u), 1.4);
      if (p.innerBand > 0.35) t += p.innerBand * (smoothstep(band - 0.045, band - 0.025, u) - smoothstep(band + 0.025, band + 0.045, u));
      return t;
    });
    if (p.innerBand > 0.35) {
      crossLine(c, band - 0.04, 0.008, 5, 0.3, 0, 0, 6);
      crossLine(c, band + 0.04, 0.008, 5, 0.3, 0, 0, 7);
    }
    veins(c, 0.25);
  }
}

// Wing marks (gamma, daggers, claviform): segments with a width and a
// tone, so the texture can leave the inside pale or fill it dark.
const marks = { seg: new Float64Array(6 * 48), n: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} width  half-width
 * @param {number} tone   texture tone inside (-9 keeps it clear)
 */
function addMark(x0, y0, x1, y1, width, tone) {
  if (marks.n === 48) return;
  if (marks.n === 0) {
    marks.minX = marks.minY = Infinity;
    marks.maxX = marks.maxY = -Infinity;
  }
  const o = 6 * marks.n++;
  marks.seg[o] = x0;
  marks.seg[o + 1] = y0;
  marks.seg[o + 2] = x1;
  marks.seg[o + 3] = y1;
  marks.seg[o + 4] = width;
  marks.seg[o + 5] = tone;
  marks.minX = Math.min(marks.minX, x0 - width, x1 - width);
  marks.maxX = Math.max(marks.maxX, x0 + width, x1 + width);
  marks.minY = Math.min(marks.minY, y0 - width, y1 - width);
  marks.maxY = Math.max(marks.maxY, y0 + width, y1 + width);
}

/**
 * Texture tone inside a mark, or NaN outside all of them.
 * @param {number} x @param {number} y
 */
function markTone(x, y) {
  if (marks.n === 0 || x < marks.minX || x > marks.maxX || y < marks.minY || y > marks.maxY) return NaN;
  const sg = marks.seg;
  for (let i = 0; i < marks.n; i++) {
    const o = 6 * i;
    const ex = sg[o + 2] - sg[o];
    const ey = sg[o + 3] - sg[o + 1];
    const l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((x - sg[o]) * ex + (y - sg[o + 1]) * ey) / l2));
    if (vlen(x - sg[o] - t * ex, y - sg[o + 1] - t * ey) < sg[o + 4]) return sg[o + 5];
  }
  return NaN;
}

/**
 * A mark drawn as an outlined stroke along points given in a local frame
 * (x along the radial direction, y towards the dorsum), centred on (cx, cy)
 * and scaled by `size`. Tapers at both ends.
 * @param {WingContext} c @param {readonly number[]} pts @param {number} cx @param {number} cy
 * @param {number} a  radial direction @param {number} size @param {number} width @param {number} tone
 */
function drawMark(c, pts, cx, cy, a, size, width, tone) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  markLine.reset();
  for (let i = 0; i < pts.length; i += 2) {
    const lx = pts[i] * size;
    const ly = pts[i + 1] * size;
    markLine.push(cx + lx * ca - ly * sa, cy + lx * sa + ly * ca);
  }
  const xyl = markLine.xy;
  for (let i = 1; i < markLine.n; i++) addMark(xyl[2 * i - 2], xyl[2 * i - 1], xyl[2 * i], xyl[2 * i + 1], width * 1.2, tone);
  outlineAround(markLine, markOutline, (t) => width * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.85))));
  drawVisible(c.b, LAYER.PATTERN, true, markOutline.xy, markOutline.n, true, c.w.shape, c.occ);
}

// The gamma: a Y whose stem curls back, drawn as two strokes.
const GAMMA_ARM = [-0.9, -0.85, -0.45, -0.35, 0, 0, 0.18, 0.5, 0.05, 0.92, -0.35, 0.95, -0.55, 0.7];
const GAMMA_ARM2 = [0.75, -0.8, 0.35, -0.3, 0.02, 0.02];

/** @param {WingContext} c @param {Look} p */
function gammaMark(c, p) {
  const g = at(c, p.gammaU, p.gammaV);
  const size = p.gammaSize * c.L * (0.8 + 0.4 * (p.gamma - 0.55) / 0.45);
  drawMark(c, GAMMA_ARM, g.x, g.y, g.a, size, size * 0.14, -9);
  drawMark(c, GAMMA_ARM2, g.x, g.y, g.a, size, size * 0.12, -9);
}

/**
 * Dagger marks: a black dash from the base along the middle of the wing,
 * and a dash near the tornus whose outer end forks like a ψ.
 * @param {WingContext} c @param {Look} p
 */
function daggerMarks(c, p) {
  const s = 0.05 * c.L * (0.8 + 0.4 * (p.dagger - 0.55) / 0.45);
  const basal = at(c, 0.17, 0.55);
  drawMark(c, [-1.4, 0, 1.4, 0.05], basal.x, basal.y, basal.a, s, s * 0.09, 1.2);
  const anal = at(c, 0.74, 0.86);
  drawMark(c, [-1.3, 0, 0.6, 0.02, 1.2, -0.35], anal.x, anal.y, anal.a, s, s * 0.08, 1.2);
  drawMark(c, [0.6, 0.02, 1.15, 0.38], anal.x, anal.y, anal.a, s, s * 0.06, 1.2);
}

/**
 * Inchworm moths: pale, with crisp thin cross lines that carry on from
 * the forewing across the hindwing, small discal dots and dots along the
 * margin. Speckle, a dark median band and doubled lines all vary
 * continuously, from peppered (Biston) to banded (Xanthorhoe) to clean
 * (the emeralds).
 * @param {WingContext} c @param {boolean} fore @param {Look} p
 */
function geometrid(c, fore, p) {
  const { b, w, occ, rng, L } = c;
  c.cellEnd = fore ? 0.5 : 0.4;
  const dot = at(c, fore ? 0.47 : 0.36, fore ? 0.42 : 0.45);
  const dotR = p.dot * L;
  const inner = fore ? p.inner : p.inner - 0.1;
  const outer = fore ? p.outer : p.outer - 0.06;
  const bow = fore ? p.bow : p.bow * 0.8;
  texture(c, { cell: 3.7, len: 2.2, turn: 0, any: true, jitter: 0, cross: 2, gap: 0 }, (u, v, x, y) => {
    let t = p.pepper * (0.5 + 1.2 * mottle(x, y)) * (1 - 0.6 * p.band) + 0.08 + p.melanic * 0.7;
    t += p.margin * smoothstep(0.88, 1, u) + (0.15 + p.basal) * bump(u / (inner * 0.75));
    t += p.outerShade * smoothstep(outer + 0.01, outer + 0.05, u - bow * Math.sin(Math.PI * Math.max(0, Math.min(1, v)))) * (1 - smoothstep(outer + 0.12, outer + 0.2, u));
    if (vlen(x - dot.x, y - dot.y) < dotR) t += 1;
    return t;
  });
  if (p.band > 0.15) {
    // The band is hatched with short radial strokes, darkest at its edges.
    texture(c, { cell: 3.8, len: 5, turn: 0, any: false, jitter: 0.15, cross: 2, gap: 0.08 }, (u, v) => {
      const lo = inner + 0.02;
      const hi = outer + bow * Math.sin(Math.PI * Math.max(0, Math.min(1, v))) - 0.01;
      if (u < lo || u > hi) return 0;
      const edge = Math.min(u - lo, hi - u) / (hi - lo);
      return p.band * ((fore ? 0.9 : 0.65) - 0.5 * smoothstep(0, 0.5, edge));
    });
  }
  crossLine(c, inner, p.wave * 1.2, p.waves * 0.8, 0, 0, 0, 11);
  crossLine(c, outer, p.wave, p.waves, 0, 0, bow, 12);
  if (p.pair > 0.008) crossLine(c, outer + p.pair, p.wave, p.waves, 0, 0, bow, 16);
  if (p.sub > 0.35) crossLine(c, fore ? p.subU : p.subU - 0.03, 0.01, 7, p.sub - 0.35, 0, 0, 13);
  spot(c, dot.x, dot.y, dotR, dotR, 0, 0);
  // Terminal dots: one short dash between each pair of veins.
  if (p.dots > 0.25) {
    const k = w.scallops;
    for (let j = 0; j < k; j++) {
      w.toXY(0.965, (j + 0.5) / k, xy);
      const a = Math.atan2(xy[1] - w.by, xy[0] - w.bx) + Math.PI / 2;
      const l = (1 + rng()) * p.dots * 1.6;
      drawStroke(b, LAYER.PATTERN, true, xy[0] - Math.cos(a) * l, xy[1] - Math.sin(a) * l, xy[0] + Math.cos(a) * l, xy[1] + Math.sin(a) * l, NaN, NaN, w.shape, occ);
    }
  }
  veins(c, 0.55);
}

/**
 * Hawk moths: long streaks that follow the wing's length. Zero to three
 * dark streaks, and an oblique band from the apex to the inner margin whose
 * strength, sign and slope all vary: from absent (Sphinx-like), to a pale
 * band on a darker wing (Hyles-like), to a dark band on a pale wing
 * (Smerinthus-like). Hindwings carry zero to three dark bands, a dark base,
 * and sometimes an eyespot (the eyed hawk-moth).
 * @param {WingContext} c @param {boolean} fore @param {Look} p
 */
function sphingid(c, fore, p) {
  c.cellEnd = fore ? 0.5 : 0.4;
  if (fore) {
    const n = Math.floor(p.streaks);
    const ob = p.oblique;
    texture(c, { cell: 3.9, len: p.len, turn: 0, any: false, jitter: 0.07, cross: 2, gap: 0.15 }, (u, v, x, y) => {
      let t = p.ground + 0.35 * mottle(x, y);
      for (let k = 0; k < n; k++) {
        const v0 = 0.3 + (0.5 * (k + 0.5)) / n;
        t += p.streak * bump((v - (v0 + p.slope * (u - 0.6))) / p.streakW) * smoothstep(0.15, 0.4, u);
      }
      t -= p.costa * bump(v / 0.1);
      t += p.margin * smoothstep(0.88, 1, u);
      t += 0.2 * bump(u / 0.15);
      const band = bump((u - (1 - p.obliqueSlope * v + p.obliqueAt)) / p.obliqueW);
      return ob > 0 ? t + ob * (0.25 - 0.85 * band) : t - ob * 0.8 * band;
    });
    if (p.apical > 0.3) uvLine(c, LAYER.PATTERN, 0.99, 0.02, 0.55, 0.48, 0, 0.03, 21);
    if (Math.abs(ob) > 0.4) {
      // Edge the band with a line on each side.
      for (const side of [-1, 1]) {
        const d = side * p.obliqueW * 0.9;
        uvLine(c, LAYER.PATTERN, 1.02 + p.obliqueAt + d, -0.02, 1.04 - p.obliqueSlope * 1.06 + p.obliqueAt + d, 1.04, 0.04, 0.02, 25 + side);
      }
    }
    for (let k = 0; k < Math.floor(p.basal); k++) crossLine(c, 0.2 + 0.08 * k, 0.012, 3, 0, 0, 0, 22 + k);
    veins(c, 0.15);
    return;
  }
  const n = Math.floor(p.hindBands);
  /** @type {Eye[]} */
  const eyes = [];
  if (p.hindEye > 0.6) {
    const e = at(c, 0.62, 0.7);
    const r = 0.035 * c.L * (0.7 + 0.6 * (p.hindEye - 0.6) / 0.4);
    eyes.push({ x: e.x, y: e.y, a: e.a, rx: r, ry: r * 0.9, rings: 2, window: 0.3 });
    drawEye(c, eyes[0]);
  }
  texture(c, { cell: 3.8, len: 7, turn: 0, any: false, jitter: 0.12, cross: 0.95, gap: 0.1 }, (u, v, x, y) => {
    const eye = eyeTone(eyes, x, y);
    if (eye === eye) return eye;
    let t = p.hindGround + p.hindBase * bump(u / 0.35) + 0.1 * mottle(x, y);
    for (let k = 0; k < n; k++) t += 0.8 * bump((u - (p.hindBandAt + (0.32 * k) / Math.max(1, n - 0.5))) / p.hindBandW);
    return t;
  });
  veins(c, 0.3);
}

/**
 * Silk moths: engraver's hatching at an angle that varies from moth to
 * moth, crossed where dark; a dark costal stripe and a pale band beyond a
 * smooth postmedial line; eyespots that vary in number (none or one on
 * each forewing, one or two on each hindwing), position, size, shape,
 * ring count and window. Tailed hindwings carry smaller eyes.
 * @param {WingContext} c @param {boolean} fore @param {boolean} tailed @param {Look} p
 */
function saturniid(c, fore, tailed, p) {
  const { L } = c;
  c.cellEnd = fore ? 0.5 : 0.42;
  /** @type {Eye[]} */
  const eyes = [];
  const count = Math.floor(fore ? p.foreEyes : p.hindEyes);
  const R = (fore ? p.foreR : p.hindR) * (tailed && !fore ? 0.55 : 1) * L;
  for (let k = 0; k < count; k++) {
    const spread = count > 1 ? (k === 0 ? -0.14 : 0.14) : 0;
    const e = at(c, p.eyeU + (fore ? 0.02 : -0.03) + spread * 0.3, p.eyeV + spread);
    const r = R * (count > 1 ? 0.7 : 1);
    eyes.push({ x: e.x, y: e.y, a: e.a, rx: r * p.elong, ry: r, rings: Math.floor(p.rings), window: p.window });
  }
  for (const e of eyes) drawEye(c, e);
  texture(c, { cell: 4.3, len: p.len, turn: p.turn, any: false, jitter: 0.1, cross: p.cross, gap: 0.08, uMax: tailed && !fore ? 2.4 : 1 }, (u, v, x, y) => {
    const eye = eyeTone(eyes, x, y);
    if (eye === eye) return eye;
    let t = p.ground + 0.25 * mottle(x, y);
    if (fore) t += p.costa * bump(v / 0.08) * smoothstep(0.04, 0.2, u);
    t -= p.pale * bump((u - (fore ? p.post + 0.05 : p.post + 0.1)) / 0.04);
    t += p.sub * smoothstep(0.86, 1, u);
    t += 0.2 * bump(u / 0.15);
    if (u > 1.02) t = 0.35; // tail
    return t;
  });
  if (fore) {
    crossLine(c, p.ante, 0.015, 1.2, 0, 0, 0, 31);
    crossLine(c, p.post, 0.01, 1.5, 0, 0, 0.02, 32);
  } else {
    crossLine(c, p.post + 0.06, 0.012, 2, 0, 0, 0, 33);
    crossLine(c, 0.88, 0.01, 7, 0, 0, 0, 34);
  }
  veins(c, 0.05);
}

/**
 * Draws one wing's pattern: texture, cross lines, spots and veins.
 * @param {WingContext} c
 * @param {string} family
 * @param {boolean} fore
 * @param {boolean} tailed  hindwing has tails
 * @param {Look} p          this moth's pattern numbers (samplePattern)
 */
export function drawWingPattern(c, family, fore, tailed, p) {
  if (family === 'Noctuidae') noctuid(c, fore, p);
  else if (family === 'Geometridae') geometrid(c, fore, p);
  else if (family === 'Sphingidae') sphingid(c, fore, p);
  else saturniid(c, fore, tailed, p);
}
