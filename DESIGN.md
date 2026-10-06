# mothdraw design

A seed goes in and a line drawing of a moth comes out. This note covers what
we take from [fishdraw](https://github.com/LingDong-/fishdraw) (MIT,
Lingdong Huang), the data format, and where the time is likely to go.

## 1. What fishdraw does, and what it costs

fishdraw builds a fish from about 50 random parameters (body length, fin
type, scale type and so on). Each body part becomes a set of polylines, which
are lists of `[x, y]` points. Lines that should be hidden behind a nearer part
are removed by clipping them against that part's outline polygon. At the end
it fits the drawing into a frame, simplifies the lines and prints SVG.

Measured on this machine (Apple M2, Node 24.13.1, 60 seeds):

| | median | p95 | max | median points |
|---|---|---|---|---|
| fishdraw `main()` | 287 ms | 963 ms | 1,380 ms | 3,591 |

A CPU profile shows where that time goes:

| function | share of time | what it does |
|---|---|---|
| `clip` and `seg_isect_poly` | 55% | tests every segment against every polygon edge, with no early rejection |
| `poly_union` | 32% | merges outlines to build occluders; O(n²) and builds string keys (`pair_key` alone is 24%) |
| garbage collector | 2% | caused by arrays of small `[x, y]` arrays |

The lesson: the art comes from the parametric anatomy, and the cost comes
from general-purpose polygon clipping and union. We keep the first and
replace the second.

## 2. Techniques we borrow

| fishdraw technique | how mothdraw uses it | why |
|---|---|---|
| Parameters drawn from triangular distributions (`rndtri`) and weighted picks (`choice`) | Body-plan parameters drawn the same way, then blended between plans | Values cluster around a sensible middle but sometimes reach the extremes, which is where variety comes from |
| Rays cast along a base curve with a length function (`fin_a`) | Wing outline as a radius profile around the wing base; veins as rays from the discal cell to the margin | The anatomy becomes a few smooth functions instead of hand-placed points |
| Hatching clipped to a shape, minus a shifted copy of the shape (`shade_shape`) | Shading along one edge of each wing and body segment | Gives a crescent of shadow with a single subtraction, so it reads as volume |
| Clipping by a point test instead of a polygon (`binclip`) | Pattern masks: keep a hatch or stipple stroke only where the pattern is dark | Patterns become plain functions of position |
| Splitting a line into inside and outside parts (`clip`) | Hidden-line removal: wing detail is cut where the body or forewing covers it | Lines only, no fills, so the drawing works on any background |
| Noise wobble on resampled lines | Slight unevenness in bands and margins | Keeps it looking hand-drawn, not CAD-drawn |
| Weighted syllable chains (`binomen`) | Pseudo-Latin genus and species names | Cheap, and believable when the syllables are moth-flavoured. We write our own moth syllable tables |
| Fitting the drawing to its bounding box (`reframe`) | Same | Every moth fills the frame regardless of wingspan |

What we deliberately do not take:

- **Polygon union and segment-vs-every-edge clipping** (87% of fishdraw's
  time). See section 3.
- **Global PRNG state** (`jsr`). Our PRNG is a value passed as an argument.
- **Arrays of `[x, y]` arrays.** We use flat typed arrays (section 5).
- **Poisson-disk sampling** for stipple. It wastes work on rejection. A
  jittered grid looks the same at this density and costs one pass.
- **Douglas-Peucker cleanup at the end.** We generate lines at the right
  resolution from the start instead.
- **The Hershey font.** The name is returned as text.

The code is written fresh. If any function is copied, its
`Copyright (c) 2021 Lingdong Huang` MIT notice goes beside it.

## 3. The key idea: shapes as inside tests

Instead of outline polygons, every shape that can hide lines (we call these
occluders) answers one question in constant time: *is this point inside me?*

- **Body parts** (head, thorax, abdomen) are symmetric about the body axis
  and defined by a width profile `w(y)`. A point is inside if `|x| < w(y)`.
