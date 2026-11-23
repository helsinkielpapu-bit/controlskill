// Flujos de extremo a extremo FL-01…FL-10 (documento maestro §6) en una instancia aislada.
// Las cifras esperadas salen de los valores de referencia (packages/engine/test/golden).
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { calcAlpha } from '../packages/engine/src/index.js';

const golden = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../packages/engine/test/golden/${f}.json`, import.meta.url)), 'utf8'));
const routes = golden('routes') as any[];
const G = (id: string) => routes.find(r => r.id === id)!.output.body;
const DEMO: number[] = routes.find(r => r.id === 'cap-demo-noids')!.input.rows.map((r: any) => r.value);
const sampling = golden('sampling');

test.describe.configure({ mode: 'serial' });
let page: Page;
const PASSWORD = 'e2e-clave-local-1';

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Acepta confirmaciones; en prompt() responde con el valor propuesto (como pulsar Aceptar sin escribir)
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
});

// El selector de proceso es un <select> dentro de <label class="field"><span>Proceso</span>…</label>
const pick = async (name: string) => { await page.locator('label.field:has(> span:text-is("Proceso")) select').selectOption({ label: name }); };

test('FL-01 · registro de empresa y panel vacío', async () => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Registrar empresa' }).click();
  await page.getByLabel('Empresa').fill('Planta de Pruebas');
  await page.getByLabel('Tu nombre').fill('Ingeniera de Calidad');
  await page.getByLabel('Email').fill('e2e@controlskill.test');
  await page.getByLabel('Contraseña').fill('corta');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeVisible();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Panel de procesos' })).toBeVisible();
  await expect(page.getByText('Sin procesos definidos')).toBeVisible();
});

test('RF-102 · alta de proceso con validación y tipo de carta (DA-05)', async () => {
  await page.goto('/fase-1/procesos?nuevo=1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del proceso *').fill('Llenado de envases');
  await dialog.getByLabel('Unidad de medida').fill('ml');
  await dialog.getByLabel('Valor nominal').fill('500');
  await dialog.getByLabel('LSI · límite inferior').fill('505');
  await dialog.getByLabel('LSE · límite superior').fill('495');
  await page.getByRole('button', { name: 'Guardar proceso' }).click();
  await expect(dialog.getByText('LSI debe ser menor que LSE.')).toBeVisible();
  await dialog.getByLabel('LSI · límite inferior').fill('495');
  await dialog.getByLabel('LSE · límite superior').fill('505');
  await dialog.getByLabel('Tipo de carta').selectOption('xbar_r');
  await dialog.getByLabel('n · tamaño de subgrupo').fill('5');
  await page.getByRole('button', { name: 'Guardar proceso' }).click();
  await expect(page.getByText('Proceso creado correctamente.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Llenado de envases · ml' })).toBeVisible();
  await expect(page.getByText('X̄-R', { exact: true }).first()).toBeVisible();
});

test('FL-03 · importar Excel (formato A), vista previa y guardado (DA-03, DA-07)', async () => {
  await page.goto('/fase-1/entrada');
  await pick('Llenado de envases (ml) · X̄-R');
  const rows = [['x1', 'x2', 'x3', 'x4', 'x5'], ...Array.from({ length: 12 }, (_, g) => DEMO.slice(g * 5, g * 5 + 5))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Datos');
  const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await page.locator('input[type=file]').setInputFiles({ name: 'demo.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await expect(page.getByText(/Se importaron/)).toContainText('12 subgrupos');
  const cc = G('cc-demo-xbar_r');
  const preview = page.getByLabel('Vista previa de la carta');
  await expect(preview).toContainText(cc.chartData.xbar.ucl.toFixed(4));
  await expect(preview).toContainText(cc.chartData.xbar.lcl.toFixed(4));
  await expect(preview).toContainText(cc.chartData.r.cl.toFixed(4));
  await page.getByRole('button', { name: 'Guardar en el proceso' }).click();
  await expect(page.getByText(/60.*mediciones guardadas en.*12.*subgrupos \(SG 1–12\)/)).toBeVisible();
});

test('FL-02 · carta de control igual a la referencia', async () => {
  await page.goto('/fase-1/cartas');
  const cc = G('cc-demo-xbar_r');
  const chart = page.getByRole('img', { name: /Carta Medias/ });
  await expect(chart).toHaveAttribute('aria-label', new RegExp(`LC ${cc.chartData.xbar.cl}, LCS ${cc.chartData.xbar.ucl}, LCI ${cc.chartData.xbar.lcl}. ${cc.outOfControl.length} puntos`));
  if (cc.violations.length === 0) await expect(page.getByText('Proceso bajo control estadístico')).toBeVisible();
  const tests = G('tests-demo');
  await expect(page.getByText(String(tests.normality.statistic)).first()).toBeVisible();
  // Simulación secuencial n = 4 (mismos límites que la referencia)
  await page.getByLabel('Simular de forma secuencial').check();
  await page.getByLabel('Tamaño n simulado').selectOption('4');
  const sim = G('cc-demo-sim4-xbar_r');
  await expect(page.getByRole('img', { name: /Carta Medias/ })).toHaveAttribute('aria-label', new RegExp(`LCS ${sim.chartData.xbar.ucl},`));
});

test('FL-02 · capacidad y panel con el mismo Cpk (DA-09)', async () => {
  const cap = G('cap-demo-ids').capability;
  await page.goto('/capacidad');
  await expect(page.getByText('Proceso capaz · Cpk ≥ 1.33')).toBeVisible();
  for (const v of [cap.cp, cap.cpk, cap.cpu, cap.cpl]) await expect(page.getByText(v.toFixed(3), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(cap.xbar.toFixed(4), { exact: true }).first()).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.fcf').first()).toContainText(cap.cpk.toFixed(3));
  await expect(page.getByText('Capaz', { exact: true }).first()).toBeVisible();
});

test('FL-05 · monitoreo Fase II: agregar, señal y deshacer (DA-08)', async () => {
  await page.goto('/fase-2/monitoreo');
  await page.getByRole('button', { name: 'Iniciar monitoreo' }).click();
  await expect(page.getByText('Límites de Fase I listos')).toBeVisible();
  // DA-27: el primer monitoreo congela los límites de Fase I y lo indica
  await expect(page.getByRole('note')).toContainText('Límites de Fase I congelados el');
  await expect(page.getByRole('note')).toContainText('(al iniciar este primer monitoreo)');
  await expect(page.getByRole('button', { name: 'Recalcular límites de Fase I' })).toBeVisible();
  await expect(page.locator('#mon-x0')).toBeFocused(); // el inicio termina enfocando la primera casilla
  // DA-18: también en modo Industrial la carta muestra la Fase I como referencia antes del primer ingreso
  await expect(page.getByRole('button', { name: 'Industrial' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('figure').filter({ hasText: 'Carta de monitoreo' }).getByText('Inicio del monitoreo')).toBeVisible();
  await expect(page.locator('figure').filter({ hasText: 'Carta de monitoreo' }).getByText('F1-1', { exact: true })).toBeVisible();
  await expect(page.locator('.figure', { hasText: 'LC de Fase I' })).toContainText('F1: 12 SG');
  const values = ['501.9', '502.1', '502.0', '501.8', '502.2']; // fuera del LCS de Fase I
  for (let i = 0; i < 5; i++) await page.locator(`#mon-x${i}`).fill(values[i]!);
  await expect(page.locator('#mon-x4')).toHaveValue(values[4]!);
  await page.getByRole('button', { name: 'Agregar subgrupo' }).click();
  await expect(page.getByText(/Proceso fuera de control/)).toBeVisible();
  await expect(page.getByText(/Punto 1 fuera de los límites de control estadístico/)).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer último' }).click();
  await expect(page.getByText('Sin datos de monitoreo aún.')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.locator(`#mon-x${i}`).fill(['500.8', '500.9', '501.0', '500.7', '500.6'][i]!);
  await page.getByRole('button', { name: 'Agregar subgrupo' }).click();
  await expect(page.getByText(/Proceso estable · 1 subgrupos sin señales/)).toBeVisible();
});

