/**
 * @param {HTMLElement} element  the plate is sized to fill it
 * @param {MountOptions} [options]
 * @returns {Mounted}
 */
export function mount(element: HTMLElement, options?: MountOptions): Mounted;
export type Drawing = import("./builder.js").Drawing;
export type MothReply = import("./make.js").MothReply;
export type MothRequest = import("./make.js").MothRequest;
export type MountOptions = {
    /**
     * time to draw one moth (default 7)
     */
    drawSeconds?: number | undefined;
    /**
     * time a finished moth stays (default 6)
     */
    holdSeconds?: number | undefined;
    /**
     * name fade-in, part of the hold (default 0.8)
     */
    fadeSeconds?: number | undefined;
    /**
     * fixed sequence: seed, seed-1, seed-2... (default: random)
     */
    seed?: string | undefined;
    /**
     * texture density (default 1)
     */
    density?: number | undefined;
    /**
     * draw the ruled frame (default true); without it
     * the moth sits directly on the page's background, name just below it
     */
    frame?: boolean | undefined;
    /**
     * in drawing units (default LINE_WIDTH)
     */
    lineWidth?: number | undefined;
    /**
     * called when each moth starts
     */
    onMoth?: ((moth: {
        name: string;
        seed: string;
        family: string;
    }) => void) | undefined;
    /**
     * where the worker script is, if a
     * bundler cannot resolve it (default: worker.js next to this module)
     */
    workerUrl?: string | URL | undefined;
};
export type Mounted = {
    /**
     * skip to a new moth
     */
    next: () => void;
    /**
     * stop everything and remove the canvas
     */
    destroy: () => void;
};
