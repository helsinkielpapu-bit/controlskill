// Pruebas de integración de la API contra PostgreSQL local (base controlskill_test).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { buildApp } = await import('../src/app.js');

const routes = JSON.parse(readFileSync(fileURLToPath(new URL('../../../packages/engine/test/golden/routes.json', import.meta.url)), 'utf8')) as any[];
const golden = (id: string) => routes.find(r => r.id === id)!.output.body;
const DEMO: number[] = routes.find(r => r.id === 'cap-demo-noids')!.input.rows.map((r: any) => r.value);

let app: FastifyInstance;
type Session = { cookie: string };
const call = async (s: Session | null, method: string, url: string, payload?: unknown): Promise<LightMyRequestResponse> =>
  app.inject({ method: method as any, url: `/api${url}`, payload: payload as any, headers: s ? { cookie: s.cookie } : {} });
const json = (r: LightMyRequestResponse) => r.json();
const sessionOf = (r: LightMyRequestResponse): Session => {
  const c = r.cookies.find(c => c.name === 'cs_session')!;
  return { cookie: `cs_session=${c.value}` };
};
async function register(company: string, email: string): Promise<Session> {
  const r = await call(null, 'POST', '/auth/register', { company_name: company, name: 'Ana Pérez', email, password: 'clave-segura-1' });
  expect(r.statusCode).toBe(201);
  return sessionOf(r);
}

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(() => {});
  app = await buildApp();
});
afterAll(async () => { await app.close(); await pool.end(); });

describe('autenticación (RF-001…RF-010)', () => {
  it('registro crea empresa inactiva y usuario admin; cookie httpOnly', async () => {
    const r = await call(null, 'POST', '/auth/register', { company_name: 'Envases del Norte', name: 'Ana', email: 'Ana@Ejemplo.test', password: 'clave-segura-1' });
    expect(r.statusCode).toBe(201);
    expect(json(r).user.role).toBe('admin');
    expect(json(r).user.email).toBe('ana@ejemplo.test');
    expect(json(r).company.subscription_status).toBe('inactive');
    const c = r.cookies.find(c => c.name === 'cs_session')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Strict');
    expect(c.maxAge).toBe(7 * 24 * 3600);
  });
  it('mensajes de validación literales', async () => {
    expect(json(await call(null, 'POST', '/auth/register', { company_name: 'X', name: 'Y', email: 'z@z.test' })).error).toBe('Todos los campos son obligatorios.');
    expect(json(await call(null, 'POST', '/auth/register', { company_name: 'X', name: 'Y', email: 'z@z.test', password: 'corta' })).error).toBe('La contraseña debe tener al menos 8 caracteres.');
    const dup = await call(null, 'POST', '/auth/register', { company_name: 'X', name: 'Y', email: 'ana@ejemplo.test', password: 'clave-segura-1' });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error).toBe('El email ya está registrado.');
    expect(json(await call(null, 'POST', '/auth/login', { email: '' })).error).toBe('Email y contraseña son requeridos.');
    const bad = await call(null, 'POST', '/auth/login', { email: 'ana@ejemplo.test', password: 'incorrecta-1' });
    expect(bad.statusCode).toBe(401);
    expect(json(bad).error).toBe('Credenciales incorrectas.');
  });
  it('login y /me; sin sesión → 401', async () => {
    const r = await call(null, 'POST', '/auth/login', { email: 'ANA@ejemplo.test', password: 'clave-segura-1' });
    expect(r.statusCode).toBe(200);
    const me = json(await call(sessionOf(r), 'GET', '/auth/me'));
    expect(me.company.name).toBe('Envases del Norte');
    const anon = await call(null, 'GET', '/processes');
    expect(anon.statusCode).toBe(401);
    expect(json(anon).error).toBe('Token de autenticación requerido.');
    expect(json(await call({ cookie: 'cs_session=basura' }, 'GET', '/processes')).error).toBe('Token inválido o expirado.');
  });
  it('DA-20: cerrar sesión revoca el token aunque alguien lo haya copiado', async () => {
    const s = sessionOf(await call(null, 'POST', '/auth/login', { email: 'ana@ejemplo.test', password: 'clave-segura-1' }));
    const otra = sessionOf(await call(null, 'POST', '/auth/login', { email: 'ana@ejemplo.test', password: 'clave-segura-1' }));
    expect((await call(s, 'GET', '/auth/me')).statusCode).toBe(200);
    await call(s, 'POST', '/auth/logout');
    const reuse = await call(s, 'GET', '/auth/me');
    expect(reuse.statusCode).toBe(401);
    expect(json(reuse).error).toBe('Sesión no válida. Inicia sesión de nuevo.');
    expect((await call(otra, 'GET', '/auth/me')).statusCode).toBe(401); // se cierran todas las sesiones de ese usuario
    expect((await call(null, 'POST', '/auth/login', { email: 'ana@ejemplo.test', password: 'clave-segura-1' })).statusCode).toBe(200);
  });
  it('DA-20: un usuario eliminado pierde el acceso y el rol se lee de la base', async () => {
    const admin = await register('Sesiones SA', 'jefa-sesiones@ejemplo.test');
    const inv = json(await call(admin, 'POST', '/users/invite', { name: 'Temporal', email: 'temporal@ejemplo.test', password: 'clave-segura-3' }));
    const temp = sessionOf(await call(null, 'POST', '/auth/login', { email: 'temporal@ejemplo.test', password: 'clave-segura-3' }));
    expect((await call(temp, 'GET', '/processes')).statusCode).toBe(200);
    await call(admin, 'DELETE', `/users/${inv.id}`);
    const gone = await call(temp, 'GET', '/processes');
    expect(gone.statusCode).toBe(401);
    expect(json(gone).error).toBe('Sesión no válida. Inicia sesión de nuevo.');
    // Rol degradado en la base: el token firmado como admin ya no da permisos de admin
    const me = json(await call(admin, 'GET', '/auth/me')).user.id;
    await pool.query(`UPDATE users SET role = 'analyst' WHERE id = $1`, [me]);
    expect((await call(admin, 'GET', '/users')).statusCode).toBe(403);
    await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [me]);
  });
});

