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
export const LAYER: Readonly<{
    FRAME: 0;
    BODY: 1;
    WING: 2;
    VEIN: 3;
    PATTERN: 4;
    SHADE: 5;
    FRINGE: 6;
    ANTENNA: 7;
}>;
export class Builder {
    /**
     * @param {number} [vertexCapacity] initial size; grows as needed
     * @param {number} [lineCapacity]
     */
    constructor(vertexCapacity?: number, lineCapacity?: number);
    /** Scratch vertices, x and y interleaved. */
    pts: Float32Array<ArrayBuffer>;
    /** starts[i] is the first vertex of line i; starts[lineCount] ends the last. */
    starts: Uint32Array<ArrayBuffer>;
    /** Layer number of each line, plus the MIRROR bit. */
    flags: Uint8Array<ArrayBuffer>;
    vertexCount: number;
    lineCount: number;
    open: boolean;
    /** Reused by pack() to avoid an allocation per call. */
    fit: {
        scale: number;
        x: number;
        y: number;
    };
    /** After pack(): the specimen's bounding box in frame units (the frame excluded). */
    bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
    /** Forgets all lines but keeps the memory. */
    reset(): void;
    /**
     * Starts a new polyline, closing any open one.
     * @param {number} layer one of LAYER
     * @param {boolean} [mirror] add a mirror image across x = 0 when packing
     * @param {boolean} [absolute] points are frame coordinates (the frame itself)
     */
    begin(layer: number, mirror?: boolean, absolute?: boolean): void;
    /**
     * Appends a vertex to the open polyline.
     * @param {number} x
     * @param {number} y
     */
    point(x: number, y: number): void;
    /** Vertices pack() will write, counting mirror images. */
    outputVertexCount(): number;
    /** Closes the open polyline. A line with fewer than 2 vertices is dropped. */
    end(): void;
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
    pack(width: number, height: number, box: Box, label: Label, reuse?: Reuse): Drawing;
    /** @private */
    private growPoints;
    /** @private */
    private growLines;
}
export type Drawing = {
    /**
     * x0, y0, x1, y1, ... in frame units
     */
    points: Float32Array;
    /**
     * length lineCount + 1; polyline i is
     * vertices offsets[i] .. offsets[i+1] - 1
     */
    offsets: Uint32Array;
    /**
     * frame width in drawing units
     */
    width: number;
    /**
     * frame height in drawing units
     */
    height: number;
    /**
     * where renderers place the species name
     */
    label: Label;
};
/**
 * The name is text, not lines: each renderer draws it in italics with the
 * page's font, centred on x with its baseline at y.
 */
export type Label = {
    x: number;
    /**
     * baseline
     */
    y: number;
    /**
     * font size in drawing units
     */
    size: number;
};
/**
 * The rectangle the specimen is scaled to fit, in frame units.
 */
export type Box = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};
/**
 * Previous output arrays offered back for reuse (DESIGN.md §5.1).
 */
export type Reuse = {
    points?: Float32Array<ArrayBufferLike> | undefined;
    offsets?: Uint32Array<ArrayBufferLike> | undefined;
};
