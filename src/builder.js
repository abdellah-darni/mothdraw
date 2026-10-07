// @ts-check
// Collects polylines into reusable scratch arrays, then packs them into the
// flat Drawing format (DESIGN.md §5).
//
// The generator works in model space: body axis on x = 0, head towards
// negative y, right half only for anything flagged as mirrored. pack() adds
// the mirror images, sorts lines into drawing order by layer, and scales
// everything to fit the output frame.

import { fitBox } from './geom.js';

/**
 * @typedef {object} Drawing
 * @property {Float32Array} points  x0, y0, x1, y1, ... in frame units
 * @property {Uint32Array} offsets  length lineCount + 1; polyline i is
 *   vertices offsets[i] .. offsets[i+1] - 1
 * @property {number} width   frame width in drawing units
 * @property {number} height  frame height in drawing units
 * @property {Label} label    where renderers place the species name
 */

/**
 * The name is text, not lines: each renderer draws it in italics with the
 * page's font, centred on x with its baseline at y.
 * @typedef {object} Label
 * @property {number} x
 * @property {number} y     baseline
 * @property {number} size  font size in drawing units
 */

/**
 * The rectangle the specimen is scaled to fit, in frame units.
 * @typedef {object} Box
 * @property {number} left
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 */

/**
 * Previous output arrays offered back for reuse (DESIGN.md §5.1).
 * @typedef {object} Reuse
 * @property {Float32Array} [points]
 * @property {Uint32Array} [offsets]
 */

/**
 * Layers, in drawing order. The pen animation draws layer 0 first.
 */
export const LAYER = Object.freeze({
  FRAME: 0,
  BODY: 1,
  WING: 2,
  VEIN: 3,
  PATTERN: 4,
  SHADE: 5,
  FRINGE: 6,
  ANTENNA: 7,
});
const LAYER_COUNT = 8;
// Flag bits stored next to the layer number.
/** Add a mirror image across x = 0 when packing. */
const MIRROR = 0x80;
/** Already in frame units: not scaled, not mirrored, not in the bounding box. */
const ABSOLUTE = 0x40;
const LAYER_MASK = 0x3f;

