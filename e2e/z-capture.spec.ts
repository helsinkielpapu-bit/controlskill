// Capturas para la revisión final de diseño (no es una prueba funcional).
// Uso: npx playwright test capture.spec.ts -c playwright.config.ts  (después de flows.spec.ts, misma base de pruebas)
import { test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../.impeccable/review/', import.meta.url));
const pages: [string, string][] = [['panel', '/'], ['capacidad', '/capacidad'], ['cartas', '/fase-1/cartas'], ['monitoreo', '/fase-2/monitoreo'], ['entrada', '/fase-1/entrada'], ['informe', '/informes']];

test('capturas', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [w, h, suffix] of [[1440, 900, 'desktop'], [390, 844, 'mobile']] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript(() => { const s = document.createElement('style'); s.textContent = '*{animation:none!important;transition:none!important}'; document.documentElement.appendChild(s); });
    await page.goto('/');
    await page.getByLabel('Email').fill('e2e@controlskill.test');
    await page.getByLabel('Contraseña').fill('e2e-clave-local-1');
    await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
    await page.getByRole('heading', { name: 'Panel de procesos' }).waitFor();
    const procs = await page.evaluate(() => fetch('/api/processes').then(r => r.json()));
    const pid = procs.find((p: { name: string }) => p.name === 'Llenado de envases').id;
    for (const [name, url] of pages) {
      await page.goto(url === '/' ? url : `${url}?process_id=${pid}`);
      await page.waitForTimeout(1200);
      if (name === 'monitoreo') { await page.getByRole('button', { name: /Iniciar monitoreo|Reiniciar/ }).click(); await page.waitForTimeout(1200); }
      await page.screenshot({ path: `${out}${name === 'panel' ? '' : name + '-'}${suffix}.png`, fullPage: name === 'panel' ? false : true });
    }
    await ctx.close();
  }
  void readFileSync; void readdirSync;
});
