// /api/billing, /api/performance y /api/monitoring (DA-12, DA-17).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CHART_TYPES } from '@controlskill/contracts';
import { pool } from '../db.js';
import { env } from '../env.js';
import { HttpError, badRequest, notFound } from '../errors.js';
import { findProcess } from './processes.js';

/** DA-12: sin integración de pagos. Se conserva el estado de suscripción y la activación de desarrollo. */
export async function billingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.get('/status', async req => {
    const r = await pool.query('SELECT subscription_status, subscription_end_date FROM companies WHERE id = $1', [req.user.company_id]);
    if (!r.rows.length) throw notFound('Empresa no encontrada.');
    return r.rows[0];
  });
  app.post('/activate-dev', async req => {
    if (env.isProduction) throw new HttpError(403, 'No disponible en producción.');
    await pool.query(`UPDATE companies SET subscription_status = 'active', subscription_end_date = NOW() + INTERVAL '1 year' WHERE id = $1`, [req.user.company_id]);
    return { message: 'Suscripción activada en modo de desarrollo.' };
  });
  const disabled = async () => { throw new HttpError(503, 'Pagos deshabilitados en modo local.'); };
  app.post('/checkout', disabled);
  app.post('/portal', disabled);
}

const evaluationSchema = z.object({ chart_type: z.enum(CHART_TYPES), data: z.record(z.string(), z.unknown()) });

/** DA-17: evaluación de desempeño guardada por proceso. */
export async function performanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);
  app.get<{ Params: { processId: string } }>('/:processId', async req => {
    await findProcess(pool, req.params.processId, req.user.company_id);
    const r = await pool.query('SELECT chart_type, data, saved_at FROM performance_evaluations WHERE process_id = $1 AND company_id = $2', [req.params.processId, req.user.company_id]);
    return r.rows[0] ?? null;
  });
  app.put<{ Params: { processId: string } }>('/:processId', async req => {
    await findProcess(pool, req.params.processId, req.user.company_id);
    const body = evaluationSchema.parse(req.body ?? {});
    const r = await pool.query(
      `INSERT INTO performance_evaluations (company_id, process_id, chart_type, data) VALUES ($1,$2,$3,$4)
       ON CONFLICT (process_id) DO UPDATE SET chart_type = EXCLUDED.chart_type, data = EXCLUDED.data, saved_at = NOW()
       RETURNING chart_type, data, saved_at`,
      [req.user.company_id, req.params.processId, body.chart_type, body.data]
    );
    return r.rows[0];
  });
}

const sessionSchema = z.object({
  process_id: z.string().uuid(),
  name: z.string().trim().min(1, 'Escribe un nombre para la sesión.').max(200),
  chart_type: z.enum(CHART_TYPES),
  chart_label: z.string().max(100).nullish(),
  mode: z.enum(['industrial', 'academic']),
  sg_size: z.coerce.number().int().min(1).max(10000).nullish(),
  subgroup_count: z.coerce.number().int().min(0)
});

/** DA-17: sesiones de monitoreo guardadas, máximo 50 por empresa (se descarta la más antigua). */
export async function monitoringRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);
  app.get('/sessions', async req => (await pool.query(
    `SELECT s.*, p.name AS process_name FROM monitoring_sessions s JOIN processes p ON p.id = s.process_id
     WHERE s.company_id = $1 ORDER BY s.saved_at DESC LIMIT 50`,
    [req.user.company_id]
  )).rows);
  app.post('/sessions', async (req, reply) => {
    const b = sessionSchema.parse(req.body ?? {});
    await findProcess(pool, b.process_id, req.user.company_id);
    const r = await pool.query(
      `INSERT INTO monitoring_sessions (company_id, process_id, name, chart_type, chart_label, mode, sg_size, subgroup_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, b.process_id, b.name, b.chart_type, b.chart_label ?? null, b.mode, b.sg_size ?? null, b.subgroup_count]
    );
    await pool.query(
      `DELETE FROM monitoring_sessions WHERE company_id = $1 AND id NOT IN
       (SELECT id FROM monitoring_sessions WHERE company_id = $1 ORDER BY saved_at DESC LIMIT 50)`,
      [req.user.company_id]
    );
    return reply.status(201).send(r.rows[0]);
  });
  app.delete<{ Params: { id: string } }>('/sessions/:id', async req => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw badRequest('Sesión inválida.');
    const r = await pool.query('DELETE FROM monitoring_sessions WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.company_id]);
    if (!r.rows.length) throw notFound('Sesión no encontrada.');
    return { message: 'Sesión eliminada.' };
  });
}
