/**
 * @param {MothRequest} req
 * @returns {MothReply}
 */
export function makeMoth(req: MothRequest): MothReply;
export type MothRequest = {
    /**
     * fixed seed sequence (base, base-1, base-2...), or null for random seeds
     */
    base: string | null;
    /**
     * next index in the fixed sequence
     */
    index: number;
    /**
     * main family to avoid (the moth on screen)
     */
    avoid: string | null;
    density: number;
    /**
     * draw the ruled frame
     */
    frame: boolean;
    /**
     * previous moth's arrays, sent back for reuse
     */
    points?: Float32Array<ArrayBufferLike> | undefined;
    offsets?: Uint32Array<ArrayBufferLike> | undefined;
};
export type MothReply = {
    seed: string;
    name: string;
    family: string;
    /**
     * where the fixed sequence continues
     */
    index: number;
    drawing: import("./builder.js").Drawing;
    /**
     * total ink length, for the fixed-time pen
     */
    total: number;
};
