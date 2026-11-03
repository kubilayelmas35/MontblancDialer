/**
 * Eksik çeviri taraması: data-tr/data-de dengesizliği + i18n anahtarları.
 * Çalıştır: node scripts/i18n-check.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = join(import.meta.dirname, '..');
const issues = [];

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_preview_14.1') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = await walk(root);
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const rel = file.slice(root.length + 1).replaceAll('\\', '/');
  if (extname(file) === '.html') {
    const trOnly = [...text.matchAll(/data-tr="([^"]*)"(?![^>]*data-de=)/g)];
    trOnly.forEach((m) => {
      if (/data-de-/.test(m.input.slice(Math.max(0, m.index - 40), m.index + 80))) return;
      const chunk = text.slice(m.index, m.index + 120);
      if (chunk.includes('data-de=') || chunk.includes('data-de-title') || chunk.includes('data-de-aria')) return;
      issues.push(`${rel}: data-tr without nearby data-de → "${m[1].slice(0, 60)}"`);
    });
  }
}

const i18nPath = join(root, 'js', 'i18n.js');
const i18n = await readFile(i18nPath, 'utf8');
const trKeys = new Set([...i18n.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
/* Rough: extract tr and de blocks by counting — prefer explicit */
const trBlock = i18n.match(/tr:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*de:\s*\{/);
const deBlock = i18n.match(/de:\s*\{([\s\S]*?)\n\s*\},\s*\n\};/);
function keysOf(block) {
  if (!block) return new Set();
  return new Set([...block[1].matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
}
const tr = keysOf(trBlock);
const de = keysOf(deBlock);
for (const k of tr) if (!de.has(k)) issues.push(`i18n: TR key missing in DE → ${k}`);
for (const k of de) if (!tr.has(k)) issues.push(`i18n: DE key missing in TR → ${k}`);

if (!issues.length) {
  console.log('i18n-check: OK');
  process.exit(0);
}
console.log(`i18n-check: ${issues.length} issue(s)`);
issues.slice(0, 80).forEach((line) => console.log(' -', line));
if (issues.length > 80) console.log(` ... +${issues.length - 80} more`);
process.exit(1);