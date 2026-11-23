// Pruebas de extremo a extremo (documento maestro §8.3). Instancia aislada:
// API en 4101 contra la base controlskill_test y web en 5174. Navegador: Microsoft Edge instalado.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'es-MX',
    acceptDownloads: true
  },
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: '../apps/api',
      url: 'http://127.0.0.1:4101/health',
      env: { NODE_ENV: 'test', API_PORT: '4101', WEB_ORIGIN: 'http://127.0.0.1:5174' },
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: 'npx vite --host 127.0.0.1',
      cwd: '../apps/web',
      url: 'http://127.0.0.1:5174',
      env: { WEB_PORT: '5174', API_TARGET: 'http://127.0.0.1:4101' },
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
});
