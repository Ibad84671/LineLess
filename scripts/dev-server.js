// Local development server: serves frontend/ with SPA fallback on
// http://localhost:5173 and maps /config.js to config.example.js so the app
// runs against local/default endpoints without a build step.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = join(root, 'frontend');
const port = Number(process.env.DEV_PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/config.js') {
      const body = await readFile(join(frontendDir, 'config.example.js'));
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(body);
      return;
    }

    let filePath = normalize(join(frontendDir, pathname));
    if (!filePath.startsWith(frontendDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || fileStat.isDirectory()) {
      // SPA fallback: serve index.html for app routes.
      filePath = join(frontendDir, 'index.html');
      fileStat = await stat(filePath);
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Dev server error');
  }
});

server.listen(port, () => {
  console.log(`LineLess dev server: http://localhost:${port}`);
});
