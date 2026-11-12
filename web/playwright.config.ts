import { defineConfig } from '@playwright/test'
import { API_URL, FRONT_URL, apiData } from './e2e/env'

// The E2E suite runs its own two servers on dedicated ports (5292 API, 5293 frontend dev server),
// so it never touches a running development instance or the repository's real `data/` folder:
// globalSetup points the API at a throwaway SQLite database under test-results/e2e-data.
// Run with `npm run test:e2e`, view the HTML report with `npm run test:e2e:report`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/global-setup.ts',
  // The API is a single SQLite instance: one worker keeps runs deterministic.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONT_URL,
    // Failure evidence: screenshot and trace are kept only for failed tests.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Isolated API: every persistent path is redirected to the throwaway data directory.
      command: 'dotnet run --project ../api/TaskFlow.Api --no-launch-profile --urls http://localhost:5292',
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        // The frontend dev server runs on 5293, so the API's allowed-origin list must include it.
        Cors__Origins__0: FRONT_URL,
        // The whole suite registers/signs-in dozens of accounts in a minute from one IP, which would
        // trip the 20/min auth limiter; tests disable it the same way TaskFlow.Tests.ApiFactory does.
        RateLimit__AuthPerMinute: '1000000',
        ConnectionStrings__Default: `Data Source=${apiData('taskflow-e2e.db')}`,
        Backups__Directory: apiData('backups'),
        Attachments__Directory: apiData('attachments'),
        DataProtection__KeysDirectory: apiData('keys'),
      },
    },
    {
      // Vite dev server on its own port with VITE_API_ORIGIN aimed at the isolated API.
      command: 'npm run dev -- --port 5293 --strictPort',
      url: FRONT_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_ORIGIN: API_URL },
    },
  ],
})
