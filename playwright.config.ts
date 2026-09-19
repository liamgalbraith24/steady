import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
