// @ts-check
// Body plans: proportions taken from four real moth families. Every number
// is a [low, typical, high] range sampled with a triangular distribution,
// so most moths sit near the typical value of their family.
//
// Lengths, including corner radii, are fractions of the forewing's costa
// length; angles are in degrees. "Forward" means towards the head.

import { chance, pick, sampleRanges, triangular } from './rng.js';

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {[number, number, number]} Range */

/**
 * @typedef {object} ForewingSpec
 * @property {Range} costaAngle   leading edge angle forward of the perpendicular to the body
 * @property {Range} dorsumLength inner margin length (base to tornus)
 * @property {Range} dorsumAngle  inner margin angle behind the perpendicular
 *                                (pinned specimens are set near 0)
 * @property {Range} costaBow     how much the leading edge bows forward (small: nearly straight)
 * @property {Range} termenBow1   outer margin bow near the apex (negative: hollow)
 * @property {Range} termenBow2   outer margin bow near the tornus
 * @property {Range} dorsumBow    inner margin bow
 * @property {Range} apexRound    corner radii
 * @property {Range} tornusRound
 */

/**
 * @typedef {object} HindwingSpec
 * @property {Range} reach       front corner position along the forewing's inner
 *                               margin (1 = at the forewing tornus)
 * @property {Range} tuck        how far that corner sits in front of the inner
 *                               margin, hidden under the forewing
 * @property {Range} size        distance from the base to the anal angle
 * @property {Range} analAngle   direction of the anal angle behind the perpendicular
 * @property {Range} termenBow   outer margin bow: high is round
 * @property {Range} innerBow
 * @property {Range} apexRound
 * @property {Range} tornusRound
 * @property {number} tailChance
 * @property {Range} tailLength
 * @property {Range} tailAngle   direction behind the perpendicular
 * @property {Range} tailTip     half-width of the rounded tip (tiny: pointed)
 */

/**
 * @typedef {object} BodySpec
 * @property {Range} headRadius
 * @property {Range} thoraxLength
 * @property {Range} thoraxWidth    half-width
 * @property {Range} abdomenLength
 * @property {Range} abdomenWidth   half-width
 * @property {Range} abdomenWidest  where along the abdomen it is widest (0..1)
 * @property {Range} abdomenTip     taper exponent: low is pointed, high is blunt
 */

/**
 * @typedef {object} AntennaSpec
 * @property {readonly string[]} types   'thread' | 'serrate' | 'hooked' | 'feather'
 * @property {readonly number[]} weights
 * @property {Range} length
 * @property {Range} angle     from the body axis
 * @property {Range} curve     total outward bend along the length
 * @property {Range} width     feather half-width, or hooked club half-width
 */

/**
 * @typedef {object} LookSpec
 * @property {Range} scallops     scallops along the termen; veins end at the cusps
 * @property {Range} scallopDepth
 * @property {Range} fringe       length of the fringe hairs on the margin
 */

/**
 * @typedef {object} FamilySpec
 * @property {string} name
 * @property {number} weight
 * @property {ForewingSpec} fore
 * @property {HindwingSpec} hind
 * @property {BodySpec} body
 * @property {AntennaSpec} antenna
 * @property {LookSpec} look
 */

