// npm run serve: tiny static server for the demo (ES modules do not load
// from file:// URLs). Serves the repository root on 127.0.0.1 only, unless
// HOST is set (HOST=0.0.0.0 npm run serve, to test on a phone on the same
// network).

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (statSync(path).isDirectory()) path = join(path, 'index.html');
    statSync(path);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(path)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(path).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`http://${HOST}:${PORT}/demo/   (root ${ROOT.replace(/\/$/, '') + sep})`);
});
