// @ts-check
// Pseudo-Latin "Genus species" names, built from syllables rather than
// word lists so they cost a few hundred bytes. The endings follow real
// naming habits where they exist: inchworm species often end in -aria or
// -ata, hawk moth genera in -es or -on, silk moth genera in -a or -ias.
// The same generator state always gives the same name.

import { pick } from './rng.js';

/** @typedef {import('./rng.js').Rng} Rng */

const SIMPLE = 'b c d g l m n p r s t v'.split(' ');
const CLUSTER = 'br cr dr gr pr tr ch ph th rh cl gl pl sc sp st ps pt x z'.split(' ');
// Plain vowels are listed more than once so they are picked more often.
const VOWELS = 'a a a a e e e i i i o o o u u y ae eu io'.split(' ');
/** Consonants that end a stem before a vowel-initial ending. */
const JOINS = 'c d g l m n p r s t x ct ll nth ph rr st th'.split(' ');

/** @type {Record<string, { genus: string[], species: string[] }>} */
const ENDINGS = {
  Noctuidae: { genus: ['a', 'ia', 'is', 'otis', 'ena', 'ina', 'odes'], species: ['a', 'alis', 'osa', 'ina', 'ica', 'is'] },
  Geometridae: { genus: ['a', 'ia', 'era', 'ptera', 'ella', 'odes', 'eme'], species: ['aria', 'ata', 'aria', 'ata', 'alis', 'ella'] },
  Sphingidae: { genus: ['es', 'on', 'us', 'ion', 'ix', 'a', 'eus'], species: ['i', 'ae', 'us', 'a', 'ii', 'is'] },
  Saturniidae: { genus: ['a', 'ia', 'ias', 'ea', 'eus', 'is'], species: ['a', 'us', 'is', 'ia', 'ae', 'i'] },
};

/**
 * One word: optional leading vowel, `syllables` consonant-vowel syllables,
 * then the ending (joined by a consonant if the ending starts with a
 * vowel).
 * @param {Rng} rng @param {number} syllables @param {readonly string[]} endings @param {number} vowelStart
 */
function word(rng, syllables, endings, vowelStart) {
  let w = rng() < vowelStart ? pick(rng, VOWELS) : '';
  for (let i = 0; i < syllables; i++) {
    w += pick(rng, rng() < 0.72 ? SIMPLE : CLUSTER) + pick(rng, VOWELS);
  }
  const end = pick(rng, endings);
  return w + (/^[aeiouy]/.test(end) ? pick(rng, JOINS) : '') + end;
}

/**
 * Rejects words that do not read as Latin: a letter three times running,
 * a stutter ("tete"), three vowels or four consonants in a row, more than
 * one diphthong, or a leading y.
 * @param {string} w @param {number} min @param {number} max
 */
function readable(w, min, max) {
  if (w.length < min || w.length > max) return false;
  if (/(.)\1\1|(..)\2|[aeiouy]{3}|[^aeiouy]{4}|^y/.test(w)) return false;
  return (w.match(/ae|eu|io/g) || []).length <= 1;
}

/**
 * @param {Rng} rng   the seed's name stream
 * @param {string} family
 * @returns {string}  e.g. "Phalothena rubricata"
 */
export function makeName(rng, family) {
  const e = ENDINGS[family] || ENDINGS.Noctuidae;
  let genus = '';
  let species = '';
  // A few tries at most; almost every first try passes.
  for (let i = 0; i < 12; i++) {
    genus = word(rng, 1 + Math.floor(rng() * 2.2), e.genus, 0.2);
    if (readable(genus, 5, 11)) break;
  }
  for (let i = 0; i < 12; i++) {
    species = word(rng, 1 + Math.floor(rng() * 1.8), e.species, 0.1);
    if (readable(species, 4, 10)) break;
  }
  return genus[0].toUpperCase() + genus.slice(1) + ' ' + species;
}
