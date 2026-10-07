// @ts-check
// Continuous mode: mount(element) draws moth after moth into the element,
// each one stroke by stroke like a pen, then holds it and starts the next.
//
// Moths are generated in a Web Worker (worker.js): a first call takes about
// 17 ms at full speed and about 70 ms on a slow CPU, too long for the main
// thread. The main thread only draws. If the worker cannot be created,
// fails, or does not answer in time, moths are made on the main thread in
// idle time instead, so the plate is never left empty.
//
// Timeline of one moth:
//   draw  (requestAnimationFrame, fixed duration whatever the point count)
//   fade  the name fades in (a CSS transition: no animation frames)
//   hold  (a timer: no animation frames)
//   next  (the next moth was generated while this one was drawing)
//
// The per-frame loop allocates nothing: all pen state lives in plain
// numbers, and each frame strokes only the stretch of line drawn since the
// last one.

import { LINE_WIDTH, vlen } from './geom.js';
import { drawDrawing, fitDrawing } from './render-canvas.js';

/** @typedef {import('./builder.js').Drawing} Drawing */
/** @typedef {import('./make.js').MothReply} MothReply */
/** @typedef {import('./make.js').MothRequest} MothRequest */

/**
 * @typedef {object} MountOptions
 * @property {number} [drawSeconds]  time to draw one moth (default 7)
 * @property {number} [holdSeconds]  time a finished moth stays (default 6)
 * @property {number} [fadeSeconds]  name fade-in, part of the hold (default 0.8)
 * @property {string} [seed]         fixed sequence: seed, seed-1, seed-2... (default: random)
 * @property {number} [density]      texture density (default 1)
 * @property {number} [lineWidth]    in drawing units (default LINE_WIDTH)
 * @property {(moth: { name: string, seed: string, family: string }) => void} [onMoth]
 *   called when each moth starts
 * @property {string | URL} [workerUrl]  where the worker script is, if a
 *   bundler cannot resolve it (default: worker.js next to this module)
 */

/**
 * @typedef {object} Mounted
 * @property {() => void} next     skip to a new moth
 * @property {() => void} destroy  stop everything and remove the canvas
 */

/** Device pixels per CSS pixel, capped: sharp on high-density screens, cheap on 3x phones. */
const MAX_DPR = 2;
/**
 * How long to wait for the worker before making the moth on the main
 * thread instead. Generation takes a few milliseconds; the first request
 * also covers loading the worker script.
 */
const FIRST_REPLY_MS = 1500;
const REPLY_MS = 4000;

// Phases.
const WAITING = 0; // no moth to show yet
const DRAWING = 1;
const HOLDING = 2;

/**
 * @param {HTMLElement} element  the plate is sized to fill it
 * @param {MountOptions} [options]
 * @returns {Mounted}
 */
