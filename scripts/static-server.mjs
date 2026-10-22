import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8765);
const allowed = new Set(['', 'index.html', 'css', 'js', 'assets', 'img', 'images', 'fonts', 'favicon.svg', 'geocon']);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function blocked(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.includes('..')) return true;
  const parts = clean.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.'))) return true;
  const top = parts[0] || '';
  if (!allowed.has(top) && top !== 'favicon.svg') return true;
  return false;
}

function isGeocon(req) {
  const clean = decodeURIComponent(String(req.url || '/').split('?')[0]);
  return clean === '/geocon' || clean.startsWith('/geocon/');
}

function headers(req) {
  const framed = isGeocon(req);
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': framed ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://esm.sh https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://open.er-api.com https://api.exchangerate.host https://nominatim.openstreetmap.org https://api.tomtom.com https://maps.googleapis.com https://esm.sh https://*.telnyx.com wss://*.telnyx.com https://overpass-api.de https://lz4.overpass-api.de https://overpass.kumi.systems https://z.overpass-api.de https://secure.geonames.org https://raw.githubusercontent.com",
      "media-src 'self' blob: https:",
      "worker-src 'self' blob:",
      framed ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
    'Cache-Control': 'no-cache',
  };
  const proto = req.headers['x-forwarded-proto'] || '';
  if (proto === 'https') h['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
  return h;
}

const server = http.createServer((req, res) => {
  const extra = headers(req);
  if (blocked(req.url || '/')) {
    res.writeHead(404, { ...extra, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(404, extra);
    res.end('Not found');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { ...extra, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { ...extra, 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`static ${port}`);
});
