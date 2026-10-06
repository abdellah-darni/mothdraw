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
| Rays cast along a base curve with a length function (`fin_a`) | Wing outline built from a few smooth profile functions; veins as rays from the discal cell to the margin | The anatomy becomes a few smooth functions instead of hand-placed points |
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
occluders) answers one question cheaply: *is this point inside me?*

- **Body parts** (head, thorax, abdomen) are symmetric about the body axis
  and defined by a width table: one half-width `w` for each row `y`. A point
  is inside if `|x|` is less than the half-width interpolated between the two
  nearest rows. The drawn outline is the same table, and straight-line
  interpolation between rows is exactly the segment drawn between them.
- **Wings** are star polygons around the wing base. The outline is a list
  of vertices ordered by their angle as seen from the base. A point is inside
  if it is nearer to the base than the outline edge that a ray from the base
  at the point's angle would cross. An angle index finds that edge in
  constant time (section 3.2). The drawn outline uses the same vertices, so
  the outline and the inside test always agree.
- **Tails** on hindwings are a separate small shape. The hindwing test is
  `inWing(p) || inTail(p)`.

That makes the shape arithmetic free:

- union = `a || b`
- "hidden behind" = `keep(p) && !inFore(p) && !inBody(p)`
- crescent shading = `inShape(p) && !inShape(p - offset)`
- pattern mask = `... && isDark(u, v)`

There is no polygon union and no loop over every edge. To clip a polyline,
we walk its points, evaluate one combined test per point, and wherever the
answer changes, find the crossing (section 3.1). Lines are resampled so no
segment is longer than 2 units, which stops a segment from skipping over a
thin shape.

The combined test does not just return true or false. It returns `0` for
visible, or the id of the front-most occluder covering the point. That id is
what the crossing step needs.

Trade-off: wing outlines must be star-shaped from the base, meaning every
point of the wing can be seen in a straight line from the base. Real moth
wings almost always are. Shapes that are not, such as long curved tails, are
added as their own inside test.

### 3.1 Finding the exact crossing point

The concern is a line that stops short of the edge and leaves a gap. When
one segment endpoint `A` is visible and the other endpoint `B` is hidden:

1. **Bracket.** Halve the segment 12 times, keeping the half where the answer
   changes. That narrows the crossing to 1/4096 of a segment of at most
   2 units, so under 0.0005 units. The hidden end also tells us which
   occluder did the hiding.
2. **Snap to the edge.** Find the edge of that occluder next to the bracket:
   the outline segment in that wedge for a wing, or the segment between two
   rows for the body. Then intersect our segment with that edge exactly, as
   two straight lines. The visible part ends at that intersection point.
3. **Why no gap.** The inside test describes exactly the polygon that is
   drawn, not a smooth curve the polygon only approximates. So the
   intersection lies on the drawn outline, to within float32 rounding
   (about 0.0001 units, or a ten-thousandth of a pixel).

Round line caps also extend each line end by half a stroke width over the
outline, but nothing depends on that.

Pattern masks such as "dark where the noise is above 0.6" have no drawn
edge, so there is nothing to snap to. For those, step 1 alone sets the
cut, which is accurate to 0.0005 units.

Known limit: if a segment crosses a boundary and comes back within its own
2 units, both ends test the same and the dip is missed. That can only happen
at a sharp corner that sticks out less than 2 units across the segment. The
error is no larger than that sliver.

Check (stage 3): over 1,000 seeds, every cut endpoint must lie within
0.01 units of the outline that hid it. The bench reports the worst case.

### 3.2 How fine the wing outline is

Display scale: the frame is 1000 units wide. On a 1200 CSS px canvas at
2× pixel density, 1 unit is 2.4 device pixels. That is the largest scale we
plan for.

A large forewing reaches about 430 units from its base. Its outer margin
(the termen) is about 300 units long and carries 6 to 9 scallops, so each
scallop is 33 to 50 units wide.

**The first draft's uniform table is not enough.** That draft stored the
radius at 256 equal angles. The forewing covers a fan of about 100°
(1.75 rad), so each angle step is 0.0068 rad:

- At 430 units out, that puts samples 2.9 units apart, or 7 device pixels.
  A scallop gets only 11 to 17 samples, so its facets would show, and the
  sharp points between scallops would be rounded off by up to 1.5 units.
- Along the costa (leading edge) and dorsum (trailing edge) it is worse.
  Those edges run almost along the rays from the base, so equal angle steps
  leave vertices 10 to 20 units apart there.

**What we use instead:**

- **Sample the outline by distance along it, not by angle.** At most 1 unit
  apart along the termen, where the scallops and fringe are, and 3 units
  along the smooth costa and dorsum. That gives 400 to 600 vertices per wing.
  A 33-unit scallop gets at least 33 vertices. A scallop point is off by at
  most 0.5 units, about 1 device pixel at the largest scale. Because of
  section 3.1, the inside test matches the drawn outline exactly either way.