export class Builder {
  /**
   * @param {number} [vertexCapacity] initial size; grows as needed
   * @param {number} [lineCapacity]
   */
  constructor(vertexCapacity = 1 << 14, lineCapacity = 1 << 11) {
    /** Scratch vertices, x and y interleaved. */
    this.pts = new Float32Array(vertexCapacity * 2);
    /** starts[i] is the first vertex of line i; starts[lineCount] ends the last. */
    this.starts = new Uint32Array(lineCapacity + 1);
    /** Layer number of each line, plus the MIRROR bit. */
    this.flags = new Uint8Array(lineCapacity);
    this.vertexCount = 0;
    this.lineCount = 0;
    this.open = false;
    /** Reused by pack() to avoid an allocation per call. */
    this.fit = { scale: 1, x: 0, y: 0 };
    /** After pack(): the specimen's bounding box in frame units (the frame excluded). */
    this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  /** Forgets all lines but keeps the memory. */
  reset() {
    this.vertexCount = 0;
    this.lineCount = 0;
    this.open = false;
  }

  /**
   * Starts a new polyline, closing any open one.
   * @param {number} layer one of LAYER
   * @param {boolean} [mirror] add a mirror image across x = 0 when packing
   * @param {boolean} [absolute] points are frame coordinates (the frame itself)
   */
  begin(layer, mirror = true, absolute = false) {
    if (this.open) this.end();
    if (this.lineCount === this.flags.length) this.growLines();
    this.starts[this.lineCount] = this.vertexCount;
    this.flags[this.lineCount] = layer | (absolute ? ABSOLUTE : mirror ? MIRROR : 0);
    this.open = true;
  }

  /**
   * Appends a vertex to the open polyline.
   * @param {number} x
   * @param {number} y
   */
  point(x, y) {
    if (this.vertexCount * 2 === this.pts.length) this.growPoints();
    const i = this.vertexCount * 2;
    this.pts[i] = x;
    this.pts[i + 1] = y;
    this.vertexCount++;
  }

  /** Vertices pack() will write, counting mirror images. */
  outputVertexCount() {
    let total = 0;
    for (let l = 0; l < this.lineCount; l++) {
      const n = this.starts[l + 1] - this.starts[l];
      total += this.flags[l] & MIRROR ? 2 * n : n;
    }
    return total;
  }

  /** Closes the open polyline. A line with fewer than 2 vertices is dropped. */
  end() {
    if (!this.open) return;
    this.open = false;
    if (this.vertexCount - this.starts[this.lineCount] < 2) {
      this.vertexCount = this.starts[this.lineCount];
      return;
    }
    this.lineCount++;
    this.starts[this.lineCount] = this.vertexCount;
  }

  /**
   * Produces the Drawing: mirror images added, lines in layer order (each
   * mirrored line immediately followed by its mirror image), and the
   * specimen scaled to fit `box`. Absolute lines are copied unchanged.
   *
   * Output arrays are new and exactly sized, unless `reuse` offers buffers
   * that are still attached and big enough; then the result is
   * exact-length views over those buffers.
   * @param {number} width   frame size
   * @param {number} height
   * @param {Box} box        where the specimen goes
   * @param {Label} label
   * @param {Reuse} [reuse]
   * @returns {Drawing}
   */
  pack(width, height, box, label, reuse) {
    if (this.open) this.end();
    const pts = this.pts;
    const starts = this.starts;
    const flags = this.flags;
    const n = this.lineCount;

    // Pass 1: bounding box (including mirror images) and output sizes.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let outVertices = 0;
    let outLines = 0;
    for (let l = 0; l < n; l++) {
      const mirrored = (flags[l] & MIRROR) !== 0;
      const a = starts[l];
      const b = starts[l + 1];
      const copies = mirrored ? 2 : 1;
      outVertices += (b - a) * copies;
      outLines += copies;
      if (flags[l] & ABSOLUTE) continue;
      for (let v = a; v < b; v++) {
        const x = pts[2 * v];
        const y = pts[2 * v + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (mirrored) {
          if (-x < minX) minX = -x;
          if (-x > maxX) maxX = -x;
        }
      }
    }
    if (n === 0) minX = minY = maxX = maxY = 0;
    const { scale, x: ox, y: oy } = fitBox(minX, minY, maxX, maxY, box.left, box.top, box.right, box.bottom, this.fit);
    this.bounds.minX = minX * scale + ox;
    this.bounds.minY = minY * scale + oy;
    this.bounds.maxX = maxX * scale + ox;
    this.bounds.maxY = maxY * scale + oy;

    const points = floatOutput(reuse && reuse.points, outVertices * 2);
    const offsets = uintOutput(reuse && reuse.offsets, outLines + 1);

    // Pass 2: copy lines out layer by layer, transformed to the frame.
    let w = 0;
    let line = 0;
    for (let layer = 0; layer < LAYER_COUNT; layer++) {
      for (let l = 0; l < n; l++) {
        const f = flags[l];
        if ((f & LAYER_MASK) !== layer) continue;
        const a = starts[l];
        const b = starts[l + 1];
        offsets[line++] = w >> 1;
        if (f & ABSOLUTE) {
          for (let v = a; v < b; v++) {
            points[w++] = pts[2 * v];
            points[w++] = pts[2 * v + 1];
          }
          continue;
        }
        for (let v = a; v < b; v++) {
          points[w++] = pts[2 * v] * scale + ox;
          points[w++] = pts[2 * v + 1] * scale + oy;
        }
        if (f & MIRROR) {
          offsets[line++] = w >> 1;
          for (let v = a; v < b; v++) {
            points[w++] = -pts[2 * v] * scale + ox;
            points[w++] = pts[2 * v + 1] * scale + oy;
          }
        }
      }
    }
    offsets[line] = w >> 1;
    return { points, offsets, width, height, label };
  }

  /** @private */
  growPoints() {
    const next = new Float32Array(this.pts.length * 2);
    next.set(this.pts);
    this.pts = next;
  }

  /** @private */
  growLines() {
    const cap = this.flags.length * 2;
    const starts = new Uint32Array(cap + 1);
    starts.set(this.starts);
    this.starts = starts;
    const flags = new Uint8Array(cap);
    flags.set(this.flags);
    this.flags = flags;
  }
}

// A transferred (detached) buffer reports byteLength 0, so it is never
// reused: it belongs to the other side now.

/**
 * @param {Float32Array | undefined} prev
 * @param {number} length
 */
function floatOutput(prev, length) {
  return prev && prev.buffer.byteLength >= length * 4
    ? new Float32Array(prev.buffer, 0, length)
    : new Float32Array(length);
}

/**
 * @param {Uint32Array | undefined} prev
 * @param {number} length
 */
function uintOutput(prev, length) {
  return prev && prev.buffer.byteLength >= length * 4
    ? new Uint32Array(prev.buffer, 0, length)
    : new Uint32Array(length);
}
