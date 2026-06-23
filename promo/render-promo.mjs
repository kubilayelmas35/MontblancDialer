#!/usr/bin/env node
/**
 * Renders Montblanc Dialer promo videos (TR/DE × vertical/horizontal).
 * Usage: node promo/render-promo.mjs
 * Requires: npx playwright install chromium (once)
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const DURATION_MS = 54_000; // 6 slides × 9s

const JOBS = [
  { lang: 'tr', orient: 'vertical', w: 1080, h: 1920, name: 'montblanc-dialer-tr-dikey' },
  { lang: 'tr', orient: 'horizontal', w: 1920, h: 1080, name: 'montblanc-dialer-tr-yatay' },
  { lang: 'de', orient: 'vertical', w: 1080, h: 1920, name: 'montblanc-dialer-de-dikey' },
  { lang: 'de', orient: 'horizontal', w: 1920, h: 1080, name: 'montblanc-dialer-de-yatay' },
];

function startStaticServer(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/promo.html';
      const file = path.join(root, p.replace(/^\//, ''));
      if (!file.startsWith(root) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(file);
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, port }));
    server.on('error', reject);
  });
}

function ffmpegConvert(webmPath, mp4Path) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', webmPath,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      mp4Path,
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'inherit' });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

async function renderOne(browser, baseUrl, job) {
  const videoDir = path.join(OUT, '_tmp');
  fs.mkdirSync(videoDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: job.w, height: job.h },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: job.w, height: job.h } },
  });
  const page = await context.newPage();
  const url = `${baseUrl}/promo.html?lang=${job.lang}&orient=${job.orient}`;
  console.log(`Recording ${job.name} (${job.w}×${job.h})…`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(DURATION_MS);
  await context.close();

  const webms = fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
  const latest = webms.sort().pop();
  if (!latest) throw new Error('No webm recorded');
  const webmPath = path.join(videoDir, latest);
  const mp4Path = path.join(OUT, `${job.name}.mp4`);
  await ffmpegConvert(webmPath, mp4Path);
  fs.unlinkSync(webmPath);
  console.log(`✓ ${mp4Path}`);
  return mp4Path;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const port = 8765 + Math.floor(Math.random() * 500);
  const { server } = await startStaticServer(__dirname, port);
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const job of JOBS) {
      results.push(await renderOne(browser, baseUrl, job));
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\nDone. Files:');
  results.forEach((p) => console.log(' ', p));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
