// @ts-check
// Drawing -> standalone SVG string. One <path> holds every polyline, stroked
// with currentColor, so the file inherits its colour from wherever it is
// placed (or renders black when opened on its own).

import { LINE_WIDTH } from './geom.js';

/** @typedef {import('./builder.js').Drawing} Drawing */

/**
 * @typedef {object} SvgOptions
 * @property {number} [width]        width attribute in px; height follows the frame ratio.
 *                                   Omitted: the SVG scales to its container.
 * @property {number} [lineWidth]    stroke width in drawing units; it scales with the
 *                                   plate. Default LINE_WIDTH: 1.5 px on a 900 px plate.
 * @property {number} [precision]    decimals per coordinate (default 1, i.e. 0.1 unit)
 * @property {string} [title]        becomes <title> (for screen readers and tooltips)
 * @property {string} [label]        the species name, drawn in italics at drawing.label.
 *                                   No font-family is set, so inline SVG uses the
 *                                   page's font and a standalone file the viewer's serif.
 */

/**
 * @param {Drawing} drawing
 * @param {SvgOptions} [options]
 * @returns {string}
 */
export function toSVG(drawing, options = {}) {
  const { width, lineWidth = LINE_WIDTH, precision = 1, title, label } = options;
  const { points, offsets } = drawing;
  const f = 10 ** precision;
  const lines = offsets.length - 1;

  // "M x y x y x y": coordinate pairs after a moveto are implicit linetos.
  let d = '';
  for (let l = 0; l < lines; l++) {
    const a = offsets[l];
    const b = offsets[l + 1];
    d += 'M';
    for (let v = a; v < b; v++) {
      d += Math.round(points[2 * v] * f) / f + ' ' + Math.round(points[2 * v + 1] * f) / f;
      if (v < b - 1) d += ' ';
    }
  }

  const W = drawing.width;
  const H = drawing.height;
  const size = width ? ` width="${width}" height="${Math.round((width * H) / W)}"` : '';
  const titleTag = title ? `<title>${escapeXml(title)}</title>` : '';
  const lb = drawing.label;
  const text = label
    ? `<text x="${lb.x}" y="${lb.y}" font-size="${lb.size}" font-style="italic" text-anchor="middle" fill="currentColor">${escapeXml(label)}</text>`
    : '';
  // The stroke is in drawing units, so the line weight scales with the plate.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}>${titleTag}` +
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${Math.round(lineWidth * 1000) / 1000}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>${text}</svg>`
  );
}

/** @param {string} s */
function escapeXml(s) {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
