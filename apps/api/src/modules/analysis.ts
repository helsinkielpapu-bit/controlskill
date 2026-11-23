// /api/analysis — todos los cálculos pasan por el motor único (@controlskill/engine).
import type { FastifyInstance } from 'fastify';
import {
  analyzeCapability, analyzeControlChart, analyzeHistogram, analyzeTests, validateValues, buildReport, AnalysisError
} from '@controlskill/engine';
import { pool } from '../db.js';
import { badRequest } from '../errors.js';
import { findProcess, mapProcess } from './processes.js';
import { loadRows } from './measurements.js';

type Q = { process_id?: string; simulate_n?: string; type?: string; bins?: string; rule_ooc?: string; rule_trend?: string; rule_shift?: string };

async function context(processId: string | undefined, companyId: string) {
  if (!processId) throw badRequest('Se requiere process_id.');
  const process = await findProcess(pool, processId, companyId);
  const rows = await loadRows(processId, companyId, 1);
  return { process, rows };
}

// ── DA-27: límites de Fase I congelados ─────────────────────────────────────
const CHART_TYPES = ['xbar_r', 'xbar_s', 'p', 'np', 'c', 'u'];

/** Huella de las mediciones de Fase I: cambia si se agrega, edita o borra cualquiera. */
async function phaseOneFingerprint(processId: string, companyId: string): Promise<string> {
  const r = await pool.query<{ f: string }>(
    `SELECT COUNT(*) || ':' || COALESCE(md5(string_agg(value::text || '|' || COALESCE(subgroup_id::text, '') || '|' || COALESCE(sample_size::text, ''), ',' ORDER BY seq)), '') AS f
     FROM measurements WHERE process_id = $1 AND company_id = $2 AND phase = 1`, [processId, companyId]);
  return r.rows[0]!.f;
}

export async function frozenLimits(processId: string, companyId: string, type: string) {
  const r = await pool.query(
    `SELECT f.data, f.fingerprint, f.frozen_at, u.name AS frozen_by_name
     FROM phase1_limits f LEFT JOIN users u ON u.id = f.frozen_by
     WHERE f.process_id = $1 AND f.company_id = $2 AND f.chart_type = $3`, [processId, companyId, type]);
  const row = r.rows[0];
  if (!row) return null;
  const stale = row.fingerprint !== await phaseOneFingerprint(processId, companyId);
  return { type, ...row.data, frozenAt: row.frozen_at, frozenBy: row.frozen_by_name ?? null, stale };
}

function chartTypeOf(q: { type?: string }, process: { chart_type?: string | null }): string {
  const type = q.type ?? process.chart_type ?? 'xbar_r';
  if (!CHART_TYPES.includes(type)) throw badRequest('Tipo de carta inválido. Use: xbar_r, xbar_s, p, np, c, u.');
  return type;
}

