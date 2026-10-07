// @ts-check
// The worker side of continuous mode (mount.js): makes each moth off the
// main thread and sends it back with its arrays transferred, not copied.

import { makeMoth } from './make.js';

// In a worker, `self` is the worker's global scope, whose postMessage takes
// a transfer list (the DOM types describe Window's instead).
const scope = /** @type {{ onmessage: unknown, postMessage(message: unknown, transfer: Transferable[]): void }} */ (
  /** @type {unknown} */ (self)
);

/** @param {MessageEvent<import('./make.js').MothRequest>} e */
scope.onmessage = (e) => {
  const reply = makeMoth(e.data);
  const { points, offsets } = reply.drawing;
  // The array form of the transfer list works in every browser with module workers.
  scope.postMessage(reply, [points.buffer, offsets.buffer]);
};
