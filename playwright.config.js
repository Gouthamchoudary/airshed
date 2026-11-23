import { defineConfig } from '@playwright/test';

const localURL = 'http://127.0.0.1:4187';
const deployedURL = process.env.AIRSHED_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  workers: 2,
  use: {
    baseURL: deployedURL || localURL,
    channel: process.env.AIRSHED_BROWSER_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: deployedURL
    ? undefined
    : {
        command: 'python -m http.server 4187 --bind 127.0.0.1',
        url: localURL,
        reuseExistingServer: !process.env.CI,
      },
});