/** @type {readonly FamilySpec[]} */
export const FAMILIES = [
  {
    // Hawk moths (Sphinx ligustri, Manduca sexta): long narrow pointed
    // forewings, small hindwings, heavy spindle-shaped body.
    name: 'Sphingidae',
    weight: 2,
    fore: {
      costaAngle: [12, 18, 30],
      dorsumLength: [0.42, 0.52, 0.66],
      dorsumAngle: [2, 10, 16],
      costaBow: [0.01, 0.02, 0.035],
      termenBow1: [-0.08, -0.01, 0.06],
      termenBow2: [0.02, 0.06, 0.1],
      dorsumBow: [-0.02, 0.01, 0.04],
      apexRound: [0.005, 0.02, 0.05],
      tornusRound: [0.025, 0.04, 0.06],
    },
    hind: {
      reach: [0.85, 0.95, 1.05],
      tuck: [0.04, 0.06, 0.08],
      size: [0.3, 0.38, 0.52],
      analAngle: [44, 56, 70],
      termenBow: [0.08, 0.12, 0.16],
      innerBow: [0.0, 0.03, 0.06],
      apexRound: [0.03, 0.04, 0.05],
      tornusRound: [0.04, 0.06, 0.08],
      tailChance: 0,
      tailLength: [0, 0, 0],
      tailAngle: [0, 0, 0],
      tailTip: [0, 0, 0],
    },
    body: {
      headRadius: [0.05, 0.06, 0.07],
      thoraxLength: [0.2, 0.23, 0.26],
      thoraxWidth: [0.08, 0.095, 0.11],
      abdomenLength: [0.5, 0.68, 0.85],
      abdomenWidth: [0.06, 0.088, 0.11],
      abdomenWidest: [0.18, 0.25, 0.32],
      abdomenTip: [1.2, 1.5, 1.9],
    },
    antenna: {
      types: ['hooked'],
      weights: [1],
      length: [0.25, 0.36, 0.48],
      angle: [18, 28, 40],
      curve: [0, 10, 24],
      width: [0.01, 0.013, 0.016],
    },
    look: { scallops: [6, 7, 9], scallopDepth: [0.001, 0.003, 0.012], fringe: [0.006, 0.008, 0.011] },
  },
  {
    // Giant silk moths (Antheraea polyphemus, Actias luna, Saturnia
    // pavonia): broad rounded wings, large round hindwings (sometimes
    // tailed), furry thorax, short stout abdomen, feathery antennae.
    name: 'Saturniidae',
    weight: 2,
    fore: {
      costaAngle: [26, 31, 36],
      dorsumLength: [0.72, 0.78, 0.84],
      dorsumAngle: [0, 3, 7],
      costaBow: [0.015, 0.03, 0.05],
      termenBow1: [-0.02, 0.05, 0.1],
      termenBow2: [0.04, 0.08, 0.13],
      dorsumBow: [0.0, 0.02, 0.05],
      apexRound: [0.05, 0.08, 0.12],
      tornusRound: [0.08, 0.12, 0.16],
    },
    hind: {
      reach: [0.88, 0.95, 1.02],
      tuck: [0.08, 0.12, 0.16],
      size: [0.6, 0.68, 0.76],
      analAngle: [72, 78, 85],
      termenBow: [0.2, 0.26, 0.32],
      innerBow: [0.0, 0.04, 0.08],
      apexRound: [0.06, 0.09, 0.12],
      tornusRound: [0.12, 0.16, 0.2],
      tailChance: 0.35,
      tailLength: [0.4, 0.55, 0.7],
      tailAngle: [74, 80, 88],
      tailTip: [0.025, 0.035, 0.045],
    },
    body: {
      headRadius: [0.045, 0.055, 0.065],
      thoraxLength: [0.17, 0.2, 0.23],
      thoraxWidth: [0.075, 0.09, 0.105],
      abdomenLength: [0.38, 0.45, 0.52],
      abdomenWidth: [0.06, 0.075, 0.09],
      abdomenWidest: [0.3, 0.4, 0.5],
      abdomenTip: [2.2, 2.8, 3.5],
    },
    antenna: {
      types: ['feather'],
      weights: [1],
      length: [0.28, 0.33, 0.38],
      angle: [26, 32, 38],
      curve: [4, 10, 16],
      width: [0.045, 0.06, 0.075],
    },
    look: { scallops: [6, 7, 8], scallopDepth: [0, 0, 0.0015], fringe: [0.004, 0.006, 0.008] },
  },
  {
    // Inchworm moths (Biston betularia, Ourapteryx sambucaria, Geometra
    // papilionaria): broad thin wings, hindwings nearly as large as the
    // forewings and widely exposed, slender body.
    name: 'Geometridae',
    weight: 3,
    fore: {
      costaAngle: [22, 27, 32],
      dorsumLength: [0.68, 0.74, 0.8],
      dorsumAngle: [-2, 2, 6],
      costaBow: [0.005, 0.015, 0.03],
      termenBow1: [-0.01, 0.03, 0.06],
      termenBow2: [0.0, 0.03, 0.06],
      dorsumBow: [-0.01, 0.01, 0.03],
      apexRound: [0.015, 0.035, 0.06],
      tornusRound: [0.05, 0.08, 0.11],
    },
    hind: {
      reach: [0.92, 1.0, 1.08],
      tuck: [0.05, 0.08, 0.11],
      size: [0.58, 0.65, 0.72],
      analAngle: [64, 72, 80],
      termenBow: [0.12, 0.18, 0.24],
      innerBow: [0.0, 0.03, 0.06],
      apexRound: [0.04, 0.06, 0.08],
      tornusRound: [0.1, 0.13, 0.16],
      tailChance: 0.15,
      tailLength: [0.06, 0.09, 0.13],
      tailAngle: [55, 68, 80],
      tailTip: [0.001, 0.002, 0.004],
    },
    body: {
      headRadius: [0.035, 0.042, 0.05],
      thoraxLength: [0.14, 0.17, 0.2],
      thoraxWidth: [0.045, 0.055, 0.065],
      abdomenLength: [0.48, 0.55, 0.62],
      abdomenWidth: [0.032, 0.04, 0.048],
      abdomenWidest: [0.2, 0.3, 0.4],
      abdomenTip: [1.4, 1.8, 2.4],
    },
    antenna: {
      types: ['thread', 'serrate', 'feather'],
      weights: [3, 1, 1],
      length: [0.4, 0.48, 0.56],
      angle: [22, 29, 36],
      curve: [4, 12, 20],
      width: [0.03, 0.04, 0.05],
    },
    look: { scallops: [6, 8, 10], scallopDepth: [0.001, 0.004, 0.009], fringe: [0.007, 0.01, 0.013] },
  },
  {
    // Owlet moths (Noctua pronuba, Catocala nupta, Agrotis): elongated
    // triangular forewings that cover much of the rounded hindwings,
    // robust body.
    name: 'Noctuidae',
    weight: 3,
    fore: {
      costaAngle: [16, 23, 30],
      dorsumLength: [0.56, 0.66, 0.76],
      dorsumAngle: [2, 6, 10],
      costaBow: [0.008, 0.02, 0.035],
      termenBow1: [0.0, 0.04, 0.08],
      termenBow2: [0.02, 0.05, 0.08],
      dorsumBow: [0.0, 0.02, 0.04],
      apexRound: [0.025, 0.045, 0.07],
      tornusRound: [0.04, 0.06, 0.085],
    },
    hind: {
      reach: [0.85, 0.92, 1.0],
      tuck: [0.07, 0.1, 0.13],
      size: [0.46, 0.56, 0.66],
      analAngle: [56, 68, 80],
      termenBow: [0.18, 0.24, 0.3],
      innerBow: [0.0, 0.03, 0.06],
      apexRound: [0.05, 0.07, 0.09],
      tornusRound: [0.1, 0.13, 0.16],
      tailChance: 0,
      tailLength: [0, 0, 0],
      tailAngle: [0, 0, 0],
      tailTip: [0, 0, 0],
    },
    body: {
      headRadius: [0.045, 0.055, 0.065],
      thoraxLength: [0.18, 0.21, 0.24],
      thoraxWidth: [0.07, 0.083, 0.095],
      abdomenLength: [0.52, 0.6, 0.68],
      abdomenWidth: [0.055, 0.067, 0.08],
      abdomenWidest: [0.22, 0.3, 0.38],
      abdomenTip: [1.5, 2, 2.6],
    },
    antenna: {
      types: ['thread', 'serrate'],
      weights: [3, 1],
      length: [0.42, 0.5, 0.58],
      angle: [20, 26, 32],
      curve: [4, 10, 16],
      width: [0.01, 0.01, 0.01],
    },
    look: { scallops: [7, 8, 9], scallopDepth: [0.001, 0.002, 0.004], fringe: [0.008, 0.011, 0.014] },
  },
];

