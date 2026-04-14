import { readFile } from 'node:fs/promises';

const checks = [
  { file: 'js/auth.js', includes: ['bootApp', 'refreshUserPagePerms'] },
  { file: 'js/agents.js', includes: ['saveNewAgent', 'saveAgentEdit'] },
  { file: 'js/dialer.js', includes: ['refreshDialerHealthPanel', 'checkCallAllowed'] },
  { file: 'js/field.js', includes: ['loadFieldPage', 'renderFieldKpi', 'saveFieldTaskUpdate'] },
  { file: 'js/notification-center.js', includes: ['loadNotificationCenter'] },
  { file: 'js/feature-flags.js', includes: ['loadFeatureFlagsPage', 'applyFeatureFlagsOnBoot'] }
];

let failed = 0;
for (const c of checks) {
  const content = await readFile(c.file, 'utf8');
  for (const token of c.includes) {
    if (!content.includes(token)) {
      console.error(`FAIL ${c.file} missing "${token}"`);
      failed++;
    } else {
      console.log(`OK   ${c.file} has "${token}"`);
    }
  }
}

if (failed > 0) {
  console.error(`\nSmoke failed: ${failed} missing token(s).`);
  process.exit(1);
}

console.log('\nSmoke passed.');
