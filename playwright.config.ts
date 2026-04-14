import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  webServer: {
    command: 'npx http-server . -p 5500 -c-1',
    url: 'http://127.0.0.1:5500',
    reuseExistingServer: true,
    timeout: 30_000
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5500',
    trace: 'on-first-retry'
  }
});