- **Look up by angle with an index.** Each vertex stores its angle from the
  base. Angles must strictly increase around the outline, which is the
  star-shaped rule, and wing building checks this. A table of 1024 equal
  angle buckets records the first vertex in each bucket, so a lookup checks
  1 to 3 vertices. That is still constant time, and resolution no longer
  depends on angle.
- **Memory**: 600 vertices × (x, y, angle) plus 1024 bucket entries is about
  11 KB per wing. It lives in scratch memory and is reused for every moth.

### Wing-local coordinates

The base-and-angle view gives each wing a natural coordinate system:

- `u` from 0 at the base to 1 at the margin
- `v` from 0 at the costa to 1 at the dorsum, taken from the angle

Going from `(x, y)` to `(u, v)` costs one `atan2`, the bucket lookup and one
division. Going from `(u, v)` to `(x, y)` is the reverse lookup. Wing detail
is placed in `(u, v)`:

- **Veins**: a closed discal cell around `u ≈ 0.45`, with veins from its edge
  to evenly spaced points on the margin.
- **Bands**: wavy lines at a fixed `u` (for example antemedial at 0.3,
  postmedial at 0.65) running from costa to dorsum.
- **Discal spot**: at the end of the cell.
- **Eyespots**: concentric rings at a chosen `(u, v)`.
- **Scallops**: the margin dips between vein ends, as on real moths.
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
- Noise (for wobble and pattern edges) uses a value table filled from the
  seed into one reused buffer.

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
- `points` and `offsets` always have exactly the needed length. They may be
  views into a larger buffer (see 5.1). Consumers use `.length`, never
  `.buffer.byteLength`.

### 5.1 Two kinds of memory: scratch and output

The question is how buffers can be reused between calls when the worker
gives its buffers away. Once a buffer is transferred, the worker can no
longer use it. The answer is that these are two separate kinds of memory.

**Scratch memory never leaves the generator.** This covers the growable
point and offset arrays the builder writes into, the wing outlines and their
angle indexes, and the noise table. It is module-private, grows when a large
moth needs more room, and is reused by every call. It is never posted
anywhere, so transfer cannot detach it.

**Output memory is handed off.** At the end of a call, `pack` copies the used
part of scratch into output arrays and returns those. Only output arrays are
transferred. The copy is one linear pass, roughly 80 KB for 10,000 points,
which takes about 20 µs.

There are two modes for where output memory comes from:

1. **Default (Node, tests, a single call):** fresh, exactly sized arrays,
   two allocations per moth. That is simple and enough for the bench and
   SVG export.
2. **Recycling (continuous mode, stage 5):** the page sends buffers back to
   the worker once it is finished with them, so no new output memory is
   allocated once the loop is running:
   - `generate(seed, { reuse })` accepts a previous `{ points, offsets }`.
     If the underlying buffers are still attached and large enough, `pack`
     writes into them and returns exact-length views over them. Otherwise it
     allocates new ones.
   - The worker posts the views with their buffers in the transfer list. A
     typed-array view keeps its offset and length through `postMessage`, so
     the page receives exact-length arrays.
   - When the page starts drawing moth N+1, it no longer needs moth N. It
     transfers moth N's two buffers back to the worker with the next
     request.
   - At most three sets exist at once: the one being drawn, the next one
     ready to draw, and one returning to the worker.

Ownership is enforced by the browser, not by convention. A transferred
buffer has `byteLength` 0 on the side that gave it away. `pack` checks this
before reusing a buffer, so it can never write into a moth that is still
being drawn.

## 6. Planned layout

```
src/
  rng.js            seed hashing, sfc32, uniform/triangular/pick helpers
  noise.js          seeded value noise
  geom.js           small vector and curve helpers
  builder.js        scratch buffers, layers, mirroring, packing to Drawing
  clip.js           occluder tests, clipping, hatch and stipple fill (stage 3)
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
| Parameters, outlines, angle indexes | < 0.5 ms | a few thousand function evaluations |
| Veins, bands, spots, eyespots | ~0.5 ms | dozens of short curves |
| Hatching and stipple, including clipping | 2–5 ms | the largest cost: thousands of points, each with one combined inside test (`atan2`, bucket lookup, noise for the pattern) |
| Mirroring and packing | ~0.2 ms | one linear copy |
| **Total** | **3–8 ms median** | against a 20 ms target |

Expected output: about 5,000 to 15,000 points per moth.

Likely hot spots, to profile in stage 6:

- Noise calls inside pattern tests. Use few octaves, or cache per cell.
- `atan2` in the wing test. It could be replaced by a cheaper monotonic
  angle approximation, since the result is only used to find a bucket.
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

- **Clipping uses point sampling** to detect crossings (section 3.1). A
  shape thinner than 2 units could be missed. No occluder is that thin, and
  the contact sheet will show it if one is.
- **The star-shaped wing rule** may limit strongly hooked wing tips. The
  fallback is the same as for tails: an extra inside test joined with `||`.
- **Pen-animation order.** Drawing each polyline followed by its mirror image
  may look better than right half then left half. The format allows either,
  so this is decided in stage 5.
- **Node version.** This machine has Node 24.13.1. The package targets
  Node 22 (`"engines": { "node": ">=22" }`) and uses nothing newer.
