// @ts-check
// Head, thorax and abdomen as width profiles along the body axis (x = 0,
// head towards negative y). The thorax starts at y = 0.

/** @typedef {import('./shapes.js').ProfileShape} ProfileShape */
/** @typedef {import('./plans.js').Plan} Plan */

/** Row spacing of the body profiles, in model units. */
const ROW = 1;

/**
 * Where the wings attach and the antennae start, filled by buildBody.
 * @typedef {object} BodyAnchors
 * @property {number} foreX @property {number} foreY  forewing base
 * @property {number} hindX @property {number} hindY  hindwing base
 * @property {number} antX  @property {number} antY   antenna base
 */

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
