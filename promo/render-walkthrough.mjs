#!/usr/bin/env node
/**
 * Gerçek Montblanc Dialer arayüzünü gezen tanıtım videosu (TR/DE × dikey/yatay).
 * Usage: node promo/render-walkthrough.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { buildTour, COPY, PROMO_SESSION, tourDurationMs } from './walkthrough-tour.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'output');

const JOBS = [
  { lang: 'tr', orient: 'vertical', w: 1080, h: 1920, name: 'montblanc-dialer-tr-dikey' },
  { lang: 'tr', orient: 'horizontal', w: 1920, h: 1080, name: 'montblanc-dialer-tr-yatay' },
  { lang: 'de', orient: 'vertical', w: 1080, h: 1920, name: 'montblanc-dialer-de-dikey' },
  { lang: 'de', orient: 'horizontal', w: 1920, h: 1080, name: 'montblanc-dialer-de-yatay' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

function startStaticServer(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(root, p.replace(/^\//, '')));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
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
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      mp4Path,
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'inherit' });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

async function injectPromoChrome(page, job) {
  const brand = COPY[job.lang].brand;
  const tagline = COPY[job.lang].tagline;
  const vertical = job.orient === 'vertical';
  await page.addStyleTag({
    content: `
      #promo-caption-root {
        position: fixed; z-index: 999999; pointer-events: none;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        transition: opacity 0.35s ease;
      }
      #promo-caption-root[data-visible="0"] { opacity: 0; }
      #promo-caption-root[data-visible="1"] { opacity: 1; }
      ${vertical ? `
        body.promo-vertical #app,
        body.promo-vertical #page-login {
          transform: scale(0.58);
          transform-origin: top center;
          width: 1724px;
          margin: 0 auto;
        }
        body.promo-vertical #promo-caption-root {
          left: 0; right: 0; bottom: 0; height: 340px;
          background: linear-gradient(to top, rgba(8,10,16,0.97) 65%, transparent);
          display: flex; flex-direction: column; justify-content: flex-end;
          padding: 28px 36px 48px;
        }
      ` : `
        body.promo-horizontal #promo-caption-root {
          left: 0; right: 0; bottom: 0; height: 120px;
          background: linear-gradient(to top, rgba(8,10,16,0.92) 70%, transparent);
          display: flex; align-items: flex-end;
          padding: 0 48px 28px; gap: 20px;
        }
      `}
      #promo-caption-brand {
        font-size: ${vertical ? '13px' : '12px'}; font-weight: 700;
        letter-spacing: 0.12em; text-transform: uppercase;
        color: #d4a017; margin-bottom: ${vertical ? '8px' : '4px'};
      }
      #promo-caption-title {
        font-size: ${vertical ? '34px' : '28px'}; font-weight: 800;
        color: #f8fafc; line-height: 1.15;
      }
      #promo-caption-sub {
        font-size: ${vertical ? '18px' : '15px'}; color: #94a3b8;
        margin-top: 8px; line-height: 1.35;
      }
      #promo-outro {
        position: fixed; inset: 0; z-index: 999998; pointer-events: none;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: radial-gradient(ellipse 80% 60% at 50% 0%, #1a1520 0%, #0d0f14 55%);
        opacity: 0; transition: opacity 0.5s ease;
      }
      #promo-outro[data-show="1"] { opacity: 1; }
      #promo-outro .logo {
        width: 88px; height: 88px; border-radius: 22px;
        background: linear-gradient(135deg, #d4a017, #b8860b);
        display: flex; align-items: center; justify-content: center;
        font-size: 42px; font-weight: 800; color: #0d0f14;
        box-shadow: 0 12px 40px rgba(184,134,11,0.35);
        margin-bottom: 28px;
      }
      #promo-outro h2 { font-size: ${vertical ? '48px' : '56px'}; font-weight: 800; color: #f0f2f8; text-align: center; }
      #promo-outro p { font-size: ${vertical ? '20px' : '22px'}; color: #9ca3af; margin-top: 16px; text-align: center; max-width: 720px; padding: 0 24px; }
      #promo-outro .ver { margin-top: 24px; color: #d4a017; font-size: 14px; font-weight: 600; }
    `,
  });
  await page.evaluate(({ brand, tagline, vertical }) => {
    document.body.classList.add(vertical ? 'promo-vertical' : 'promo-horizontal');
    if (!document.getElementById('promo-caption-root')) {
      const cap = document.createElement('div');
      cap.id = 'promo-caption-root';
      cap.dataset.visible = '0';
      cap.innerHTML = `
        <div id="promo-caption-brand"></div>
        <div id="promo-caption-title"></div>
        <div id="promo-caption-sub"></div>`;
      document.body.appendChild(cap);
    }
    if (!document.getElementById('promo-outro')) {
      const outro = document.createElement('div');
      outro.id = 'promo-outro';
      outro.dataset.show = '0';
      outro.innerHTML = `
        <div class="logo">M</div>
        <h2 id="promo-outro-title"></h2>
        <p id="promo-outro-sub"></p>
        <div class="ver" id="promo-outro-ver"></div>`;
      document.body.appendChild(outro);
    }
    document.getElementById('promo-caption-brand').textContent = brand;
    window.__promoSetCaption = (title, sub, visible = true) => {
      document.getElementById('promo-caption-title').textContent = title || '';
      document.getElementById('promo-caption-sub').textContent = sub || tagline;
      document.getElementById('promo-caption-root').dataset.visible = visible ? '1' : '0';
    };
    window.__promoShowOutro = (title, sub, ver) => {
      document.getElementById('promo-outro-title').textContent = title;
      document.getElementById('promo-outro-sub').textContent = sub;
      document.getElementById('promo-outro-ver').textContent = ver;
      document.getElementById('promo-outro').dataset.show = '1';
      document.getElementById('promo-caption-root').dataset.visible = '0';
    };
    window.__promoHideOutro = () => {
      document.getElementById('promo-outro').dataset.show = '0';
    };
  }, { brand, tagline, vertical });
}

async function setCaption(page, title, sub, visible = true) {
  await page.evaluate(({ title, sub, visible }) => {
    window.__promoSetCaption?.(title, sub, visible);
  }, { title, sub, visible });
}

async function smoothScrollMain(page, amount = 420) {
  await page.evaluate(async (dy) => {
    const el = document.getElementById('main') || document.scrollingElement;
    if (!el) return;
    const start = el.scrollTop;
    const target = Math.min(start + dy, el.scrollHeight - el.clientHeight);
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      el.scrollTop = start + ((target - start) * i) / steps;
      await new Promise((r) => setTimeout(r, 16));
    }
  }, amount);
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay.open').forEach((m) => m.remove());
    document.getElementById('sidebar-overlay')?.classList.remove('open');
    document.getElementById('sidebar')?.classList.remove('open');
  });
}

async function performLoginScene(page, lang, job) {
  await page.evaluate(() => {
    localStorage.removeItem('mb_session');
    localStorage.removeItem('mb_base_session');
    localStorage.removeItem('mb_impersonation');
    const login = document.getElementById('page-login');
    const app = document.getElementById('app');
    if (login) login.style.display = 'flex';
    if (app) app.style.display = 'none';
  });
  await page.waitForSelector('#page-login', { state: 'visible' });
  await page.evaluate((l) => { if (typeof setLang === 'function') setLang(l); }, lang);
  await page.waitForTimeout(600);

  const email = page.locator('#login-email');
  const pass = page.locator('#login-pass');
  await email.click();
  await email.fill('');
  for (const ch of 'demo@montblanc.com') {
    await email.type(ch, { delay: 45 });
  }
  await pass.click();
  for (const ch of '••••') {
    await pass.type(ch, { delay: 60 });
  }
  await page.waitForTimeout(800);

  await page.evaluate((sess) => {
    localStorage.setItem('mb_session', JSON.stringify(sess));
    localStorage.setItem('mb_base_session', JSON.stringify(sess));
  }, PROMO_SESSION);
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#app', { state: 'visible', timeout: 30000 });
  await injectPromoChrome(page, job);
  await page.evaluate((l) => { if (typeof setLang === 'function') setLang(l); }, lang);
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
}

async function goToPage(page, pageName, settingsTab) {
  await page.evaluate(({ pageName, settingsTab }) => {
    if (typeof navigate === 'function') navigate(pageName);
    if (pageName === 'settings' && settingsTab && typeof setSettingsTab === 'function') {
      setSettingsTab(settingsTab);
    }
  }, { pageName, settingsTab });
  await page.waitForSelector(`#page-${pageName}.active`, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
  await dismissOverlays(page);
}

async function runTour(page, job) {
  const tour = buildTour(job.lang);
  const copy = COPY[job.lang];
  let version = 'v8.20';
  try {
    version = `v${JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version}`;
  } catch { /* ignore */ }

  for (const step of tour) {
    await setCaption(page, step.title, step.sub, true);

    if (step.kind === 'login') {
      await performLoginScene(page, job.lang, job);
      await page.waitForTimeout(step.ms);
    } else if (step.kind === 'page') {
      await goToPage(page, step.page, step.settingsTab);
      const scrollMs = step.scroll ? Math.floor(step.ms * 0.55) : 0;
      const holdMs = step.ms - scrollMs;
      if (step.scroll) {
        await page.waitForTimeout(500);
        await smoothScrollMain(page, job.orient === 'vertical' ? 300 : 450);
        await page.waitForTimeout(Math.floor(scrollMs * 0.45));
        await smoothScrollMain(page, job.orient === 'vertical' ? 240 : 380);
        await page.waitForTimeout(Math.floor(scrollMs * 0.55));
      }
      await page.waitForTimeout(Math.max(400, holdMs));
    } else if (step.kind === 'outro') {
      await page.evaluate(({ title, sub, version }) => {
        window.__promoShowOutro?.(title, sub, `montblanc-dialer · ${version}`);
      }, { title: step.title, sub: step.sub, version });
      await page.waitForTimeout(step.ms);
      await page.evaluate(() => window.__promoHideOutro?.());
    }
  }

  await setCaption(page, copy.brand, copy.tagline, false);
}