describe('procesos (RF-101…RF-104, DA-02, DA-05)', () => {
  let s: Session;
  beforeAll(async () => { s = await register('Planta Sur', 'proc@ejemplo.test'); });

  it('crea con tipo de carta y n; acepta 0 como límite', async () => {
    const r = await call(s, 'POST', '/processes', { name: 'Desviación', description: 'Centrado en cero', unit: 'mm', lsl: -0.5, nominal: 0, usl: 0.5, chart_type: 'xbar_s', n_size: 4 });
    expect(r.statusCode).toBe(201);
    const p = json(r);
    expect(p).toMatchObject({ nominal: 0, lsl: -0.5, usl: 0.5, chart_type: 'xbar_s', n_size: 4, created_by_name: 'Ana Pérez' });
    const zero = json(await call(s, 'POST', '/processes', { name: 'Cero', lsl: 0, usl: 10 }));
    expect(zero.lsl).toBe(0);
    expect(zero.chart_type).toBe('xbar_r');
  });
  it('edición parcial conserva descripción, carta y n (DA-02)', async () => {
    const p = json(await call(s, 'POST', '/processes', { name: 'Parcial', description: 'No borrar', unit: 'g', lsl: 1, usl: 2, chart_type: 'np', n_size: 50 }));
    const u = json(await call(s, 'PATCH', `/processes/${p.id}`, { lsl: 0, usl: 3, nominal: 1.5, unit: 'kg' }));
    expect(u).toMatchObject({ description: 'No borrar', chart_type: 'np', n_size: 50, lsl: 0, usl: 3, nominal: 1.5, unit: 'kg' });
  });
  it('validaciones', async () => {
    expect(json(await call(s, 'POST', '/processes', { name: '' })).error).toBe('El nombre del proceso es obligatorio.');
    expect(json(await call(s, 'POST', '/processes', { name: 'X', lsl: 5, usl: 5 })).error).toBe('LSI debe ser menor que LSE.');
    expect(json(await call(s, 'POST', '/processes', { name: 'X', chart_type: 'xbar_r', n_size: 12 })).error).toBe('n debe ser un entero entre 2 y 10.');
    expect(json(await call(s, 'POST', '/processes', { name: 'X', chart_type: 'p', n_size: 1 })).error).toBe('n debe ser un entero ≥ 2.');
  });
  it('aislamiento entre empresas', async () => {
    const other = await register('Competidor', 'otro@ejemplo.test');
    const p = json(await call(s, 'POST', '/processes', { name: 'Privado' }));
    const r = await call(other, 'GET', `/processes/${p.id}`);
    expect(r.statusCode).toBe(404);
    expect(json(r).error).toBe('Proceso no encontrado.');
    expect(json(await call(other, 'GET', '/processes'))).toHaveLength(0);
  });
});

