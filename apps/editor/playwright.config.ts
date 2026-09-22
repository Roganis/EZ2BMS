import { defineConfig, devices } from '@playwright/test';

// UI tests run against the production build served by `vite preview`, with the
// in-browser mock backend (no Tauri, no audio device). In this repo's cloud
// container Chromium is preinstalled under PLAYWRIGHT_BROWSERS_PATH; if the
// pinned Playwright expects a different revision, point PW_CHROMIUM at a binary.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