/**
 * A concrete moth: every range replaced by one number.
 * @typedef {object} Plan
 * @property {string} family   the main family (its pattern and antenna type)
 * @property {string} leansTo  the second family its proportions lean towards
 * @property {number} mix      how far, 0 to 0.4
 * @property {Record<keyof ForewingSpec, number>} fore
 * @property {Record<Exclude<keyof HindwingSpec, 'tailChance'>, number> & { tail: boolean }} hind
 * @property {Record<keyof BodySpec, number>} body
 * @property {{ type: string, length: number, angle: number, curve: number, width: number }} antenna
 * @property {{ scallops: number, scallopDepth: number, fringe: number }} look
 */

/**
 * Moves every number in `a` the fraction `t` of the way towards `b`.
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 * @param {number} t
 */
function blend(a, b, t) {
  for (const key in a) a[key] += (b[key] - a[key]) * t;
  return a;
}

/**
 * Samples one moth. It belongs to one family but leans towards a second:
 * every proportion is sampled from both families' ranges and blended,
 * usually by 10 to 20 percent and at most 40. Things that cannot be
 * blended (antenna type, whether there are tails, the pattern) come from
 * the main family.
 * @param {Rng} rng
 * @returns {Plan}
 */
export function samplePlan(rng) {
  const f = pick(rng, FAMILIES, FAMILIES.map((x) => x.weight));
  const g = pick(rng, FAMILIES.filter((x) => x !== f));
  const mix = triangular(rng, 0, 0.12, 0.4);

  const fore = /** @type {Plan['fore']} */ (blend(sampleRanges(rng, f.fore), sampleRanges(rng, g.fore), mix));
  const ownHind = sampleRanges(rng, f.hind);
  const hind = /** @type {Plan['hind']} */ (blend({ ...ownHind }, sampleRanges(rng, g.hind), mix));
  // Tails belong to the main family; a tailless family would shrink them.
  hind.tailLength = ownHind.tailLength;
  hind.tailAngle = ownHind.tailAngle;
  hind.tailTip = ownHind.tailTip;
  hind.tail = chance(rng, f.hind.tailChance);
  const body = /** @type {Plan['body']} */ (blend(sampleRanges(rng, f.body), sampleRanges(rng, g.body), mix));
  const a = blend(sampleRanges(rng, f.antenna), sampleRanges(rng, g.antenna), mix);
  const antenna = {
    type: pick(rng, f.antenna.types, f.antenna.weights),
    length: a.length,
    angle: a.angle,
    curve: a.curve,
    width: a.width,
  };
  const look = /** @type {Plan['look']} */ (blend(sampleRanges(rng, f.look), sampleRanges(rng, g.look), mix));
  look.scallops = Math.round(look.scallops);
  return { family: f.name, leansTo: g.name, mix, fore, hind, body, antenna, look };
}
