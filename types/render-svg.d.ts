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
export function toSVG(drawing: Drawing, options?: SvgOptions): string;
export type Drawing = import("./builder.js").Drawing;
export type SvgOptions = {
    /**
     * width attribute in px; height follows the frame ratio.
     *         Omitted: the SVG scales to its container.
     */
    width?: number | undefined;
    /**
     * stroke width in drawing units; it scales with the
     *     plate. Default LINE_WIDTH: 1.5 px on a 900 px plate.
     */
    lineWidth?: number | undefined;
    /**
     * decimals per coordinate (default 1, i.e. 0.1 unit)
     */
    precision?: number | undefined;
    /**
     * becomes <title> (for screen readers and tooltips)
     */
    title?: string | undefined;
    /**
     * the species name, drawn in italics at drawing.label.
     *         No font-family is set, so inline SVG uses the
     *         page's font and a standalone file the viewer's serif.
     */
    label?: string | undefined;
};
