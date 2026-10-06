// @ts-check
// Drawing -> standalone SVG string. One <path> holds every polyline, stroked
// with currentColor, so the file inherits its colour from wherever it is
// placed (or renders black when opened on its own).

/** @typedef {import('./builder.js').Drawing} Drawing */

/**
 * @typedef {object} SvgOptions
 * @property {number} [width]        width attribute in px; height follows the frame ratio.
 *                                   Omitted: the SVG scales to its container.
 * @property {number} [strokeWidth]  stroke width in screen px (default 1)
 * @property {number} [precision]    decimals per coordinate (default 1, i.e. 0.1 unit)
 * @property {string} [title]        e.g. the species name; becomes <title>
 */

/**
 * @param {Drawing} drawing
 * @param {SvgOptions} [options]
 * @returns {string}
 */
export function toSVG(drawing, options = {}) {
  const { width, strokeWidth = 1, precision = 1, title } = options;
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
  // non-scaling-stroke keeps the line weight constant at any display size.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}>${titleTag}` +
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`
  );
}

/** @param {string} s */
function escapeXml(s) {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
