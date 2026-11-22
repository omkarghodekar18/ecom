// Playwright config (spec Section 21 e2e): runs against a running dev stack.
// `npm run e2e` from frontend/ reuses localhost:3000 when it is already up
// (the sandbox keeps backend:4000 + frontend:3000 running) and boots both
// otherwise.
import { defineConfig, devices } from '@playwright/test';

const BACKEND_URL = 'http://localhost:4000';
const FRONTEND_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // suites share one seeded catalog + cart cookies
  reporter: [['list']],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'cd ../backend && npm run dev',
      url: `${BACKEND_URL}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