describe('flujo Fase I con los datos de demostración (FL-02)', () => {
  let s: Session, pid: string;
  beforeAll(async () => {
    s = await register('Demo', 'demo@ejemplo.test');
    pid = json(await call(s, 'POST', '/processes', { name: 'Llenado de envases', unit: 'ml', lsl: 495, nominal: 500, usl: 505 })).id;
    const items = DEMO.map((v, i) => ({ process_id: pid, value: v, subgroup_id: Math.floor(i / 5) + 1 }));
    const r = await call(s, 'POST', '/measurements', items);
    expect(json(r).inserted).toBe(60);
  });

  it('capacidad igual a los valores de referencia', async () => {
    expect(json(await call(s, 'GET', `/analysis/capability?process_id=${pid}`)).capability).toEqual(golden('cap-demo-ids').capability);
  });
  it('capacidad con simulate_n responde 200 y devuelve el n simulado (DA-01)', async () => {
    for (const n of [2, 4, 5, 10]) {
      const r = await call(s, 'GET', `/analysis/capability?process_id=${pid}&simulate_n=${n}`);
      expect(r.statusCode).toBe(200);
      expect(json(r)).toMatchObject({ simulated: true, simulate_n: n });
      expect(json(r).capability.cpk).toEqual(expect.any(Number));
    }
  });
  it('DA-21: el tamaño de muestra debe ser un entero ≥ 1 y no se guarda nada si uno falla', async () => {
    const p = json(await call(s, 'POST', '/processes', { name: 'Atributos n', chart_type: 'p' })).id;
    for (const bad of [10.5, '7,5', 0, -3, 'abc']) {
      const r = await call(s, 'POST', '/measurements', [{ process_id: p, value: 2, subgroup_id: 1, sample_size: 50 }, { process_id: p, value: 3, subgroup_id: 2, sample_size: bad }]);
      expect(r.statusCode).toBe(400);
      expect(json(r).error).toBe('El tamaño de muestra (n) debe ser un número entero mayor o igual a 1.');
    }
    expect(json(await call(s, 'GET', `/measurements?process_id=${p}`)).total).toBe(0);
    const ok = await call(s, 'POST', '/measurements', [{ process_id: p, value: 2, subgroup_id: 1, sample_size: '50' }, { process_id: p, value: 1, subgroup_id: 2 }]);
    expect(json(ok).inserted).toBe(2);
    expect(json(ok).data.map((m: any) => m.sample_size)).toEqual([50, null]);
  });
  it('DA-27: los límites de Fase I se congelan y no cambian si después cambian los datos', async () => {
    const p = json(await call(s, 'POST', '/processes', { name: 'Congelado', usl: 505, lsl: 495, chart_type: 'xbar_r', n_size: 5 })).id;
    await call(s, 'POST', '/measurements', DEMO.map((value, i) => ({ process_id: p, value, subgroup_id: Math.floor(i / 5) + 1 })));
    expect(json(await call(s, 'GET', `/analysis/phase1-limits?process_id=${p}&type=xbar_r`)).frozen).toBeNull();
    const f1 = json(await call(s, 'POST', '/analysis/phase1-limits', { process_id: p, type: 'xbar_r' })).frozen;
    const ref = golden('cc-demo-xbar_r').chartData;
    expect(f1.chartData.xbar.ucl).toBe(ref.xbar.ucl);
    expect(f1.chartData.r.ucl).toBe(ref.r.ucl);
    expect(f1.stale).toBe(false);
    expect(f1.frozenBy).toBe('Ana Pérez');
    // Se agregan datos de Fase I: la carta en vivo cambia, los congelados no, y se avisa
    await call(s, 'POST', '/measurements', [510, 511, 509, 512, 510].map(value => ({ process_id: p, value, subgroup_id: 13 })));
    const live = json(await call(s, 'GET', `/analysis/control-chart?process_id=${p}&type=xbar_r`));
    expect(live.chartData.xbar.ucl).not.toBe(ref.xbar.ucl);
    const f2 = json(await call(s, 'GET', `/analysis/phase1-limits?process_id=${p}&type=xbar_r`)).frozen;
    expect(f2.chartData.xbar.ucl).toBe(ref.xbar.ucl);
    expect(f2.stale).toBe(true);
    expect(json(await call(s, 'GET', `/analysis/report?process_id=${p}`)).frozenLimits.chartData.xbar.ucl).toBe(ref.xbar.ucl);
    // Recalcular es explícito y toma los datos actuales
    const f3 = json(await call(s, 'POST', '/analysis/phase1-limits', { process_id: p, type: 'xbar_r' })).frozen;
    expect(f3.chartData.xbar.ucl).toBe(live.chartData.xbar.ucl);
    expect(f3.stale).toBe(false);
    // Otra empresa no ve ni congela límites ajenos
    const other = await register('Ajena Límites', 'ajena-limites@ejemplo.test');
    expect((await call(other, 'GET', `/analysis/phase1-limits?process_id=${p}`)).statusCode).toBe(404);
    expect((await call(other, 'POST', '/analysis/phase1-limits', { process_id: p })).statusCode).toBe(404);
  });
  it('capacidad solo con índices de corto plazo (DA-19)', async () => {
    const cap = json(await call(s, 'GET', `/analysis/capability?process_id=${pid}`)).capability;
    expect(Object.keys(cap).sort()).toEqual(['cp', 'cpk', 'cpl', 'cpu', 'distToLsl', 'distToNominal', 'distToUsl', 'n', 'n_subgroups',
      'ppmLower', 'ppmTotal', 'ppmUpper', 'sigma', 'sigmaMethod', 'status', 'subgroup_size', 'tolerance', 'xbar']);
  });
  it('carta X̄-R y X̄-S iguales a los valores de referencia', async () => {
    for (const type of ['xbar_r', 'xbar_s']) {
      const r = json(await call(s, 'GET', `/analysis/control-chart?process_id=${pid}&type=${type}`));
      const g = golden(`cc-demo-${type}`);
      // Los campos de la carta de dispersión (DA-24) se prueban aparte
      expect({ ...r, process: undefined, dispersionViolations: undefined, dispersionOutOfControl: undefined }).toEqual({ ...g, process: undefined });
      expect(r.dispersionViolations).toEqual([]);
    }
  });
  it('histograma, pruebas e informe iguales a los valores de referencia', async () => {
    const h = json(await call(s, 'GET', `/analysis/histogram?process_id=${pid}&bins=10`));
    expect({ ...h, process: undefined }).toEqual({ ...golden('hist-demo-10'), process: undefined });
    const t = json(await call(s, 'GET', `/analysis/tests?process_id=${pid}`));
    expect({ ...t, process: undefined }).toEqual({ ...golden('tests-demo'), process: undefined });
    const rep = json(await call(s, 'GET', `/analysis/report?process_id=${pid}`));
    const g = golden('report-demo');
    for (const k of ['dataSummary', 'controlChart', 'capability', 'statisticalTests', 'histogram']) expect(rep[k]).toEqual(g[k]);
  });
  it('el Panel usa el mismo Cpk que Capacidad (DA-09)', async () => {
    const d = (json(await call(s, 'GET', '/analysis/dashboard-summary')) as any[]).find(x => x.id === pid);
    expect(d.cpk).toBe(golden('cap-demo-ids').capability.cpk);
    expect(d.status).toBe('capaz');
    expect(d.n).toBe(60);
  });
  it('siguiente subgrupo continúa desde el máximo (DA-03)', async () => {
    expect(json(await call(s, 'GET', `/measurements/next-subgroup?process_id=${pid}`)).next).toBe(13);
    expect(json(await call(s, 'GET', `/measurements/next-subgroup?process_id=${pid}&phase=2`)).next).toBe(1);
  });
  it('lista paginada con total y subgrupos', async () => {
    const r = json(await call(s, 'GET', `/measurements?process_id=${pid}&limit=10&phase=1`));
    expect(r.data).toHaveLength(10);
    expect(r.total).toBe(60);
    expect(r.subgroups).toBe(12);
    expect(r.data[0].value).toBe(DEMO[59]);
  });
  it('Fase II: alta, informe desde base de datos (DA-11) y borrado por fase', async () => {
    const sg = [500.1, 500.4, 499.9, 500.6, 500.2];
    await call(s, 'POST', '/measurements', sg.map(v => ({ process_id: pid, value: v, subgroup_id: 1, phase: 2 })));
    const rep = json(await call(s, 'GET', `/analysis/report?process_id=${pid}`));
    expect(rep.phaseTwo).toEqual([{ subgroup_id: 1, values: sg, sampleSize: 5 }]);
    expect(json(await call(s, 'GET', `/analysis/capability?process_id=${pid}`)).capability.n).toBe(60);
    expect(json(await call(s, 'DELETE', `/measurements?process_id=${pid}&phase=2`)).deleted).toBe(5);
  });
  it('errores del motor con el mensaje literal', async () => {
    const empty = json(await call(s, 'POST', '/processes', { name: 'Vacío', lsl: 1, usl: 2 })).id;
    const r = await call(s, 'GET', `/analysis/capability?process_id=${empty}`);
    expect(r.statusCode).toBe(400);
    expect(json(r).error).toBe('Se necesitan al menos 2 mediciones.');
    expect(json(await call(s, 'GET', `/analysis/control-chart?process_id=${pid}&type=imr`)).error).toBe('Tipo de carta inválido. Use: xbar_r, xbar_s, p, np, c, u.');
    expect(json(await call(s, 'GET', '/analysis/capability')).error).toBe('Se requiere process_id.');
  });
  it('importación CSV con el comportamiento esperado', async () => {
    const boundary = 'xx';
    const csv = 'valor,subgrupo\n10,1\n10.5,1\nabc,2\n"11,2",2\n';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="process_id"\r\n\r\n${pid}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="datos.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`;
    const r = await app.inject({ method: 'POST', url: '/api/measurements/import', payload: body, headers: { cookie: s.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(json(r)).toEqual({ inserted: 3, errors: ['Fila 4: valor inválido "abc"'], total_rows: 4, file_type: 'csv' });
  });
});

describe('administración, facturación y DA-17', () => {
  let admin: Session, pid: string;
  beforeAll(async () => {
    admin = await register('Admin SA', 'jefe@ejemplo.test');
    pid = json(await call(admin, 'POST', '/processes', { name: 'P' })).id;
  });
  it('usuarios: invitar, rol de analista sin acceso de admin, no borrarse a sí mismo', async () => {
    const inv = await call(admin, 'POST', '/users/invite', { name: 'Luis', email: 'luis@ejemplo.test', password: 'clave-segura-2' });
    expect(inv.statusCode).toBe(201);
    expect(json(inv).role).toBe('analyst');
    expect(json(await call(admin, 'POST', '/users/invite', { name: 'X', email: 'x@ejemplo.test', password: 'clave-segura-2', role: 'jefe' })).error).toBe('Rol inválido. Use: admin | analyst.');
    const analyst = sessionOf(await call(null, 'POST', '/auth/login', { email: 'luis@ejemplo.test', password: 'clave-segura-2' }));
    const forbidden = await call(analyst, 'GET', '/users');
    expect(forbidden.statusCode).toBe(403);
    expect(json(forbidden).error).toBe('Se requieren privilegios de administrador.');
    const me = json(await call(admin, 'GET', '/auth/me')).user.id;
    expect(json(await call(admin, 'DELETE', `/users/${me}`)).error).toBe('No puedes eliminar tu propio usuario.');
  });
  it('pagos deshabilitados y activación de desarrollo (DA-12)', async () => {
    const r = await call(admin, 'POST', '/billing/checkout');
    expect(r.statusCode).toBe(503);
    expect(json(r).error).toBe('Pagos deshabilitados en modo local.');
    await call(admin, 'POST', '/billing/activate-dev');
    expect(json(await call(admin, 'GET', '/billing/status')).subscription_status).toBe('active');
  });
  it('evaluación de desempeño guardada en base de datos', async () => {
    expect(json(await call(admin, 'GET', `/performance/${pid}`))).toBeNull();
    await call(admin, 'PUT', `/performance/${pid}`, { chart_type: 'xbar_r', data: { mu0: 500, mu1: 500.4, config: { t: 4, prod: 100, cmDelta: 0.2 } } });
    const r = json(await call(admin, 'GET', `/performance/${pid}`));
    expect(r.data.mu1).toBe(500.4);
  });
  it('sesiones de monitoreo: máximo 50 por empresa', async () => {
    for (let i = 0; i < 52; i++) {
      await call(admin, 'POST', '/monitoring/sessions', { process_id: pid, name: `Turno ${i}`, chart_type: 'xbar_r', mode: 'industrial', sg_size: 5, subgroup_count: i });
    }
    const list = json(await call(admin, 'GET', '/monitoring/sessions'));
    expect(list).toHaveLength(50);
    expect(list[0].name).toBe('Turno 51');
  });
  it('eliminar un proceso borra sus mediciones, evaluación y sesiones; otra empresa no puede borrarlo', async () => {
    const victim = json(await call(admin, 'POST', '/processes', { name: 'Para borrar' })).id;
    const keep = json(await call(admin, 'POST', '/processes', { name: 'Se queda' })).id;
    const rows = (p: string, phase = 1) => DEMO.slice(0, 10).map((value, i) => ({ process_id: p, value, subgroup_id: Math.floor(i / 5) + 1, phase }));
    await call(admin, 'POST', '/measurements', [...rows(victim), ...rows(victim, 2)]);
    await call(admin, 'POST', '/measurements', rows(keep));
    await call(admin, 'PUT', `/performance/${victim}`, { chart_type: 'xbar_r', data: { mu0: 1 } });
    await call(admin, 'POST', '/monitoring/sessions', { process_id: victim, name: 'Sesión a borrar', chart_type: 'xbar_r', mode: 'industrial', sg_size: 5, subgroup_count: 2 });

    const other = await register('Ajena SA', 'ajena@ejemplo.test');
    const foreign = await call(other, 'DELETE', `/processes/${victim}`);
    expect(foreign.statusCode).toBe(404);
    expect(json(foreign).error).toBe('Proceso no encontrado.');

    const del = await call(admin, 'DELETE', `/processes/${victim}`);
    expect(json(del).message).toBe('Proceso eliminado correctamente.');
    const left = await pool.query(`SELECT
      (SELECT count(*) FROM measurements WHERE process_id=$1)::int AS m,
      (SELECT count(*) FROM performance_evaluations WHERE process_id=$1)::int AS e,
      (SELECT count(*) FROM monitoring_sessions WHERE process_id=$1)::int AS s,
      (SELECT count(*) FROM measurements WHERE process_id=$2)::int AS kept`, [victim, keep]);
    expect(left.rows[0]).toEqual({ m: 0, e: 0, s: 0, kept: 10 });
    expect((await call(admin, 'GET', `/processes/${victim}`)).statusCode).toBe(404);
    expect(json(await call(admin, 'GET', '/monitoring/sessions')).some((x: any) => x.name === 'Sesión a borrar')).toBe(false);
  });
});