- **Wings** are defined in polar form around the wing base: an outline radius
  `R(θ)` stored as a lookup table of about 256 angles. A point is inside if
  its distance from the base is less than `R(θ)` at its angle. The drawn
  outline uses the same table, so the outline and the inside test always
  agree.
- **Tails** on hindwings are a separate small shape. The hindwing test is
  `inWing(p) || inTail(p)`.

That makes the shape arithmetic free:

- union = `a || b`
- "hidden behind" = `keep(p) && !inFore(p) && !inBody(p)`
- crescent shading = `inShape(p) && !inShape(p - offset)`
- pattern mask = `... && isDark(u, v)`

There is no polygon union and no edge loop. Clipping a polyline means
walking its points, evaluating one combined test per point, and bisecting
(about 10 steps) where the answer changes, to place the cut on the boundary.
Lines are resampled so no segment is longer than a few units, which keeps
cuts accurate and stops a segment from skipping over a thin shape.

Trade-off: wing outlines must be star-shaped from the base, meaning every
point of the wing can be seen in a straight line from the base. Real moth
wings almost always are. Shapes that are not, such as long curved tails, are
added as their own inside test.

### Wing-local coordinates

The polar form gives each wing a natural coordinate system:

- `u` from 0 at the base to 1 at the margin
- `v` from 0 at the leading edge (costa) to 1 at the trailing edge (dorsum)

Mapping `(u, v)` to `(x, y)` is a table lookup, and so is the reverse (one
`atan2` plus a lookup). Wing detail is placed in `(u, v)`:

- **Veins**: a closed discal cell around `u ≈ 0.45`, with veins from its edge
  to evenly spaced points on the margin.
- **Bands**: wavy lines at a fixed `u` (for example antemedial at 0.3,
  postmedial at 0.65) running from costa to dorsum.
- **Discal spot**: at the end of the cell.
- **Eyespots**: concentric rings at a chosen `(u, v)`.
- **Scallops**: the margin radius dips between vein ends, as on real moths.
- **Fringe**: short strokes outward from the margin.

Because everything uses `u < 1`, detail stays inside the wing by
construction, and patterns can be written as plain functions of `(u, v)`.

### Depth order and mirroring

From front to back: antennae, head, thorax, abdomen, forewing, hindwing.
Each part's lines are clipped against the parts in front of it.

Only the right half is generated. The left wings never overlap the right
wings (the body sits between them), so all wing clipping happens once on the
right half and the result is mirrored. That halves the clipping work and
makes the symmetry exact. The body is generated as a half outline and
mirrored too. Its centre-line details (segment lines, hairs) are drawn
across both halves directly.

## 4. Seeds and randomness

- A string or number seed is hashed to 32 bits.
- The PRNG is a small, fast generator (sfc32) held in a closure and passed
  into every function that needs randomness. `Math.random` is never touched.
- Independent sub-streams are split from the seed for the body plan, the
  detail and the name. Changing how stipple is drawn later will not change a
  seed's body plan or name.
- Noise (for wobble and pattern edges) uses a permutation table filled from
  the seed into one reused buffer.

## 5. Data format

```js
/**
 * @typedef {object} Drawing
 * @property {Float32Array} points   x0, y0, x1, y1, ... in drawing units
 * @property {Uint32Array}  offsets  length = lineCount + 1; polyline i is
 *                                   vertices offsets[i] .. offsets[i+1] - 1
 * @property {number} width          frame width in drawing units
 * @property {number} height         frame height in drawing units
 */

/** generate(seed, options) -> { drawing: Drawing, name: string, seed } */
```

- Vertex `k` is `points[2k], points[2k + 1]`.
- Polylines are stored in **drawing order**: body outline, wing outlines,
  veins, bands and spots, shading, fringe. The pen animation simply plays
  them in sequence.
- The frame is a fixed 1000 × 750 units. Renderers scale it to their target
  size and keep the stroke width constant on screen.
- Float32 is precise to about 0.0001 units at this size, far below a pixel.
- `postMessage(result, [points.buffer, offsets.buffer])` moves both arrays
  from the worker without copying.

