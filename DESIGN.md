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
- **Wings** are any closed polygon, tested by the even-odd rule: a point
  is inside if a ray to its right crosses the outline an odd number of
  times. To avoid checking every edge, the wing's height is cut into 256
  horizontal bands, and each band lists the edges that cross it, so a test
  looks at only the 2 to 4 edges in the point's band (section 3.2). The
  drawn outline uses the same vertices, so the outline and the inside test
  always agree.

  *History.* The first draft used a star polygon around the wing base. In
  stage 2 it moved to the centroid, because seen from a corner the angle
  order was fragile. In stage 3 the star test was replaced by the band test
  for three reasons. Texture must be clipped to the *inside* of the hindwing
  too. A tailed hindwing is not star-shaped. And measured on the same
  outlines, the band test is a little faster (50.6 ns against 54.9 ns per
  test) and agreed on all 20 million sample points. One polygon type is
  also simpler to understand than two.

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

The combined test does not just return true or false. It returns `null`
for visible, or the shape that hides the point: either the shape the line
must stay inside (a wing, for its own texture), or the front-most occluder
covering it. That shape is what the crossing step needs.

### 3.1 Finding the exact crossing point

The concern is a line that stops short of the edge and leaves a gap. When
one segment endpoint `A` is visible and the other endpoint `B` is hidden:

1. **Bracket.** Halve the segment 12 times, keeping the half where the answer
   changes. That narrows the crossing to 1/4096 of a segment of at most
   2 units, so under 0.0005 units. The hidden end also tells us which
   occluder did the hiding.
2. **Snap to the edge.** Find the edge of that shape next to the bracket:
   an outline segment in the bracket's band for a wing, or the segment
   between two rows for the body. Then intersect our segment with that edge exactly, as
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

- **Sample the outline by distance along it, not by angle.** Wings are
  sampled every 0.7 model units. Measured over 1,000 seeds, one model unit
  is 1.05 to 1.35 frame units, so vertices are at most 0.95 frame units
  apart everywhere on the outline. A 33-unit scallop gets more than 33
  vertices, and a scallop point is off by at most half that spacing, about
  1 device pixel at the largest scale. Because of section 3.1, the inside
  test matches the drawn outline exactly either way.
- **Simplify what is drawn.** After scallops and wobble are applied, the
  outline is simplified (Douglas-Peucker) to within 0.06 model units:
  1,269 vertices become a median of 105 for a forewing and 129 for a
  hindwing. The inside test is built from the *simplified* polygon, so the
  outline and the test still describe the same polygon, and section 3.1
  still holds exactly. Fine scallops keep their vertices; long gentle
  curves need few.
- **Look up with a band index.** 256 bands over the wing's height; each
  lists the edges crossing it. A test checks 2 to 4 edges.
- **Memory**: two float64 vertex arrays, 257 band offsets and the band edge
  lists, a few KB per wing, kept in scratch memory and reused.
- **Measured accuracy** (stage 3): over 1,000 seeds and 85,112 cuts against
  both wings, including tailed hindwings, the worst cut endpoint lies
  0.0000169 model units from the drawn outline. That residue is float32
  rounding in the builder.

### Wing-local coordinates (settled in stage 3)

Each wing has its own coordinates for placing the pattern:

- `u` from 0 at the wing base to 1 at the termen
- `v` from 0 at the apex end of the termen to 1 at the tornus end

The termen, taken before scallops and wobble, is resampled at 49 evenly
spaced points into a table. The point `(u, v)` lies `u` of the way from the
base to the termen point at fraction `v`. The reverse costs one `atan2`, a
binary search in the table of those 49 points' angles from the base, and a
division. On a tailed hindwing the table skips the tail, bridging its root
with a straight line, so the tail lies at `u > 1`.

Placed in `(u, v)`:

- **Veins**: a closed discal cell around `u ≈ 0.4–0.5`, costal and anal
  veins, and radial veins from the cell to `v = j / scallops`, which is
  exactly where the scallop cusps fall.
- **Cross lines**: smooth, zigzag or toothed lines at a fixed `u`, run a
  little past `v = 0` and `v = 1` so the clip ends them on the outline.
- **Spots**: kidney and ring spots, discal dots, eyespots.
- **Tone**: each family's darkness function is written in `(u, v)`.

### Depth order and mirroring

From front to back: antennae, thorax, head, abdomen, forewing, hindwing.
The thorax is in front of the head because its collar overlaps the back of
the head. Each part's lines are clipped against the parts in front of it.