export async function analysisRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);

  app.get<{ Querystring: Q }>('/capability', async req => {
    const { process, rows } = await context(req.query.process_id, req.user.company_id);
    const simN = req.query.simulate_n ? parseInt(req.query.simulate_n) : null;
    return { process, ...analyzeCapability(process, rows, simN) };
  });

  app.get<{ Querystring: Q }>('/control-chart', async req => {
    const { process, rows } = await context(req.query.process_id, req.user.company_id);
    const q = req.query;
    return {
      process,
      ...analyzeControlChart(process, rows, {
        type: q.type ?? 'xbar_r',
        simulateN: q.simulate_n ? parseInt(q.simulate_n) : null,
        rules: { detectOutOfControl: (q.rule_ooc ?? '1') !== '0', detectTrend: (q.rule_trend ?? '1') !== '0', detectShift: (q.rule_shift ?? '1') !== '0' }
      })
    };
  });

  /** DA-27: límites de Fase I congelados para este proceso y carta (null si aún no se congelaron). */
  app.get<{ Querystring: Q }>('/phase1-limits', async req => {
    if (!req.query.process_id) throw badRequest('Se requiere process_id.');
    const process = await findProcess(pool, req.query.process_id, req.user.company_id);
    return { frozen: await frozenLimits(process.id as string, req.user.company_id, chartTypeOf(req.query, process)) };
  });

  /** DA-27: congela (o recalcula de forma explícita) los límites con las mediciones de Fase I actuales. */
  app.post<{ Body: { process_id?: string; type?: string } }>('/phase1-limits', async req => {
    const { process, rows } = await context(req.body?.process_id, req.user.company_id);
    const type = chartTypeOf(req.body ?? {}, process);
    const { violations: _v, dispersionViolations: _d, ...data } = analyzeControlChart(process, rows, { type });
    await pool.query(
      `INSERT INTO phase1_limits (process_id, company_id, chart_type, data, fingerprint, frozen_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (process_id, chart_type) DO UPDATE SET data = EXCLUDED.data, fingerprint = EXCLUDED.fingerprint, frozen_at = NOW(), frozen_by = EXCLUDED.frozen_by`,
      [process.id, req.user.company_id, type, JSON.stringify(data), await phaseOneFingerprint(process.id as string, req.user.company_id), req.user.user_id]);
    return { frozen: await frozenLimits(process.id as string, req.user.company_id, type) };
  });

  app.get<{ Querystring: Q }>('/histogram', async req => {
    const { process, rows } = await context(req.query.process_id, req.user.company_id);
    return { process, ...analyzeHistogram(rows, req.query.bins ?? 10) };
  });

  app.get<{ Querystring: Q }>('/tests', async req => {
    const { process, rows } = await context(req.query.process_id, req.user.company_id);
    return { process, ...analyzeTests(rows) };
  });

  app.post<{ Body: { values?: unknown; subgroup_size?: unknown } }>('/validate', async req =>
    validateValues(req.body?.values, req.body?.subgroup_size));

  /** DA-09: el Panel usa exactamente el cálculo de /capability, con todas las mediciones de Fase 1. */
  app.get('/dashboard-summary', async req => {
    const procs = (await pool.query(
      `SELECT p.id, p.name, p.unit, p.usl, p.lsl, p.nominal, p.chart_type, p.n_size, p.created_at,
              COUNT(m.id)::int AS n
       FROM processes p LEFT JOIN measurements m ON m.process_id = p.id AND m.phase = 1
       WHERE p.company_id = $1 GROUP BY p.id ORDER BY p.created_at DESC`,
      [req.user.company_id]
    )).rows.map(mapProcess) as (ReturnType<typeof mapProcess> & { n: number })[];
    return Promise.all(procs.map(async p => {
      if (p.usl == null || p.lsl == null || p.n < 2) return { ...p, cpk: null, status: 'sin_datos', capability: null };
      try {
        const { capability } = analyzeCapability(p, await loadRows(p.id, req.user.company_id, 1));
        return { ...p, cpk: capability.cpk, status: capability.status, capability };
      } catch (e) {
        if (e instanceof AnalysisError) return { ...p, cpk: null, status: 'sin_datos', capability: null, reason: e.message };
        throw e;
      }
    }));
  });

  /** Informe (RF-902). DA-11: la Fase II sale de la base de datos; DA-17: evaluación guardada. */
  app.get<{ Querystring: Q }>('/report', async req => {
    const { process, rows } = await context(req.query.process_id, req.user.company_id);
    const report = buildReport(process as never, rows);
    const phaseTwoRows = await loadRows(process.id as string, req.user.company_id, 2);
    const groups = new Map<number, { values: number[]; sampleSize: number }>();
    for (const r of phaseTwoRows) {
      if (r.subgroup_id == null) continue;
      const g = groups.get(r.subgroup_id) ?? { values: [], sampleSize: 0 };
      g.values.push(parseFloat(r.value));
      g.sampleSize += r.sample_size ? parseFloat(r.sample_size) : 1;
      groups.set(r.subgroup_id, g);
    }
    const phaseTwo = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([subgroup_id, g]) => ({ subgroup_id, ...g }));
    const evaluation = (await pool.query('SELECT data, saved_at FROM performance_evaluations WHERE process_id = $1 AND company_id = $2', [process.id, req.user.company_id])).rows[0] ?? null;
    // DA-27: la Fase II del informe se evalúa contra los límites congelados, si existen
    const frozen = await frozenLimits(process.id as string, req.user.company_id, (process.chart_type as string) || 'xbar_r');
    return { ...report, phaseTwo, evaluation, frozenLimits: frozen };
  });
}
