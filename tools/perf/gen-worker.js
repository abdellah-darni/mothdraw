import { generate } from '../../dist/mothdraw.js';
self.onmessage = (e) => {
  const t0 = performance.now();
  generate(e.data);
  self.postMessage(performance.now() - t0);
};