Only the right half is generated. The left wings never overlap the right
wings (the body sits between them), so all wing clipping happens once on the
right half and the result is mirrored. That halves the clipping work and
makes the symmetry exact. The body is generated as a half outline and
mirrored too. Its centre-line details (segment lines, hairs) are drawn
across both halves directly.

### 3.3 Anatomy and body plans (stage 2)

Proportions come from four real families. Each family is a table of
`[low, typical, high]` ranges in `src/plans.js`:

| family | examples | look |
|---|---|---|
| Sphingidae | *Sphinx ligustri*, *Manduca sexta* | long narrow pointed forewings, small hindwings, heavy spindle body, hooked antennae |
| Saturniidae | *Antheraea polyphemus*, *Actias luna* | broad rounded wings, large round hindwings (35% tailed), stout body, feathery antennae |
| Geometridae | *Biston betularia*, *Ourapteryx sambucaria* | broad thin wings, large exposed hindwings, slender body |
| Noctuidae | *Noctua pronuba*, *Catocala nupta* | elongated triangular forewings over rounded hindwings, robust body |

**Wings are built from landmarks**, not as radial shapes:

- The forewing has a base, an apex at `costaAngle` forward of the
  perpendicular to the body, and a tornus at the end of the inner margin.
- Each margin (costa, termen, dorsum) is a gently bowed cubic curve.
- Each corner is rounded by its own radius (`EdgeLoop` in
  `src/polyline.js`).

**Size on the plate.** Each family has a real wingspan range (hawk moths
55 to 120 mm, silk moths 80 to 150, owlet moths 30 to 75, inchworms 25 to
60). The specimen fills 70 percent of the box at 25 mm, rising to 100
percent at 125 mm and above, so small moths look small. Texture density
follows the smaller box, keeping ink density on the page constant.

**Abdomen length is tied to the hindwing.** The tip sits `abdomenReach` of
the way from the abdomen's start to the hindwing's anal angle:
- owlet moths and inchworms about level with it (0.9 to 1.1);
- silk moths a little short of it (0.8 to 1);
- hawk moths far past it (2.6 to 4).
The abdomen is therefore built after the wings.

**Forewing tip.** The costa bows most near the base, and the termen does
not bow outward just after the apex. So the tip ends in a clean point or
a smooth curve, never a knob.

**Antennae** are slim tapering outlines, widest at the base, with a gentle
outward curve, and no longer than about half the forewing.

**The specimen is set the way pinned moths are spread:**

- The forewing's inner margin runs close to perpendicular to the body.
- The hindwing's front corner is anchored to the forewing: a point `reach`
  of the way along the forewing's inner margin, moved `tuck` forward. So
  the visible hindwing always emerges from under the forewing near its
  tornus.
- The hindwing base sits level with the forewing base, so the forewing
  covers the hindwing's leading edge all the way to the body.

**Blending (stage 4, strengthened after it).** Each moth has a main family
and leans towards a second one:
- Every proportion is sampled from both families' ranges and blended.
- The blend is usually 10 to 30 percent and at most 55 (triangular
  0 / 0.18 / 0.55).
- The limit was tested by drawing every ordered pair of families at forced
  blends. At 0.55 every pair reads as a moth of its main family. At 0.8
  they still read as moths, but the main family's pattern sits on the
  other family's shape, so the family stops being recognisable.
- Things that cannot be blended (antenna type, whether there are tails,
  the pattern) come from the main family.
- Antenna types: thread, serrate (saw teeth on owlet and inchworm moths),
  hooked (hawk moths) and feathery.

### 3.4 Detail and texture (stage 3)

The target is fishdraw's plate `samples/000016.svg`, where most of the ink
is texture. `src/pattern.js` builds it from four tools:

- **Tone and rows of scales.** Each family has a tone function, giving
  darkness from 0 to 1 at a wing-local point. Candidate strokes are laid
  in rows like scales:
  - each row runs parallel to the termen (constant `u`), and rows are one
    cell apart;
  - positions along a row are one cell apart, offset by half a step on
    alternate rows;
  - each stroke points away from the base;
  - in the outer wing a narrow gap follows each radial vein, so the scales
    sit between the veins.
  Each candidate is kept with probability equal to the tone, and darker
  places get longer strokes. A stroke is 2 points, or 3 when it is long
  enough to bend. Beyond the ends of the termen, along the costa and inner
  margin, `u` no longer measures distance to the margin, so margin shading
  is faded out there.
