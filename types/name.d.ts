/**
 * @param {Rng} rng   the seed's name stream
 * @param {string} family
 * @returns {string}  e.g. "Phalothena rubricata"
 */
export function makeName(rng: Rng, family: string): string;
export type Rng = import("./rng.js").Rng;
