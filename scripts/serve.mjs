// Minimal static file server for dist-demo/ (used by Playwright and for local demo runs).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../dist-demo');
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}`));