- **Cross lines**: smooth, zigzag or toothed, at a fixed `u`.
- **Veins**: a cell with radial veins to the scallop cusps. Veins start a
  little way from the base, bow slightly, and have small breaks.
- **Spots**: kidney and ring spots, discal dots, and eyespots made of
  concentric rings around a clear window.

**The hand-drawn feel comes from variation between strokes, not within
them.** Every stroke differs in position (the jittered grid), angle (±0.07
to ±0.22 rad), and length (×0.6 to ×1.4). About one in ten is broken by a
small gap. Per-point wobble is kept for the long lines: outlines (0.35 units
of amplitude, bumps 38 units apart), cross lines, veins and the frame. The
wobble is applied *before* the inside tests are built, so section 3.1 still
holds exactly.

**How the families are told apart.** Since stage 4, every pattern is
controlled by continuous numbers. Each family has a table of
`[low, typical, high]` ranges at the top of `src/pattern.js`, sampled once
per moth from its own seed stream. So two moths of a family differ by
degrees rather than falling into a few fixed variants.

| family | texture | marks, and what varies continuously |
|---|---|---|
| Noctuidae | dense radial dashes; cross-hatched where darkest | double cross lines whose shape blends from smooth wave to zigzag to teeth; kidney and ring spots of varying size (the ring can vanish); a club-shaped claviform, a silver gamma mark (*Autographa*) or black dagger dashes (*Acronicta*) when their parameters pass a threshold; hindwing shading that darkens towards the margin and fades inward, from pale to dusky, sometimes with a second band edged by fine lines (*Catocala*) |
| Geometridae | fine speckle in random directions | crisp thin lines carried across both wings; speckle density, dark median band strength, doubled outer line, subterminal line, discal dot size and margin dots all vary, spanning peppered, banded and clean looks; overall melanic darkening, dark shading beyond the outer line, and a dark basal patch |
| Sphingidae | long streaks along the wing | 0 to 3 dark streaks; a signed oblique band (pale on dark, dark on pale, or none) of varying slope and width; 0 to 3 hindwing bands, hindwing ground and base darkness; an occasional hindwing eyespot (the eyed hawk-moth); strongly banded abdomen |
| Saturniidae | hatching at an angle that varies per moth, crossed where dark | eyespots vary in number (0 or 1 per forewing, 1 or 2 per hindwing), position, size, shape, ring count (2 to 4) and window (clear, or a solid dark pupil); costal stripe, pale band and dark margin strengths |

Abdomen banding is continuous for all families (strong on hawk moths).

**The same ink density on the page for every moth.** Texture cells are set
in page units: before the pattern is drawn, the specimen's final scale is
estimated from the built wings and body. Without that, wide moths (scaled
down more) came out denser than narrow ones. `generate(seed, { density })`
then scales the number of texture strokes, with 1 as the default.

**Point budget.** At the default density, the darkest moths (about 1.5 in
100) would go over 14,500 points. They are redrawn once with the texture
loosened just enough to fit. Every element is kept; only those moths get
slightly sparser texture. Only the texture scales with density, so the
correction assumes about 35 percent of the points are fixed.

**Body.** Hair on the thorax and head; a collar and tegulae (the shoulder
covers over the wing bases); eyes; abdominal segments bowed backward; hair
shading towards the sides, banded on hawk moths; tufts along the edges.

**The plate.** A ruled frame (lines in the drawing, with slight wobble but
clean corners), the specimen fitted to a box above, and the name below.
The name is *text*, not lines. `Drawing.label` gives its position and size,
and each renderer draws it in italics in the page's font: SVG `<text>`
without a font-family, and canvas `fillText` with the page's computed
font.

**Line weight (stage 4).** Both renderers take a `lineWidth` in drawing
units, defaulting to `LINE_WIDTH`: 1.5 px on a 900 px plate. The line scales
with the plate, as an engraving's would.

### 3.6 Names (stage 4)

`src/name.js` builds a pseudo-Latin *Genus species* from syllables:
- The building blocks are onsets, vowels and joining consonants, and an
  ending chosen by family. The endings follow real habits: inchworm
  species often end in *-aria* or *-ata*, hawk moth genera in *-es* or
  *-on*, silk moth genera in *-a* or *-ias*.
- Words that do not read as Latin are rejected and redrawn: a letter three
  times running, a stutter (*tete*), three vowels or four consonants in a
  row, more than one diphthong, or a leading *y*.