**Internally**, a builder writes points into growable scratch typed arrays
that are reused from one call to the next. Each layer (outline, veins,
shading and so on) has its own run of polylines, which the builder
concatenates in drawing order at the end. The only allocations per moth are
the two final, exactly sized output arrays and a handful of small objects.
The scratch buffers are module-private. `generate` has no side effects that
can be observed from outside and touches no DOM. Calls are synchronous, so
reuse is safe in a single thread or a worker.

## 6. Planned layout

```
src/
  rng.js            seed hashing, sfc32, uniform/triangular/pick helpers
  noise.js          seeded value noise
  geom.js           small vector and curve helpers, resampling
  builder.js        scratch buffers, layers, mirroring, packing to Drawing
  clip.js           predicate clipping with bisection, hatch and stipple fill
  body.js  wings.js  antennae.js  pattern.js
  plans.js          body plans and blending
  name.js           pseudo-Latin names
  generate.js       generate(seed, options)
  render-canvas.js  draws a Drawing (full, or progressively up to a length)
  render-svg.js     Drawing -> SVG string with one <path>
  mount.js  worker.js   continuous mode (stage 5)
  index.js          public exports
bench/bench.js       npm run bench
tools/contact-sheet.js  24 seeds -> PNG via headless Chrome
demo/index.html      one moth from ?seed=
```

## 7. Where the time should go

These are **estimates to be checked** at stages 1 to 3, not measurements:

| step | estimate | reason |
|---|---|---|
| Parameters, outlines, lookup tables | < 0.5 ms | a few hundred function evaluations |
| Veins, bands, spots, eyespots | ~0.5 ms | dozens of short curves |
| Hatching and stipple, including clipping | 2–5 ms | the largest cost: thousands of points, each with one combined inside test (`atan2`, lookup, noise for the pattern) |
| Mirroring and packing | ~0.2 ms | one linear copy |
| **Total** | **3–8 ms median** | against a 20 ms target |

Expected output: about 5,000 to 15,000 points per moth.

Likely hot spots, to profile in stage 6:

- Noise calls inside pattern tests. Use few octaves, or cache per cell.
- `atan2` in the wing test. It could be replaced by a cheaper monotonic
  angle approximation, since the result is only used to index a table.
- Calling the inside test through a function value. If it stops the engine
  from optimising, switch to a fixed occluder list with type codes.

**Bundle**: roughly 25–35 KB minified, so about 8–11 KB after Brotli. The
syllable tables add about 1.5 KB compressed. The 15 KB target looks
comfortable, and the bench will report the real number every stage.

## 8. How each target is measured

- **`generate` time and points**: `npm run bench` runs 50 warm-up seeds, then
  1,000 seeds. It prints the median, p95, max, median point and line counts,
  and the minified and Brotli bundle sizes (`node:zlib`, quality 11).
- **Memory**: the bench runs with `--expose-gc` and records `heapUsed` after
  a forced garbage collection every 100 generations. Flat means no upward
  trend from start to end.
- **Animation** (stage 5): headless Chrome driven over the DevTools protocol
  using Node's built-in `WebSocket`. A Long Tasks observer catches anything
  over 50 ms. A wrapped `requestAnimationFrame` counts frames during the hold
  and while the tab is hidden. Allocation sampling checks the draw loop.
  No extra dependency is needed.
- **Visual check** (stage 2 onwards): a contact sheet of 24 seeds rendered
  through the real SVG renderer and saved as PNG by headless Chrome.

## 9. Risks

- **Clipping uses point sampling.** A shape thinner than the resample step
  could be missed. The step will be well below the thinnest occluder, and
  this is checked on the contact sheet.
- **The star-shaped wing rule** may limit strongly hooked wing tips. The
  fallback is the same as for tails: an extra inside test joined with `||`.
- **Pen-animation order.** Drawing each polyline followed by its mirror image
  may look better than right half then left half. The format allows either,
  so this is decided in stage 5.
- **Node version.** This machine has Node 24.13.1. The package targets
  Node 22 (`"engines": { "node": ">=22" }`) and uses nothing newer.