export function mount(element, options = {}) {
  const drawMs = (options.drawSeconds ?? 7) * 1000;
  const holdMs = (options.holdSeconds ?? 6) * 1000;
  const fadeMs = (options.fadeSeconds ?? 0.8) * 1000;
  const density = options.density ?? 1;
  const lineWidth = options.lineWidth ?? LINE_WIDTH;
  const base = options.seed ?? null;
  const onMoth = options.onMoth;

  const doc = element.ownerDocument;
  const win = /** @type {Window} */ (doc.defaultView);

  // --- DOM ----------------------------------------------------------------
  const restorePosition = win.getComputedStyle(element).position === 'static' ? element.style.position : null;
  if (restorePosition !== null) element.style.position = 'relative';
  const canvas = doc.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:pointer';
  canvas.setAttribute('role', 'img');
  // The name is real text, in the page's font and colour, faded in by CSS.
  const caption = doc.createElement('div');
  caption.setAttribute('aria-hidden', 'true');
  caption.style.cssText =
    'position:absolute;left:0;top:0;transform:translate(-50%,-80%);white-space:nowrap;' +
    `font-style:italic;line-height:1;pointer-events:none;opacity:0;transition:opacity ${fadeMs}ms ease-out`;
  element.append(canvas, caption);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const fit = { scale: 1, x: 0, y: 0, lineWidth: 1 };
  let dpr = 1;
  let color = '';

  // --- State --------------------------------------------------------------
  /** @type {MothReply | null} */
  let current = null;
  /** @type {MothReply | null} */
  let pending = null;
  let requested = false;
  let nextIndex = 0;
  /** Arrays of a moth that is no longer shown, offered back to the worker. */
  /** @type {Drawing | null} */
  let spare = null;
  let phase = WAITING;
  let destroyed = false;
  let reduced = false;

  // Pen: the polyline and segment start vertex (integers), and in `pen`
  // the fractional state: distance along the segment, total ink drawn, the
  // pen's point (drawing units) and when drawing started (shifted forward
  // by pauses). Fractions live in a typed array because writing one to a
  // closure variable can make V8 allocate a boxed number every frame; a
  // typed-array write never allocates.
  let line = 0;
  let vtx = 0;
  const pen = new Float64Array(5);
  const SEG = 0;
  const DRAWN = 1;
  const X = 2;
  const Y = 3;
  const START = 4;
  let pausedAt = -1; // when the tab was hidden mid-phase, or -1
  let holdEnd = 0;
  let holdTimer = 0;
  let raf = 0;

  // --- Worker, and the main-thread fallback -------------------------------
  /** @type {Worker | null} */
  let worker = null;
  let fallback = false;
  let watchdog = 0;
  let asked = 0; // requests sent so far
  /** @type {MothRequest | null} */
  let inFlight = null;

  try {
    worker = options.workerUrl
      ? new Worker(options.workerUrl, { type: 'module' })
      : new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    /** @param {MessageEvent<MothReply>} e */
    worker.onmessage = (e) => receive(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      useFallback();
    };
    worker.onmessageerror = useFallback;
  } catch {
    // Workers blocked (for example by a Content Security Policy) or not
    // supported as modules.
    fallback = true;
  }

  /** @param {MothReply} reply */
  function receive(reply) {
    if (destroyed) return;
    if (watchdog) win.clearTimeout(watchdog);
    watchdog = 0;
    inFlight = null;
    requested = false;
    nextIndex = reply.index;
    pending = reply;
    if (phase === WAITING) show();
  }

  /** Stops using the worker; any unanswered request is redone here. */
  function useFallback() {
    if (fallback || destroyed) return;
    fallback = true;
    if (watchdog) win.clearTimeout(watchdog);
    watchdog = 0;
    worker?.terminate();
    worker = null;
    if (inFlight) makeHere(inFlight);
  }

  // Safari has no requestIdleCallback; a zero timeout still yields to
  // drawing and input first.
  /** @param {() => void} cb */
  const idle = (cb) => (win.requestIdleCallback ? win.requestIdleCallback(cb, { timeout: 500 }) : win.setTimeout(cb, 1));

  /**
   * Makes a moth on the main thread, in idle time. The generator is loaded
   * only now, so pages that never need it never download it.
   * @param {MothRequest} req
   */
  function makeHere(req) {
    import('./make.js').then(({ makeMoth }) => {
      idle(() => {
        if (!destroyed) receive(makeMoth(req));
      });
    });
  }

  /** Asks for the next moth, avoiding the current one's family. */
  function request() {
    if (requested || destroyed) return;
    requested = true;
    /** @type {MothRequest} */
    const req = { base, index: nextIndex, avoid: current ? current.family : null, density };
    /** @type {Transferable[]} */
    const transfer = [];
    if (spare && spare.points.buffer.byteLength > 0) {
      req.points = spare.points;
      req.offsets = spare.offsets;
      transfer.push(spare.points.buffer, spare.offsets.buffer);
    }
    spare = null;
    if (fallback || !worker) {
      makeHere(req);
      return;
    }
    // Keep the request (without its transferred arrays) in case the worker
    // never answers and it has to be made here instead.
    inFlight = { base: req.base, index: req.index, avoid: req.avoid, density: req.density };
    watchdog = win.setTimeout(useFallback, asked === 0 ? FIRST_REPLY_MS : REPLY_MS);
    asked++;
    worker.postMessage(req, transfer);
  }

  // --- Drawing ------------------------------------------------------------

  /** Sizes the canvas to the element in device pixels and fits the plate. */
  function resize() {
    dpr = Math.min(MAX_DPR, win.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(element.clientWidth * dpr));
    const h = Math.max(1, Math.round(element.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (current) {
      fitDrawing(current.drawing, w, h, lineWidth, fit);
      placeCaption(current.drawing);
    }
  }

  /** @param {Drawing} d */
  function placeCaption(d) {
    const s = fit.scale / dpr;
    caption.style.left = `${(fit.x / dpr + d.label.x * s).toFixed(1)}px`;
    caption.style.top = `${(fit.y / dpr + d.label.y * s).toFixed(1)}px`;
    caption.style.fontSize = `${(d.label.size * s).toFixed(1)}px`;
  }

  function setStyle() {
    ctx.strokeStyle = color;
    ctx.lineWidth = fit.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  /** Clears and redraws the current moth up to the pen, in the current colour. */
  function redraw() {
    if (!current) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStyle();
    const d = current.drawing;
    const lines = d.offsets.length - 1;
    if (phase !== DRAWING || line >= lines) {
      drawDrawing(ctx, d, fit);
      return;
    }
    drawDrawing(ctx, d, fit, 0, line);
    // The current line, up to the pen.
    const p = d.points;
    const a = d.offsets[line];
    ctx.beginPath();
    ctx.moveTo(p[2 * a] * fit.scale + fit.x, p[2 * a + 1] * fit.scale + fit.y);
    for (let v = a + 1; v <= vtx; v++) ctx.lineTo(p[2 * v] * fit.scale + fit.x, p[2 * v + 1] * fit.scale + fit.y);
    ctx.lineTo(pen[X] * fit.scale + fit.x, pen[Y] * fit.scale + fit.y);
    ctx.stroke();
  }

  /**
   * Moves the pen forward until `target` ink has been drawn, stroking only
   * the new stretch. Allocates nothing.
   * @param {number} target
   */
  function advance(target) {
    const d = /** @type {MothReply} */ (current).drawing;
    const p = d.points;
    const offs = d.offsets;
    const lines = offs.length - 1;
    const s = fit.scale;
    const ox = fit.x;
    const oy = fit.y;
    ctx.beginPath();
    ctx.moveTo(pen[X] * s + ox, pen[Y] * s + oy);
    while (pen[DRAWN] < target && line < lines) {
      const x0 = p[2 * vtx];
      const y0 = p[2 * vtx + 1];
      const x1 = p[2 * vtx + 2];
      const y1 = p[2 * vtx + 3];
      const len = vlen(x1 - x0, y1 - y0);
      const remain = len - pen[SEG];
      if (pen[DRAWN] + remain <= target) {
        // Finish this segment.
        pen[DRAWN] += remain;
        pen[SEG] = 0;
        pen[X] = x1;
        pen[Y] = y1;
        ctx.lineTo(x1 * s + ox, y1 * s + oy);
        vtx++;
        if (vtx >= offs[line + 1] - 1) {
          // On to the next polyline: lift the pen.
          line++;
          if (line < lines) {
            vtx = offs[line];
            pen[X] = p[2 * vtx];
            pen[Y] = p[2 * vtx + 1];
            ctx.moveTo(pen[X] * s + ox, pen[Y] * s + oy);
          }
        }
      } else {
        // Stop partway along it.
        pen[SEG] += target - pen[DRAWN];
        pen[DRAWN] = target;
        const f = pen[SEG] / len;
        pen[X] = x0 + (x1 - x0) * f;
        pen[Y] = y0 + (y1 - y0) * f;
        ctx.lineTo(pen[X] * s + ox, pen[Y] * s + oy);
      }
    }
    ctx.stroke();
  }

  /** @param {number} now */
  function frame(now) {
    raf = 0;
    if (destroyed || phase !== DRAWING || !current) return;
    const t = (now - pen[START]) / drawMs;
    const target = t >= 1 ? current.total : current.total * t;
    advance(target);
    if (pen[DRAWN] >= current.total || line >= current.drawing.offsets.length - 1) finishDrawing();
    else raf = win.requestAnimationFrame(frame);
  }

  /** Starts showing `pending`. */
  function show() {
    if (!pending) return;
    cancelTimers();
    if (current) spare = current.drawing;
    current = pending;
    pending = null;
    line = 0;
    vtx = current.drawing.offsets[0];
    pen[SEG] = 0;
    pen[DRAWN] = 0;
    pen[X] = current.drawing.points[2 * vtx];
    pen[Y] = current.drawing.points[2 * vtx + 1];
    color = win.getComputedStyle(element).color;
    resize();
    canvas.setAttribute('aria-label', `Drawing of a moth: ${current.name}`);
    // Hide the old name at once (no transition), then let the new one fade.
    caption.style.transition = 'none';
    caption.style.opacity = '0';
    caption.textContent = current.name;
    void caption.offsetWidth;
    caption.style.transition = `opacity ${fadeMs}ms ease-out`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStyle();
    onMoth?.({ name: current.name, seed: current.seed, family: current.family });
    // Generate the next one while this one is pen[DRAWN].
    request();
    if (reduced) {
      phase = HOLDING;
      redraw();
      caption.style.transition = 'none';
      caption.style.opacity = '1';
      return;
    }
    phase = DRAWING;
    pen[START] = win.performance.now();
    if (doc.hidden) pausedAt = pen[START];
    else raf = win.requestAnimationFrame(frame);
  }

  function finishDrawing() {
    phase = HOLDING;
    caption.style.opacity = '1';
    if (reduced) return;
    holdEnd = win.performance.now() + fadeMs + holdMs;
    holdTimer = win.setTimeout(endHold, fadeMs + holdMs);
  }

  function endHold() {
    holdTimer = 0;
    if (pending) show();
    else {
      phase = WAITING;
      request();
    }
  }

  function cancelTimers() {
    if (raf) win.cancelAnimationFrame(raf);
    if (holdTimer) win.clearTimeout(holdTimer);
    raf = 0;
    holdTimer = 0;
    pausedAt = -1;
  }

  // --- Events -------------------------------------------------------------

  function onVisibility() {
    if (destroyed) return;
    const now = win.performance.now();
    if (doc.hidden) {
      // Pause: request nothing while hidden.
      if (pausedAt >= 0) return;
      pausedAt = now;
      if (raf) win.cancelAnimationFrame(raf);
      if (holdTimer) win.clearTimeout(holdTimer);
      raf = 0;
      holdTimer = 0;
      return;
    }
    if (pausedAt < 0) return;
    // Resume where it stopped.
    const away = now - pausedAt;
    pausedAt = -1;
    if (phase === DRAWING) {
      pen[START] += away;
      raf = win.requestAnimationFrame(frame);
    } else if (phase === HOLDING && !reduced) {
      holdEnd += away;
      holdTimer = win.setTimeout(endHold, Math.max(0, holdEnd - now));
    }
  }

  /** Redraw in the new colour when the theme changes; no regeneration. */
  function onThemeMaybeChanged() {
    if (destroyed) return;
    const c = win.getComputedStyle(element).color;
    if (c === color) return;
    color = c;
    redraw();
  }

  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = motion.matches;
  function onMotion() {
    reduced = motion.matches;
    if (reduced && phase === DRAWING) {
      // Finish at once; stay on this moth.
      cancelTimers();
      phase = HOLDING;
      redraw();
      caption.style.transition = 'none';
      caption.style.opacity = '1';
    } else if (!reduced && phase === HOLDING && !holdTimer) {
      holdEnd = win.performance.now() + holdMs;
      holdTimer = win.setTimeout(endHold, holdMs);
    }
  }

  function next() {
    if (destroyed) return;
    cancelTimers();
    if (pending) show();
    else {
      phase = WAITING;
      request();
    }
  }

  const scheme = win.matchMedia('(prefers-color-scheme: dark)');
  const resizer = new ResizeObserver(() => {
    resize();
    redraw();
  });
  // Themes are often switched by a class or data attribute on <html> or
  // <body>; watch those as well as the system setting.
  const themeWatcher = new MutationObserver(onThemeMaybeChanged);
  resizer.observe(element);
  themeWatcher.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  if (doc.body) themeWatcher.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  scheme.addEventListener('change', onThemeMaybeChanged);
  motion.addEventListener('change', onMotion);
  doc.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('click', next);

  resize();
  request();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelTimers();
    if (watchdog) win.clearTimeout(watchdog);
    worker?.terminate();
    worker = null;
    resizer.disconnect();
    themeWatcher.disconnect();
    scheme.removeEventListener('change', onThemeMaybeChanged);
    motion.removeEventListener('change', onMotion);
    doc.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('click', next);
    // Free the canvas's backing memory before removing it.
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
    caption.remove();
    if (restorePosition !== null) element.style.position = restorePosition;
    current = pending = null;
    spare = null;
  }

  return { next, destroy };
}