- The name has its own seed stream, so the same seed always gives the same
  name, and changes to drawing code never change it.
- The data costs a few hundred bytes. 5,000 seeds gave 5,000 distinct
  names.

### 3.5 Continuous mode (stage 5)

`mount(element, options)` returns `{ next, destroy }` (`src/mount.js`).

**Worker or main thread: decided by measurement.** `generate` was timed
in headless Chrome (`node tools/perf-generate.js`, fresh browser per run,
10 calls each):

| CPU | where | first call | later calls | longest main-thread task |
|---|---|---|---|---|
| 1x | main thread, in idle callbacks | 15.6 ms | 4.1 ms | 16.2 ms |
| 1x | worker | 10.7 ms | 3.3 ms | 1.9 ms |
| 6x | main thread, in idle callbacks | 66.5 ms | 16.3 ms | **69.1 ms** (over 50) |
| 6x | worker | 12.7 ms* | 2.8 ms* | 12.2 ms |

\* Chrome's CPU throttling slows only the page's main thread, not workers.

At 6x the main-thread first call is a 69 ms task, so the worker stays.

**Payload.** `"sideEffects": false` lets bundlers drop the generator from
the page's code, so the page loads only the drawing code (2.1 KB Brotli)
and the worker carries the generator (14.3 KB). The worker is created with
`new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`,
the form Vite and esbuild both understand. The prebuilt `dist/` puts
`worker.js` beside `mothdraw.js`. Vite's dev-time dependency pre-bundling
breaks that URL, so dev setups exclude the package from `optimizeDeps`
(README); production builds need nothing. Both were verified with a real
Vite 6 project.

**Choosing the next moth.** The worker picks seeds (random, or a fixed
sequence `seed, seed-1, seed-2...`) and rejects any whose main family
matches the moth on screen. `peekFamily` samples only the body plan, so a
rejected seed costs microseconds. The next moth is generated while the
current one is drawn, and the previous moth's arrays are transferred back
for reuse (§5.1).

**The pen.** The worker also sends the total ink length. Each frame
advances the pen to `total × elapsed / drawTime` and strokes only the new
stretch, so drawing takes the same time whatever the point count:
- The canvas keeps what is already drawn.
- Polylines play in drawing order, each mirrored line followed by its
  mirror image.
- Pen state lives in plain integers and a `Float64Array`. A fractional
  number written to a closure variable can make V8 box it every frame; a
  typed-array write never does.
- `requestAnimationFrame` always gets the same function.

**The name** is a DOM caption placed at the drawing's label position. It
fades in with a CSS transition, so the fade costs no animation frames, and
it inherits the page's font and colour. The canvas gets
`role="img"` and an `aria-label` with the name.

**Hold, pause, theme, resize, reduced motion:**
- The hold is a timer, so it requests no animation frames.
- `visibilitychange` cancels the frame or timer and records the time.
  Returning shifts the start time forward and carries on, so nothing is
  requested while hidden.
- A theme change (system setting, or a class, style or `data-theme`
  attribute on `<html>` or `<body>`) and any resize redraw the current moth
  up to the pen's position, without regenerating it.
- The canvas uses device pixels, capped at 2x.
- Under `prefers-reduced-motion` the moth is drawn whole with no
  animation and no cycling, and a click still gives the next one.
- `destroy()` cancels everything, terminates the worker, removes every
  listener and observer, and sets the canvas to 0 × 0 before removing it.

**Measured** (`node tools/perf-mount.js`, headless Chrome):

| check | result |
|---|---|
| longest main-thread task over a full cycle (7 s draw, 0.8 s fade, 6 s hold, next) | 4.1 ms at 1x, 24.8 ms at 6x; no task over 50 ms |
| animation frames requested while holding | 0 (at 1x and 6x) |
| animation frames requested while the tab is hidden | 0 (tab really hidden by switching tabs); resumes where it stopped |
| allocations inside the draw loop (sampling heap profiler, 16-byte interval, 4 s each) | first moth 532 bytes, second moth 0 to 28 bytes |
| heap over 1,000 moths | page 719 → 748 KB; worker 1,005 → 1,180 KB, flat from 700 to 1,000 |
| main family repeated | 0 times in 1,000 moths |
| reduced motion | 1 moth, 0 frames, name shown, click gives the next |
| destroy | 0 frames afterwards; canvas removed; worker terminated |

