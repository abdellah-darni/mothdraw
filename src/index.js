// @ts-check
export { generate, FRAME_WIDTH, FRAME_HEIGHT } from './generate.js';
export { toSVG } from './render-svg.js';
export { fitDrawing, drawDrawing, drawLabel } from './render-canvas.js';
export { LINE_WIDTH } from './geom.js';
export { mount } from './mount.js';

// Types for sites using mothdraw (generated into types/ by `npm run types`).
/** @typedef {import('./builder.js').Drawing} Drawing */
/** @typedef {import('./builder.js').Label} Label */
/** @typedef {import('./generate.js').Moth} Moth */
/** @typedef {import('./generate.js').GenerateOptions} GenerateOptions */
/** @typedef {import('./render-svg.js').SvgOptions} SvgOptions */
/** @typedef {import('./render-canvas.js').Fit} Fit */
/** @typedef {import('./mount.js').MountOptions} MountOptions */
/** @typedef {import('./mount.js').Mounted} Mounted */
