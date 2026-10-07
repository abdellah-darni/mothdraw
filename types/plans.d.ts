/**
 * Samples one moth. It belongs to one family but leans towards a second:
 * every proportion is sampled from both families' ranges and blended,
 * usually by 10 to 30 percent and at most MAX_MIX. Things that cannot be
 * blended (antenna type, whether there are tails, the pattern) come from
 * the main family.
 * @param {Rng} rng
 * @returns {Plan}
 */
export function samplePlan(rng: Rng): Plan;
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
 * @property {Range} abdomenReach   where the abdomen ends, relative to the hindwing's
 *                                  anal angle (1: level with it, as on owlet moths)
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
 * @property {Range} wingspan  real wingspan in mm: sets the specimen's size on the plate
 * @property {ForewingSpec} fore
 * @property {HindwingSpec} hind
 * @property {BodySpec} body
 * @property {AntennaSpec} antenna
 * @property {LookSpec} look
 */
/** @type {readonly FamilySpec[]} */
export const FAMILIES: readonly FamilySpec[];
/**
 * A concrete moth: every range replaced by one number.
 * @typedef {object} Plan
 * @property {string} family   the main family (its pattern and antenna type)
 * @property {number} wingspan real-world wingspan, mm (blended like a proportion)
 * @property {string} leansTo  the second family its proportions lean towards
 * @property {number} mix      how far, 0 to MAX_MIX
 * @property {Record<keyof ForewingSpec, number>} fore
 * @property {Record<Exclude<keyof HindwingSpec, 'tailChance'>, number> & { tail: boolean }} hind
 * @property {Record<keyof BodySpec, number>} body
 * @property {{ type: string, length: number, angle: number, curve: number, width: number }} antenna
 * @property {{ scallops: number, scallopDepth: number, fringe: number }} look
 */
/**
 * The furthest a moth may lean towards its second family. Tested by
 * drawing every ordered pair of families at forced blends: at 0.55 every
 * pair reads as a moth of its main family. At 0.8 they still read as moths,
 * but the main family's pattern sits on the other family's shape (hawk moth
 * streaks on silk moth wings), so the family stops being recognisable.
 */
export const MAX_MIX: 0.55;
export type Rng = import("./rng.js").Rng;
export type Range = [number, number, number];
export type ForewingSpec = {
    /**
     * leading edge angle forward of the perpendicular to the body
     */
    costaAngle: Range;
    /**
     * inner margin length (base to tornus)
     */
    dorsumLength: Range;
    /**
     * inner margin angle behind the perpendicular
     * (pinned specimens are set near 0)
     */
    dorsumAngle: Range;
    /**
     * how much the leading edge bows forward (small: nearly straight)
     */
    costaBow: Range;
    /**
     * outer margin bow near the apex (negative: hollow)
     */
    termenBow1: Range;
    /**
     * outer margin bow near the tornus
     */
    termenBow2: Range;
    /**
     * inner margin bow
     */
    dorsumBow: Range;
    /**
     * corner radii
     */
    apexRound: Range;
    tornusRound: Range;
};
export type HindwingSpec = {
    /**
     * front corner position along the forewing's inner
     * margin (1 = at the forewing tornus)
     */
    reach: Range;
    /**
     * how far that corner sits in front of the inner
     * margin, hidden under the forewing
     */
    tuck: Range;
    /**
     * distance from the base to the anal angle
     */
    size: Range;
    /**
     * direction of the anal angle behind the perpendicular
     */
    analAngle: Range;
    /**
     * outer margin bow: high is round
     */
    termenBow: Range;
    innerBow: Range;
    apexRound: Range;
    tornusRound: Range;
    tailChance: number;
    tailLength: Range;
    /**
     * direction behind the perpendicular
     */
    tailAngle: Range;
    /**
     * half-width of the rounded tip (tiny: pointed)
     */
    tailTip: Range;
};
export type BodySpec = {
    headRadius: Range;
    thoraxLength: Range;
    /**
     * half-width
     */
    thoraxWidth: Range;
    /**
     * where the abdomen ends, relative to the hindwing's
     * anal angle (1: level with it, as on owlet moths)
     */
    abdomenReach: Range;
    /**
     * half-width
     */
    abdomenWidth: Range;
    /**
     * where along the abdomen it is widest (0..1)
     */
    abdomenWidest: Range;
    /**
     * taper exponent: low is pointed, high is blunt
     */
    abdomenTip: Range;
};
export type AntennaSpec = {
    /**
     * 'thread' | 'serrate' | 'hooked' | 'feather'
     */
    types: readonly string[];
    weights: readonly number[];
    length: Range;
    /**
     * from the body axis
     */
    angle: Range;
    /**
     * total outward bend along the length
     */
    curve: Range;
    /**
     * feather half-width, or hooked club half-width
     */
    width: Range;
};
export type LookSpec = {
    /**
     * scallops along the termen; veins end at the cusps
     */
    scallops: Range;
    scallopDepth: Range;
    /**
     * length of the fringe hairs on the margin
     */
    fringe: Range;
};
export type FamilySpec = {
    name: string;
    weight: number;
    /**
     * real wingspan in mm: sets the specimen's size on the plate
     */
    wingspan: Range;
    fore: ForewingSpec;
    hind: HindwingSpec;
    body: BodySpec;
    antenna: AntennaSpec;
    look: LookSpec;
};
/**
 * A concrete moth: every range replaced by one number.
 */
export type Plan = {
    /**
     * the main family (its pattern and antenna type)
     */
    family: string;
    /**
     * real-world wingspan, mm (blended like a proportion)
     */
    wingspan: number;
    /**
     * the second family its proportions lean towards
     */
    leansTo: string;
    /**
     * how far, 0 to MAX_MIX
     */
    mix: number;
    fore: Record<keyof ForewingSpec, number>;
    hind: Record<Exclude<keyof HindwingSpec, "tailChance">, number> & {
        tail: boolean;
    };
    body: Record<keyof BodySpec, number>;
    antenna: {
        type: string;
        length: number;
        angle: number;
        curve: number;
        width: number;
    };
    look: {
        scallops: number;
        scallopDepth: number;
        fringe: number;
    };
};
