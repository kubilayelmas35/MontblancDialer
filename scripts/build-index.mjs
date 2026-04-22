/**
 * Rebuilds root index.html from html/fragments and version.json.
 * Run from repo root: node scripts/build-index.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { version } = JSON.parse(await readFile(join(root, 'version.json'), 'utf8'));
const v = String(version || '0.0').trim();

const head = (await readFile(join(root, 'html/fragments/head.html'), 'utf8'))
  .replaceAll('__MB_VERSION__', v);
const bodyLogin = await readFile(join(root, 'html/fragments/body-login.html'), 'utf8');
const appShell = (await readFile(join(root, 'html/fragments/app-shell.html'), 'utf8'))
  .replaceAll('__MB_VERSION__', v);
const modals = await readFile(join(root, 'html/fragments/modals.html'), 'utf8');
const teamChat = await readFile(join(root, 'html/fragments/team-chat.html'), 'utf8');
const notif = await readFile(join(root, 'html/fragments/notification-center.html'), 'utf8');
const scriptTags = (await readFile(join(root, 'html/fragments/scripts.html'), 'utf8'))
  .replaceAll('__MB_VERSION__', v);

const out = [
  head,
  bodyLogin,
  appShell,
  modals,
  teamChat,
  notif,
  scriptTags,
  '</body>\n</html>\n',
].join('');

const versionJs = `// Auto-synced with version.json (see scripts/build-index.mjs)
window.MB_APP_VERSION = '${v}';
`;
await writeFile(join(root, 'index.html'), out, 'utf8');
await writeFile(join(root, 'js/version.js'), versionJs, 'utf8');
console.log(`index.html + js/version.js → v${v}`);