test('FL-06 · evaluación del desempeño con Fase II de la base de datos (DA-11, DA-17)', async () => {
  await page.goto('/fase-2/desempeno');
  await expect(page.getByText('Monitoreo Fase II con datos reales')).toBeVisible();
  await expect(page.getByText('Subgrupos en monitoreo')).toBeVisible();
  const arl0 = (1 / calcAlpha(3)).toLocaleString('es', { maximumFractionDigits: 1 });
  await expect(page.getByText(arl0, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Guardar evaluación' }).click();
  await expect(page.getByText('Evaluación y parámetros guardados.')).toBeVisible();
});

test('FL-08 · muestreo automático igual a la referencia y NAC = 0 manual (DA-04)', async () => {
  await page.goto('/muestreo');
  const d0 = sampling.designs[0];
  const figures = page.locator('.figures').first();
  await expect(figures).toContainText(`n — tamaño de muestra${d0.plan.n}`);
  await expect(figures).toContainText(`NAC — aceptación${d0.plan.c}`);
  await page.getByRole('button', { name: 'Plan manual' }).click();
  await page.getByLabel('NAC — número de aceptación (c)').fill('0');
  await expect(page.locator('.figures').first()).toContainText('NCR — rechazo1');
  await expect(page.getByText(/NAC = 0 \(plan de cero defectos\)/)).toBeVisible();
});

test('FL-07 · informe con Fase II y descarga en PDF', async () => {
  await page.goto('/informes');
  await expect(page.getByRole('heading', { name: 'Informe de análisis estadístico' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evaluación integral' })).toBeVisible();
  await expect(page.getByText('Evaluación de desempeño guardada')).toBeVisible();
  await expect(page.getByText(/La sesión de monitoreo registró/)).toContainText('1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/^SPC_Llenado_de_envases_\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('FL-10 · historial: filtrar y borrar', async () => {
  await page.goto('/datos?phase=2');
  await expect(page.getByRole('heading', { name: '5 mediciones de Fase 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar Fase 2 de este proceso' }).click();
  await expect(page.getByText('5 mediciones de Fase 2 eliminadas.')).toBeVisible();
  await page.getByRole('button', { name: 'Fase 1' }).click();
  await expect(page.getByRole('heading', { name: '60 mediciones de Fase 1' })).toBeVisible();
});

test('FL-09 · administración: usuarios y datos de demostración', async () => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill('Analista Uno');
  await dialog.getByLabel('Email').fill('analista@controlskill.test');
  await dialog.getByLabel('Contraseña inicial').fill('analista-clave-1');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByText('Usuario "Analista Uno" creado correctamente.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'analista@controlskill.test' })).toBeVisible();
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click();
  await expect(page.getByText(/Proceso de demostración creado con 60 mediciones/)).toBeVisible();
});

// ── Atributos, formato B, monitoreo y procesos ──────────────

const xlsx = (name: string, rows: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Datos');
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })) };
};

test('RF-203 · Excel en formato B (una columna) agrupa con el n pedido', async () => {
  await page.goto('/fase-1/entrada');
  await pick('Llenado de envases (ml) · X̄-R');
  // 62 observaciones en una columna: con n = 5 se forman 12 subgrupos y las 2 sobrantes se descartan
  const rows = [['valor'], ...DEMO.map(v => [v]), [499.9], [500.1]];
  await page.locator('input[type=file]').setInputFiles(xlsx('columna.xlsx', rows));
  await expect(page.getByText(/Se importaron/)).toContainText('12 subgrupos con n = 5');
  const cc = G('cc-demo-xbar_r');
  const preview = page.getByLabel('Vista previa de la carta');
  await expect(preview).toContainText(cc.chartData.xbar.ucl.toFixed(4));
  await expect(preview).toContainText(cc.chartData.xbar.lcl.toFixed(4));
  await expect(preview).toContainText(cc.chartData.r.cl.toFixed(4));
  await expect(page.getByRole('textbox', { name: 'Subgrupo 13, X1' })).toHaveValue('');
});

test('RF-205 · entrada de atributos (carta p con n variable, DA-16)', async () => {
  const golden = routes.find(r => r.id === 'cc-p-var')!;
  const data = golden.input.rows as { value: number; sample_size: number }[];
  const cc = golden.output.body;
  await page.goto('/fase-1/procesos?nuevo=1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del proceso *').fill('Inspección de etiquetas');
  await dialog.getByLabel('Tipo de carta').selectOption('p');
  await page.getByRole('button', { name: 'Guardar proceso' }).click();
  await expect(page.getByText('Proceso creado correctamente.')).toBeVisible();

  await page.goto('/fase-1/entrada');
  await pick('Inspección de etiquetas · Carta p');
  await expect(page.getByRole('button', { name: 'Atributos (p, np, c, u)' })).toHaveAttribute('aria-pressed', 'true');
  for (const [i, r] of data.entries()) {
    await page.getByLabel(`Subgrupo ${i + 1}, n`, { exact: true }).fill(String(r.sample_size));
    await page.getByLabel(`Subgrupo ${i + 1}, conteo`).fill(String(r.value));
  }
  const preview = page.getByLabel('Vista previa de la carta de atributos');
  await expect(preview).toContainText(cc.chartData.p.cl.toFixed(4));
  await expect(preview).toContainText(`${cc.outOfControl.length} señal fuera de control`);
  await expect(preview).toContainText('cada subgrupo se evalúa contra sus propios límites');
  await page.getByRole('button', { name: 'Guardar en el proceso' }).click();
  await expect(page.getByText(new RegExp(`${data.length}.*registros guardados en.*${data.length}.*subgrupos`))).toBeVisible();

  await page.goto('/fase-1/cartas');
  await expect(page.getByRole('img', { name: /Carta Proporción de no conformes/ }))
    .toHaveAttribute('aria-label', new RegExp(`LC ${cc.chartData.p.cl}, LCS ${cc.chartData.p.ucl}, LCI ${cc.chartData.p.lcl}. ${cc.outOfControl.length} puntos`));
});

test('RF-607 · Monitoreo: Excel de atributos y sesiones guardadas (DA-17)', async () => {
  await page.goto('/fase-2/monitoreo');
  await pick('Inspección de etiquetas · Carta p');
  await page.getByRole('button', { name: 'Industrial' }).click();
  await page.getByRole('button', { name: /Iniciar monitoreo|Reiniciar monitoreo/ }).click();
  await expect(page.getByText('Límites de Fase I listos')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(xlsx('fase2.xlsx', [['defectuosos', 'n'], [3, 100], [5, 120], [2, 100]]));
  await expect(page.getByText('3 subgrupos agregados.')).toBeVisible();
  await expect(page.getByText(/Proceso estable · 3 subgrupos sin señales/)).toBeVisible();

  await page.getByRole('button', { name: 'Sesiones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sesiones de monitoreo' });
  await dialog.getByLabel('Guardar la sesión actual como').fill('Turno mañana');
  await dialog.getByRole('button', { name: 'Guardar sesión' }).click();
  await expect(dialog.getByText('Turno mañana')).toBeVisible();
  await expect(dialog.getByText(/Inspección de etiquetas · Carta p · 3 subgrupos/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText(/Se cargaron 3 subgrupos de monitoreo guardados/)).toBeVisible();

  await page.getByRole('button', { name: 'Sesiones' }).click();
  await dialog.getByRole('button', { name: 'Eliminar sesión' }).click();
  await expect(dialog.getByText('No hay sesiones guardadas')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('RF-604 · modo Académico: n en vivo con límites de agrupación secuencial', async () => {
  await page.goto('/fase-2/monitoreo');
  await pick('Llenado de envases (ml) · X̄-R');
  await expect(page.locator('label.field:has(> span:text-is("Carta")) select')).toHaveValue('xbar_r'); // la carta sigue al proceso elegido
  await page.getByRole('button', { name: 'Académico' }).click();
  await page.getByRole('button', { name: /Iniciar monitoreo|Reiniciar monitoreo/ }).click();
  await expect(page.getByText('Límites de Fase I listos')).toBeVisible();
  const phase1 = page.locator('.figure', { hasText: 'LC de Fase I' });
  const base = G('cc-demo-xbar_r').chartData.xbar;
  await expect(phase1).toContainText(`LCS ${base.ucl.toFixed(4)}`);
  await expect(phase1).toContainText('F1: 12 SG');
  await page.getByRole('button', { name: 'Aumentar n' }).click();
  const sim6 = G('cc-demo-sim6-xbar_r').chartData.xbar;
  await expect(phase1).toContainText(`LCS ${sim6.ucl.toFixed(4)}`);
  await expect(phase1).toContainText(`F1: ${sim6.points.length} SG`);
  await expect(page.locator('#mon-x5')).toBeVisible();
  await page.getByRole('button', { name: 'Reducir n' }).click();
  await expect(phase1).toContainText(`LCS ${base.ucl.toFixed(4)}`);
  await page.getByRole('button', { name: 'Industrial' }).click();
  // Una carta que no corresponde a los datos (p sin tamaños de muestra) no rompe la pantalla: se explica
  await page.locator('label.field:has(> span:text-is("Carta")) select').selectOption('p');
  await page.getByRole('button', { name: /Iniciar monitoreo|Reiniciar monitoreo/ }).click();
  await expect(page.getByText('No se pueden calcular los límites de Fase I con Carta p para este proceso. Elige la carta que corresponde a sus datos (configurada: X̄-R).')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Monitoreo en tiempo real' })).toBeVisible();
});

test('RF-104 · eliminar un proceso borra también sus datos', async () => {
  await page.goto('/fase-1/procesos');
  const row = page.getByRole('row', { name: /Inspección de etiquetas/ });
  await expect(row.getByRole('cell').filter({ hasText: /^23$/ })).toBeVisible(); // 20 de Fase I + 3 de Fase II
  let asked = '';
  page.once('dialog', d => { asked = d.message(); });
  await page.getByRole('button', { name: 'Eliminar Inspección de etiquetas' }).click();
  await expect(page.getByText('Proceso "Inspección de etiquetas" eliminado junto con sus datos.')).toBeVisible();
  expect(asked).toContain('sus 23 mediciones (Fase I y Fase II)');
  await expect(page.getByRole('row', { name: /Inspección de etiquetas/ })).toHaveCount(0);
  await page.goto('/fase-2/monitoreo');
  await expect(page.locator('label.field:has(> span:text-is("Proceso")) select option', { hasText: 'Inspección de etiquetas' })).toHaveCount(0);
});

test('RF-010 · cerrar sesión e iniciar de nuevo', async () => {
  await page.getByRole('button', { name: /Menú de/ }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await page.getByLabel('Email').fill('e2e@controlskill.test');
  await page.getByLabel('Contraseña').fill('incorrecta-123');
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByText('Credenciales incorrectas.')).toBeVisible();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByRole('heading', { name: 'Panel de procesos' })).toBeVisible();
});