The draw loop itself allocates no objects or arrays. The first moth's 532
bytes are V8 boxing intermediate numbers before `frame()` is optimised;
from the second moth on, the sampler finds at most one or two 16-byte
samples per 240 frames.

**Fallback (stage 6).** If the worker cannot be created (a Content
Security Policy, or no module workers), fires `error` or `messageerror`,
or does not answer within 1.5 s (4 s after the first moth), mount
switches to the main thread for good:
- It loads `make.js`, the same seed-picking and generating code the
  worker uses, with a dynamic `import()`. Bundlers emit it as a separate
  chunk, downloaded only then.
- It makes each moth in an idle callback, or a 1 ms timeout in Safari,
  which has no `requestIdleCallback`.
- Measured (`node tools/perf-fallback.js`): moths appear and cycle for a
  missing worker script, a silent worker, CSP-blocked workers and no
  `Worker` at all. The cost is the cold first generation on the main
  thread: up to 111 ms at 6× CPU throttling (26–31 ms at 1×). That is
  acceptable for a rare fallback, and it is why the worker remains the
  default.

**The 6-second first moth (investigated in stage 6).** Some launches
during stage 5 took about 6 s to show the first moth.
- **Not the hold timer.** Runs with `hold=1` showed the same delay, and 60
  launches each with `hold=2` and `hold=10` showed none.
- **Not the harness either.** No measuring wrapper, DevTools tracing,
  CPU throttling, browser leftovers or reused debugging port reproduced
  it.
- **When it happened.** All 7 slow launches fell between 21:45 and 22:06
  on 6 October, after Chrome had updated itself at 19:51. None occurred in
  the roughly 480 launches since, with code and scripts unchanged across
  the boundary, and no code path in mount waits that long.
- **Conclusion.** It points to the machine or browser state that evening,
  not to mothdraw. The root cause is not proven, because it can no longer
  be reproduced.
- **Guards.**
  - `node tools/check-first-moth.js` launches a fresh Chrome 200 times
    and fails if any first moth takes over 1 s to start drawing. Last
    run: median 82 ms, p95 102 ms, max 215 ms, none over 1 s.
  - The watchdog above guarantees a moth even if the worker stalls.

**Browsers.** Everything is measured in Chrome.
- **Firefox** is not installed here.
- **Safari 27** is installed, but its WebDriver needs "Allow remote
  automation", a setting only the owner can turn on.
- **Static checks:** the bundles build for `es2020, chrome100,
  firefox114, safari15`. Every API used exists in Firefox 114 and Safari
  15 (module workers set that floor), except `requestIdleCallback`, which
  is optional. The worker uses the array form of the transfer list.
- **`demo/check.html`** reports the key behaviours as pass or fail in any
  browser, for checking by hand.

**Without the frame.** `generate(seed, { frame: false })` and
`mount(el, { frame: false })` leave out the frame lines, for a moth placed
directly on a page's background:
- The specimen is fitted to a box covering almost the whole plate (24
  units of margin, 70 units kept free at the bottom).
- Size by real wingspan narrows to 85–100% of that box, from 70–100% with
  the frame, so no moth looks lost.
- After packing, the name's baseline is set 16 units plus most of a line
  below the specimen's lowest point. Specimen and name then move together
  so the pair is centred vertically. The renderers and mount's caption
  read the position from `drawing.label`, so they needed no change.
- The same seed gives the same moth and name either way. The frameless
  version is drawn larger, so at the same ink density on the page it has
  more points (median 13,222).

**Types.** `types/*.d.ts` are generated from the JSDoc by `npm run types`
(TypeScript via `npx`, not a dependency) and ship with the package.
`exports` points each entry at its types. They were checked from a
consumer project under `strict`, with the definitions themselves
type-checked: correct usage compiles, and wrong option names and types
are reported.

**Packaging.**
- `exports` point at `src/` (`.` and `./mount`) with their types, and
  `files` is `src`, `types`, README and LICENSE. `dist/` is not committed, so an install from GitHub
  ships the source, and the site's bundler compiles it.
- Tested by installing from a git snapshot (`git+file:`, the same path as
  `github:`) into a fresh Astro 7.3.6 project (Vite 8.3.3):
  - `astro dev` runs with the worker and needs no configuration. Vite 8
    resolves worker URLs inside pre-bundled dependencies; Vite 6 does not
    and falls back to the main thread in dev.
  - `astro build` emits the worker as its own file: a 3.2 KB page script,
    a 14.3 KB worker, and a 14.3 KB fallback chunk loaded only on failure
    (all after Brotli). `astro preview` shows the first moth in
    62–89 ms.

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
 * @property {{x: number, y: number, size: number}} label  where the name goes
 */

