// /api/processes — CRUD de procesos (RF-101…RF-104, DA-02, DA-05).
import type { FastifyInstance } from 'fastify';
import { processCreateSchema, processPatchSchema, processRuleError, type ProcessValues } from '@controlskill/contracts';
import { pool, toNumber, type Queryable } from '../db.js';
import { badRequest, notFound } from '../errors.js';

const COLUMNS = `p.id, p.name, p.description, p.unit, p.usl, p.lsl, p.nominal, p.chart_type, p.n_size, p.created_at`;

export interface ProcessRow {
  id: string; name: string; description: string | null; unit: string | null;
  usl: number | null; lsl: number | null; nominal: number | null;
  chart_type: string; n_size: number | null; created_at: string; created_by_name?: string | null;
  [k: string]: unknown;
}
export function mapProcess(row: Record<string, unknown>): ProcessRow {
  return {
    ...(row as ProcessRow),
    usl: toNumber(row.usl), lsl: toNumber(row.lsl), nominal: toNumber(row.nominal),
    n_size: row.n_size == null ? null : Number(row.n_size)
  };
}

/** Repositorio: proceso de la empresa o 404. */
export async function findProcess(db: Queryable, id: string, companyId: string) {
  const r = await db.query(
    `SELECT ${COLUMNS}, u.name AS created_by_name FROM processes p LEFT JOIN users u ON u.id = p.created_by
     WHERE p.id = $1 AND p.company_id = $2`,
    [id, companyId]
  );
  if (!r.rows.length) throw notFound('Proceso no encontrado.');
  return mapProcess(r.rows[0]);
}

const uuidOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function processRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);

  app.get('/', async req => (await pool.query(
    `SELECT ${COLUMNS}, u.name AS created_by_name, COUNT(m.id)::int AS measurement_count
     FROM processes p
     LEFT JOIN users u ON u.id = p.created_by
     LEFT JOIN measurements m ON m.process_id = p.id
     WHERE p.company_id = $1
     GROUP BY p.id, u.name
     ORDER BY p.created_at DESC`,
    [req.user.company_id]
  )).rows.map(mapProcess));

  app.post('/', async (req, reply) => {
    const body = processCreateSchema.parse(req.body ?? {});
    const values: ProcessValues = {
      name: body.name, description: body.description ?? null, unit: body.unit ?? null,
      usl: body.usl ?? null, lsl: body.lsl ?? null, nominal: body.nominal ?? null,
      chart_type: body.chart_type ?? 'xbar_r', n_size: body.n_size ?? null
    };
    const ruleError = processRuleError(values);
    if (ruleError) throw badRequest(ruleError);
    const r = await pool.query(
      `INSERT INTO processes (company_id, name, description, unit, usl, lsl, nominal, chart_type, n_size, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.user.company_id, values.name, values.description, values.unit, values.usl, values.lsl, values.nominal, values.chart_type, values.n_size, req.user.user_id]
    );
    return reply.status(201).send(await findProcess(pool, r.rows[0].id, req.user.company_id));
  });

  app.get<{ Params: { id: string } }>('/:id', async req => {
    if (!uuidOk(req.params.id)) throw notFound('Proceso no encontrado.');
    return findProcess(pool, req.params.id, req.user.company_id);
  });

  const update = async (req: { params: { id: string }; body: unknown; user: { company_id: string } }) => {
    if (!uuidOk(req.params.id)) throw notFound('Proceso no encontrado.');
    const patch = processPatchSchema.parse(req.body ?? {});
    const current = await findProcess(pool, req.params.id, req.user.company_id);
    const merged = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as unknown as ProcessValues;
    const ruleError = processRuleError(merged);
    if (ruleError) throw badRequest(ruleError);
    await pool.query(
      `UPDATE processes SET name=$1, description=$2, unit=$3, usl=$4, lsl=$5, nominal=$6, chart_type=$7, n_size=$8
       WHERE id=$9 AND company_id=$10`,
      [merged.name, merged.description, merged.unit, merged.usl, merged.lsl, merged.nominal, merged.chart_type, merged.n_size, req.params.id, req.user.company_id]
    );
    return findProcess(pool, req.params.id, req.user.company_id);
  };
  app.patch<{ Params: { id: string } }>('/:id', req => update(req));
  app.put<{ Params: { id: string } }>('/:id', req => update(req));

  app.delete<{ Params: { id: string } }>('/:id', async req => {
    if (!uuidOk(req.params.id)) throw notFound('Proceso no encontrado.');
    const r = await pool.query('DELETE FROM processes WHERE id=$1 AND company_id=$2 RETURNING id', [req.params.id, req.user.company_id]);
    if (!r.rows.length) throw notFound('Proceso no encontrado.');
    return { message: 'Proceso eliminado correctamente.' };
  });
}
