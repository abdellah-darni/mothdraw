# mothdraw

A procedural moth drawing generator. A seed goes in; a line drawing of a
pinned moth specimen comes out, different for every seed.

> Work in progress. Stage 5 of 6: plates from four real moth families, and
> a continuous mode that draws them one after another. A performance pass
> comes next.

## Use

```js
import { generate, toSVG, drawDrawing, drawLabel, fitDrawing } from 'mothdraw';

const { drawing, name } = generate('luna');

// Static file, with the name drawn as italic text under the specimen.
// The line weight scales with the plate (default: 1.5 px at 900 px wide).
const svg = toSVG(drawing, { title: name, label: name });

// Canvas: you own the canvas, its size and stroke style
const style = getComputedStyle(canvas);
ctx.strokeStyle = ctx.fillStyle = style.color;
const fit = fitDrawing(drawing, canvas.width, canvas.height);
drawDrawing(ctx, drawing, fit);
drawLabel(ctx, drawing, fit, name, style.fontFamily);
```

### Continuous mode

```js
import { mount } from 'mothdraw';

const plate = mount(document.getElementById('plate'), {
  drawSeconds: 7, // drawing time, whatever the moth's detail
  holdSeconds: 6, // how long a finished moth stays
  onMoth: ({ name, seed, family }) => console.log(name, seed),
});
plate.next();    // skip to a new moth (clicking the plate does the same)
plate.destroy(); // stop everything and remove the canvas
```

- Moths are generated in a Web Worker; the page only draws.
- The main family never repeats twice in a row.
- Colour follows the element's text colour, including theme switches.
- The animation pauses while the tab is hidden.
- Under `prefers-reduced-motion` one finished moth is shown, and a click
  shows the next.

**Vite and Astro.** Production builds work as they are: the worker is
emitted as its own file, and the page bundle contains only the drawing
code. In development, Vite pre-bundles dependencies, which moves the
package away from its worker file, so exclude it:

```js
// astro.config.mjs (or the same `optimizeDeps` block in vite.config.js)
export default defineConfig({ vite: { optimizeDeps: { exclude: ['mothdraw'] } } });
```

`generate` is a pure function with no DOM access, so it runs in Node or in
a Web Worker. A drawing is two flat typed arrays (`points` and `offsets`),
which can be transferred from a worker without copying. See
[DESIGN.md](DESIGN.md) for the format and the reasoning behind it.

## Scripts

| command | what it does |
|---|---|
| `npm test` | unit tests (`node:test`) |
| `npm run bench` | builds the bundle, generates 1,000 moths, prints timing, point count, bundle size and heap |
| `npm run serve` | serves the demos: `http://127.0.0.1:8080/demo/?seed=…` (one plate) and `/demo/continuous.html` (continuous mode) |
| `npm run perf` | measures `generate` and continuous mode in headless Chrome, at normal speed and 6x CPU throttling |
| `npm run sheet` | renders 24 seeds to `out/contact-sheet.png` with headless Chrome (`-- --count 100 --cols 10 --cell 300` for more; set `CHROME` to point at another Chrome binary) |
| `npm run similar` | ranks the first 100 seeds' plates by how alike they look and renders the closest pairs to `out/similar.png` (`-- --crop` compares specimens without their size on the plate) |
| `npm run build` | minified ES module bundle in `dist/` |

Node 22 or later. No runtime dependencies; esbuild is the only dev
dependency.

## Credit

Inspired by [fishdraw](https://github.com/LingDong-/fishdraw) by Lingdong
Huang (MIT). mothdraw borrows its techniques, including parametric anatomy,
hatching and hidden-line clipping, and is written from scratch.

## Licence

MIT © Abdellah Darni
