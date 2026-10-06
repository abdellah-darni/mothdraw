// npm run sheet [-- --out file.png] [-- --start N]
// Renders 24 seeds through the SVG renderer into one page and saves it as
// a PNG with headless Chrome. Fixed seeds by default, so sheets from
// different stages compare like for like.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generate, toSVG } from '../src/index.js';

const args = process.argv.slice(2);
/** @param {string} name  @param {string} fallback */
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const out = resolve(arg('--out', 'out/contact-sheet.png'));
const start = Number(arg('--start', '1'));
const chrome =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const COLS = 6;
const COUNT = 24;
const CELL_W = 400;
const CELL_H = 330;

let cells = '';
for (let i = 0; i < COUNT; i++) {
  const seed = start + i;
  const moth = generate(seed);
  cells += `<figure>${toSVG(moth.drawing, { width: CELL_W - 10, label: moth.name })}<figcaption>seed ${seed}</figcaption></figure>`;
}

const rows = Math.ceil(COUNT / COLS);
const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: #f6f3ec; color: #1d1b18; font: 14px Georgia, serif; }
  main { display: grid; grid-template-columns: repeat(${COLS}, ${CELL_W}px); }
  figure { margin: 0; height: ${CELL_H}px; display: flex; flex-direction: column; align-items: center; border: 0.5px solid #d9d4c7; }
  figcaption { margin-top: auto; padding-bottom: 6px; }
</style><main>${cells}</main>`;

mkdirSync(dirname(out), { recursive: true });
const page = out.replace(/\.png$/, '.html');
writeFileSync(page, html);
execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--window-size=${COLS * CELL_W},${rows * CELL_H}`,
  `--screenshot=${out}`,
  pathToFileURL(page).href,
], { stdio: 'ignore' });
console.log(out);
