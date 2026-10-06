// @ts-check
// Demo: one moth from ?seed= in the URL, drawn with the Canvas renderer,
// with an SVG download of the same drawing.

import { drawDrawing, drawLabel, fitDrawing, generate, toSVG } from '../src/index.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('moth'));
const nameEl = /** @type {HTMLElement} */ (document.getElementById('name'));
const statsEl = /** @type {HTMLElement} */ (document.getElementById('stats'));
const form = /** @type {HTMLFormElement} */ (document.getElementById('seed-form'));
const seedInput = /** @type {HTMLInputElement} */ (document.getElementById('seed'));
const randomButton = /** @type {HTMLButtonElement} */ (document.getElementById('random'));
const svgLink = /** @type {HTMLAnchorElement} */ (document.getElementById('svg'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

/** @type {import('../src/generate.js').Moth | undefined} */
let moth;
let svgUrl = '';

/** The demo may use Math.random to pick a seed; the generator never does. */
function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

/** @param {string} seed */
function show(seed) {
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  history.replaceState(null, '', url);
  seedInput.value = seed;

  const t0 = performance.now();
  moth = generate(seed);
  const ms = performance.now() - t0;

  const { drawing } = moth;
  nameEl.textContent = `seed ${seed}`;
  statsEl.textContent =
    `${(drawing.points.length / 2).toLocaleString()} points, ` +
    `${(drawing.offsets.length - 1).toLocaleString()} lines, ${ms.toFixed(1)} ms`;

  if (svgUrl) URL.revokeObjectURL(svgUrl);
  svgUrl = URL.createObjectURL(
    new Blob([toSVG(drawing, { title: moth.name, label: moth.name })], { type: 'image/svg+xml' }),
  );
  svgLink.href = svgUrl;
  svgLink.download = `moth-${seed}.svg`;
  render();
}

function render() {
  if (!moth) return;
  // Size the backing store to the element's size in device pixels.
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  // Canvas cannot use currentColor directly; read the computed colour.
  const style = getComputedStyle(canvas);
  ctx.strokeStyle = ctx.fillStyle = style.color;
  ctx.lineWidth = dpr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const fit = fitDrawing(moth.drawing, w, h);
  drawDrawing(ctx, moth.drawing, fit);
  drawLabel(ctx, moth.drawing, fit, moth.name, style.fontFamily);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  show(seedInput.value.trim() || randomSeed());
});
randomButton.addEventListener('click', () => show(randomSeed()));
new ResizeObserver(render).observe(canvas);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

show(new URLSearchParams(location.search).get('seed') || randomSeed());
