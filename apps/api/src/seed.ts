// Datos de demostración locales (npm run seed -w @controlskill/api).
// Crea la empresa y el usuario de prueba definidos en .env (DEMO_EMAIL / DEMO_PASSWORD) y procesos de ejemplo.
// «Llenado de envases» usa el conjunto de demostración de 60 valores (12 subgrupos de 5); el resto son datos sintéticos.
import bcrypt from 'bcryptjs';
import { pool, transaction } from './db.js';
import { migrate } from './migrate.js';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normals(seed: number, count: number, mu: number, sigma: number, decimals: number) {
  const r = rng(seed), out: number[] = [];
  while (out.length < count) { const z = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); out.push(Number((mu + sigma * z).toFixed(decimals))); }
  return out;
}
const DEMO = [499.2,501.3,500.8,499.7,500.1,501.5,499.8,500.3,501.1,499.5,500.7,501.2,499.3,500.9,501.4,499.6,500.4,501.0,499.9,500.5,
  501.3,499.4,500.6,501.1,499.8,500.2,500.7,499.5,501.4,500.0,500.3,499.7,501.0,500.5,499.9,501.2,500.1,499.6,500.8,501.5,
  499.4,500.9,501.3,499.8,500.4,501.1,499.2,500.6,501.0,500.3,499.7,500.8,501.4,499.5,500.2,501.3,499.9,500.7,501.1,499.3];

// --if-missing (usado al arrancar en el servidor): solo crea la demostración si aún no existe,
// para no borrar lo que se haya hecho con la cuenta demo en cada reinicio.
const ifMissing = process.argv.includes('--if-missing');
const email = (process.env.DEMO_EMAIL ?? '').toLowerCase();
const password = process.env.DEMO_PASSWORD ?? '';
if (!email || password.length < 8) {
  if (ifMissing) { console.log('Sin DEMO_EMAIL/DEMO_PASSWORD: no se cargan datos de demostración.'); await pool.end(); process.exit(0); }
  console.error('Define DEMO_EMAIL y DEMO_PASSWORD (≥ 8) en .env'); process.exit(1);
}

await migrate(() => {});
if (ifMissing && (await pool.query('SELECT 1 FROM companies WHERE email = $1', [email])).rowCount) {
  console.log(`La demostración para ${email} ya existe.`);
  await pool.end();
  process.exit(0);
}
await transaction(async c => {
  await c.query('DELETE FROM companies WHERE email = $1', [email]);
  const company = (await c.query(`INSERT INTO companies (name, email, subscription_status) VALUES ('Envases del Norte (demo)', $1, 'inactive') RETURNING id`, [email])).rows[0].id;
  const user = (await c.query(`INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, 'Usuario Demo', $2, $3, 'admin') RETURNING id`, [company, email, await bcrypt.hash(password, 12)])).rows[0].id;

  const proc = async (p: Record<string, unknown>) => (await c.query(
    `INSERT INTO processes (company_id, name, description, unit, usl, lsl, nominal, chart_type, n_size, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() - ($11 || ' minutes')::interval) RETURNING id`,
    [company, p.name, p.description ?? null, p.unit ?? null, p.usl ?? null, p.lsl ?? null, p.nominal ?? null, p.chart_type ?? 'xbar_r', p.n_size ?? null, user, String(p.age)]
  )).rows[0].id as string;
  const add = async (pid: string, rows: { value: number; subgroup_id: number; sample_size?: number; phase?: number }[]) => {
    for (const r of rows) await c.query(
      'INSERT INTO measurements (process_id, company_id, value, subgroup_id, sample_size, phase, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [pid, company, r.value, r.subgroup_id, r.sample_size ?? null, r.phase ?? 1, user]
    );
  };
  const bySubgroup = (values: number[], n: number, phase = 1) => values.map((value, i) => ({ value, subgroup_id: Math.floor(i / n) + 1, phase }));

  const fill = await proc({ name: 'Llenado de envases', description: 'Volumen de llenado de botellas (datos de demostración).', unit: 'ml', usl: 505, lsl: 495, nominal: 500, n_size: 5, age: 10 });
  await add(fill, bySubgroup(DEMO, 5));
  await add(fill, bySubgroup(normals(7, 40, 500.9, 0.9, 1), 5, 2));
  const paint = await proc({ name: 'Espesor de pintura (ejemplo)', unit: 'µm', usl: 90, lsl: 60, nominal: 75, n_size: 5, age: 8 });
  await add(paint, bySubgroup(normals(3, 150, 76.2, 3.1, 1), 5));
  const ax = await proc({ name: 'Diámetro de eje Ø25 (ejemplo)', unit: 'mm', usl: 25.10, lsl: 24.90, nominal: 25.00, chart_type: 'xbar_s', n_size: 5, age: 6 });
  await add(ax, bySubgroup(normals(5, 100, 25.03, 0.02, 3), 5));
  await proc({ name: 'Peso de bolsa (ejemplo)', unit: 'g', usl: 512, lsl: 498, nominal: 505, age: 5 });
  const asm = await proc({ name: 'Ensamble línea 3 (ejemplo)', description: 'Unidades defectuosas por lote inspeccionado.', chart_type: 'p', age: 4 });
  const sizes = [100,120,100,90,110,100,95,100,130,100,100,120,80,100,100,100,105,100,90,100];
  const defects = [3,5,2,4,6,1,3,2,5,4,3,7,2,3,4,12,3,2,4,3];
  await add(asm, defects.map((value, i) => ({ value, subgroup_id: i + 1, sample_size: sizes[i]! })));
  const torque = await proc({ name: 'Torque de tapa (ejemplo)', unit: 'N·m', usl: 2.60, lsl: 1.80, nominal: 2.20, n_size: 5, age: 2 });
  await add(torque, bySubgroup(normals(9, 125, 2.32, 0.11, 3), 5));
});
console.log(`Datos de demostración listos para ${email}.`);
await pool.end();