async function renderOne(browser, baseUrl, job) {
  const videoDir = path.join(OUT, '_walk');
  fs.mkdirSync(videoDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: job.w, height: job.h },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: job.w, height: job.h } },
    locale: job.lang === 'de' ? 'de-DE' : 'tr-TR',
  });

  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('webrtc') || url.includes('telnyx.com/v2/calls')) {
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();
  const dur = tourDurationMs(job.lang);
  console.log(`Recording ${job.name} (${job.w}×${job.h}, ~${Math.round(dur / 1000)}s)…`);

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await injectPromoChrome(page, job);
  await runTour(page, job);
  await page.waitForTimeout(500);

  const video = page.video();
  await context.close();

  const webmPath = await video.path();
  const mp4Path = path.join(OUT, `${job.name}.mp4`);
  await ffmpegConvert(webmPath, mp4Path);
  try { fs.unlinkSync(webmPath); } catch { /* ignore */ }
  console.log(`✓ ${mp4Path}`);
  return mp4Path;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const port = 8870 + Math.floor(Math.random() * 200);
  const { server } = await startStaticServer(ROOT, port);
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security'],
  });
  const results = [];
  try {
    for (const job of JOBS) {
      results.push(await renderOne(browser, baseUrl, job));
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\nDone. Walkthrough videos:');
  results.forEach((p) => console.log(' ', p));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
