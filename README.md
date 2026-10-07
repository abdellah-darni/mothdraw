# mothdraw

Procedural moth drawings in the style of a naturalist's plate. A seed goes
in; a pen-and-ink line drawing of a pinned moth specimen comes out, with a
pseudo-Latin name and, unless you turn it off, a ruled frame. Every seed
gives a different moth.

The moths are built from the body plans of four real families: hawk moths,
silk moths, inchworms and owlet moths. Each moth blends towards a second
family and varies its patterns continuously. The drawing is lines only, so
it works on any background and takes its colour from the page.

There is a continuous mode for pages such as a 404 page: it draws moth
after moth, stroke by stroke like a pen, in a Web Worker so the page never
stalls.

## Install

Straight from the GitHub repository:

```sh
npm install github:abdellah-darni/mothdraw
```

No build step: the package ships its ES module source, and your bundler
(Vite, esbuild, Rollup, webpack) bundles it. No runtime dependencies.

## Continuous mode

```js
import { mount } from 'mothdraw';

const plate = mount(document.getElementById('plate'), {
  onMoth: ({ name, seed, family }) => console.log(name, seed),
});

plate.next();    // skip to a new moth (clicking or tapping the plate does the same)
plate.destroy(); // stop everything, end the worker, remove the canvas
```

The plate fills the element you give it, so give the element a size.

| option | default | |
|---|---|---|
| `drawSeconds` | `7` | time to draw one moth, whatever its level of detail |
| `holdSeconds` | `6` | how long a finished moth stays before the next |
| `fadeSeconds` | `0.8` | fade-in of the name, at the start of the hold |
| `seed` | random | a fixed sequence instead: `seed`, `seed-1`, `seed-2`, … |
| `density` | `1` | amount of texture; `0.5` is about half |
| `frame` | `true` | the ruled frame; `false` puts the moth directly on the page's background (see below) |
| `lineWidth` | 1.5 px on a 900 px plate | stroke width in drawing units (the plate is 1000 units wide); it scales with the plate |
| `onMoth` | | called as each moth starts, with `{ name, seed, family }` |
| `workerUrl` | | the worker script's URL, if your bundler cannot resolve it |

Behaviour:

- **Never the same main family twice in a row.**
- **Colour** is the element's text colour (CSS `color`). When the theme
  changes, the current moth is redrawn in the new colour without being
  regenerated. That covers the system setting and a `class`, `style` or
  `data-theme` change on `<html>` or `<body>`.
- **Sharp** on high-density screens, at up to 2× device pixels. Redrawn
  on resize.
- **Pauses** while the tab is hidden and resumes where it stopped. No
  animation frames are requested while a moth is held or the tab is hidden.
- **Reduced motion:** under `prefers-reduced-motion: reduce` one finished
  moth is shown, with no drawing animation and no automatic cycling. A
  click still shows the next one.
- **Fallback:** if the worker cannot be created (for example, a Content
  Security Policy without `worker-src 'self'`), fails to load, or does not
  answer within 1.5 s, moths are made on the main thread in idle time
  instead. The page is never left empty.

### Without the frame

`frame: false` (in `mount()` or `generate()`) leaves out the frame lines,
for a moth that sits directly on the page's background:

- The specimen fills 85% to 100% of the plate, depending on its real
  size. With the frame the range is 70% to 100%. Moths still vary in size
  by family, but none looks lost.
- The name sits just below the specimen instead of at the bottom of the
  plate, and the two are centred together.

```js
mount(document.getElementById('plate'), { frame: false });
```

### Astro (and Vite)

```astro
---
// src/pages/404.astro
---
<div id="plate" style="width: 100%; aspect-ratio: 4 / 3;"></div>
<script>
  import { mount } from 'mothdraw';
  mount(document.getElementById('plate'));
</script>
```

No configuration is needed with Astro 7 (Vite 8), in development or in
production. This was tested in a fresh Astro 7.3 project, installing from
git. The build emits the worker as its own file. The page bundle contains
only the drawing code: about 3 KB after Brotli, plus about 14.5 KB for the
worker. The main-thread fallback is a separate chunk, downloaded only if
it is needed.

With **Vite 6 or older**, production builds also work as they are. In
development, though, Vite's dependency pre-bundling moves the package away
from its worker file. Moths are then made on the main thread instead,
which works but is slower. To keep the worker in development, exclude the
package from pre-bundling:

```js
// vite.config.js (or `vite: { … }` in astro.config.mjs)
export default { optimizeDeps: { exclude: ['mothdraw'] } };
```

## Single plates

```js
import { generate, toSVG, fitDrawing, drawDrawing, drawLabel } from 'mothdraw';

const { drawing, name, family } = generate('luna'); // same seed, same moth
const bare = generate('luna', { frame: false });     // the same moth, no frame

// A standalone SVG file; the name is drawn as italic text under the specimen.
const svg = toSVG(drawing, { title: name, label: name });

// Canvas: you own the canvas, its size and its colour.
const style = getComputedStyle(canvas);
ctx.strokeStyle = ctx.fillStyle = style.color;
const fit = fitDrawing(drawing, canvas.width, canvas.height);
drawDrawing(ctx, drawing, fit);
drawLabel(ctx, drawing, fit, name, style.fontFamily);
```

`generate(seed, { density, frame })` is a pure function with no DOM access, so
it runs in Node, in a worker or on the main thread. It takes about 2 ms.
A drawing is two flat typed arrays (`points` and `offsets`) that can be
transferred between threads without copying. [DESIGN.md](DESIGN.md)
explains how it all works.

## TypeScript

Type definitions are included, generated from the source's JSDoc, so
sites need no `@types` package:

```ts
import { mount, type MountOptions, type Moth } from 'mothdraw';
```

## Browser support

Continuous mode needs module workers: Chrome and Edge 80+, Firefox 114+,
Safari 15+. Older browsers fall back to the main thread (see above).
`demo/check.html` checks a browser in about 20 seconds.

## Development

| command | what it does |
|---|---|
| `npm test` | unit tests (`node:test`) |
| `npm run bench` | generates 1,000 moths; prints timing, point counts, bundle sizes and heap |
| `npm run serve` | serves the demos at `http://127.0.0.1:8080/demo/`: `?seed=…` for one plate, `continuous.html`, `check.html`. `HOST=0.0.0.0` makes it reachable from a phone on your network |
| `npm run perf` | measures `generate` and continuous mode in headless Chrome, at normal speed and 6× CPU throttling |
| `node tools/check-first-moth.js` | launches a fresh Chrome 200 times; fails if any first moth takes over 1 s to start drawing |
| `node tools/perf-fallback.js` | continuous mode when the worker is missing, silent or blocked |
| `npm run sheet` | renders a contact sheet of seeds to `out/contact-sheet.png` |
| `npm run similar` | ranks plates by how alike they look (`-- --crop` ignores size) |
| `npm run build` | minified ES module bundles in `dist/` |
| `npm run types` | regenerates the type definitions in `types/` from the JSDoc (fetches TypeScript with `npx`; it is not a dependency) |

Node 22 or later. esbuild is the only dev dependency. The measurement
tools drive the Chrome installed on the machine (set `CHROME` to use
another binary).

## Credit

Inspired by [fishdraw](https://github.com/LingDong-/fishdraw) by Lingdong
Huang (MIT). mothdraw borrows its approach, including parametric anatomy,
hatching and hidden-line clipping, and is written from scratch.

## Licence

MIT © Abdellah Darni