/** generate(seed, { density, reuse }) -> { drawing, name, family, seed } */
```

- Vertex `k` is `points[2k], points[2k + 1]`.
- Polylines are stored in **drawing order**: frame, body, wing outlines,
  veins, patterns, texture, fringe, antennae. The pen animation simply
  plays them in sequence.
- The frame's lines are already in frame units. The builder copies them
  as they are, and leaves them out of the fit and the mirroring.
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
  polyline.js       growable point lists; outlines from bowed edges and rounded corners
  shapes.js         inside tests: BandShape (wings), ProfileShape (body parts)
  clip.js           hidden-line removal and clipping to a shape's inside
  body.js  wings.js  antennae.js
  pattern.js        tone functions, stroke fields, cross lines, veins, spots
  moth.js           assembles one moth: builds parts, draws them in depth order
  plans.js          body plans and blending
  name.js           pseudo-Latin names from syllables
  generate.js       generate(seed, options)
  render-canvas.js  draws a Drawing (full, or progressively up to a length)
  render-svg.js     Drawing -> SVG string with one <path>
  mount.js          continuous mode: drawing, timing, pause, theme, destroy
  worker.js         continuous mode: picks seeds and generates off the main thread
  index.js          public exports
bench/bench.js       npm run bench
tools/contact-sheet.js  seeds -> PNG via headless Chrome (--count, --cols, --cell)
tools/similar.js     ranks pairs of plates by how alike they look
tools/cdp.js         minimal Chrome DevTools Protocol client (no dependencies)
tools/perf-generate.js, tools/perf-mount.js  npm run perf
demo/continuous.html continuous mode
demo/index.html      one moth from ?seed=
```

## 7. Where the time should go

**Measured at stage 4** (1,000 moths, M2): median **2.2 ms**, p95
**3.6 ms**, max 5.7 ms; about 11,100 points (max 14,910 after the point
budget); bundle 13.4 KB after Brotli.

**Measured at stage 3**: median **2.0 ms**, p95
**3.3 ms**, about 11,100 points. That is under the 3 to 8 ms first
estimated, and far under the 20 ms target. One run in one bench took
22 ms; reruns peaked at 4.1 and 4.6 ms, which points to a
garbage-collection pause, not the generator. Stage 6 will profile where
the 2 ms goes.

The original estimates, kept for comparison:

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
- **Animation** (stage 5, `npm run perf`): headless Chrome driven over the
  DevTools protocol using Node's built-in `WebSocket`:
  - main-thread tasks from a trace;
  - animation frames counted by a wrapped `requestAnimationFrame`, switched
    off for the allocation test so the wrapper does not allocate inside
    the loop;
  - allocations from V8's sampling heap profiler, credited to `frame` and
    `advance`;
  - heap from `Runtime.getHeapUsage` on the page and the worker (attached
    as a session) after forced collection;
  - hiding by switching to another tab.
  No extra dependency is needed.
- **Visual check** (stage 2 onwards): a contact sheet of 24 seeds rendered
  through the real SVG renderer and saved as PNG by headless Chrome.
- **Variety** (stage 4 onwards): `npm run similar` works through the first
  100 seeds:
  - It lays each plate's ink onto a 64 × 48 grid (line length per cell,
    the frame excluded) and blurs it slightly.
  - It ranks all 4,950 pairs by correlation and renders the closest pairs
    side by side.
  - This measures silhouette and where the dark areas fall, not individual
    strokes. Because every plate is centred, symmetric and framed alike,
    even random pairs correlate around 0.74. The useful numbers are the
    tail (p99, max) and which families sit there.
  - `--crop` measures each specimen inside its own bounding box, so size
    on the plate drops out and only shape and pattern count. At plate
    level, two small specimens share wide empty margins, which counts as
    likeness.

## 9. Risks

- **Clipping uses point sampling** to detect crossings (section 3.1). A
  shape thinner than 2 units could be missed. No occluder is that thin, and
  the contact sheet will show it if one is.
- **Pen-animation order.** Drawing each polyline followed by its mirror image
  may look better than right half then left half. The format allows either,
  so this is decided in stage 5.
- **Node version.** This machine has Node 24.13.1. The package targets
  Node 22 (`"engines": { "node": ">=22" }`) and uses nothing newer.
