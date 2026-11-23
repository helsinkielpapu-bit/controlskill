// /api/measurements — lista, alta, importación y borrado (RF-208, RF-301…RF-303, RF-605, DA-03).
import type { FastifyInstance } from 'fastify';
import * as XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import { pool, toNumber, transaction } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { findProcess } from './processes.js';

const mapMeasurement = (r: Record<string, unknown>) => ({
  ...r, value: toNumber(r.value), sample_size: toNumber(r.sample_size), phase: Number(r.phase)
});
const phaseSql = (phase: unknown) => (phase === 'all' ? '' : `AND m.phase = ${phase === '2' || phase === 2 ? 2 : 1}`);

/** Mediciones de una fase en el orden de análisis (recorded_at y orden de inserción). */
export async function loadRows(processId: string, companyId: string, phase: 1 | 2 = 1) {
  return (await pool.query(
    `SELECT value, subgroup_id, sample_size FROM measurements
     WHERE process_id = $1 AND company_id = $2 AND phase = $3 ORDER BY recorded_at ASC, seq ASC`,
    [processId, companyId, phase]
  )).rows as { value: string; subgroup_id: number | null; sample_size: string | null }[];
}

export async function measurementRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);

  app.get<{ Querystring: { process_id?: string; limit?: string; offset?: string; phase?: string } }>('/', async req => {
    const { process_id, limit = '500', offset = '0', phase = '1' } = req.query;
    if (!process_id) throw badRequest('Se requiere process_id.');
    await findProcess(pool, process_id, req.user.company_id);
    const lim = Math.max(0, parseInt(limit) || 0), off = Math.max(0, parseInt(offset) || 0);
    const rows = await pool.query(
      `SELECT m.id, m.value, m.subgroup_id, m.phase, m.sample_size, m.recorded_at, u.name AS recorded_by_name
       FROM measurements m LEFT JOIN users u ON u.id = m.recorded_by
       WHERE m.process_id = $1 AND m.company_id = $2 ${phaseSql(phase)}
       ORDER BY m.recorded_at DESC, m.seq DESC LIMIT $3 OFFSET $4`,
      [process_id, req.user.company_id, lim, off]
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT m.subgroup_id)::int AS subgroups
       FROM measurements m WHERE m.process_id = $1 AND m.company_id = $2 ${phaseSql(phase)}`,
      [process_id, req.user.company_id]
    );
    return { data: rows.rows.map(mapMeasurement), total: count.rows[0].total, subgroups: count.rows[0].subgroups, limit: lim, offset: off };
  });

  /** DA-03: siguiente identificador de subgrupo libre para una fase. */
  app.get<{ Querystring: { process_id?: string; phase?: string } }>('/next-subgroup', async req => {
    if (!req.query.process_id) throw badRequest('Se requiere process_id.');
    await findProcess(pool, req.query.process_id, req.user.company_id);
    const r = await pool.query(
      'SELECT COALESCE(MAX(subgroup_id), 0)::int + 1 AS next FROM measurements WHERE process_id = $1 AND company_id = $2 AND phase = $3',
      [req.query.process_id, req.user.company_id, req.query.phase === '2' ? 2 : 1]
    );
    return { next: r.rows[0].next };
  });

  /** Alta de una o varias mediciones (objeto o arreglo). */
  app.post('/', async (req, reply) => {
    const items = (Array.isArray(req.body) ? req.body : [req.body]) as Record<string, unknown>[];
    if (!items.length || !items[0]?.process_id) throw badRequest('Se requiere process_id y value.');
    const processId = String(items[0].process_id);
    await findProcess(pool, processId, req.user.company_id);
    // DA-21: el tamaño de muestra, si viene, debe ser un entero ≥ 1. Se valida todo antes de guardar nada.
    const sizeOf = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = Number(String(v).trim());
      if (!Number.isInteger(n) || n < 1) throw badRequest('El tamaño de muestra (n) debe ser un número entero mayor o igual a 1.');
      return n;
    };
    for (const item of items) sizeOf(item.sample_size);
    const inserted = await transaction(async c => {
      const out: unknown[] = [];
      for (const item of items) {
        const { value, subgroup_id, recorded_at, phase, sample_size } = item;
        if (value === undefined || value === null || value === '') continue;
        const numVal = parseFloat(String(value));
        if (isNaN(numVal)) continue;
        const sampleSize = sizeOf(sample_size);
        const r = await c.query(
          `INSERT INTO measurements (process_id, company_id, value, subgroup_id, phase, sample_size, recorded_at, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()),$8)
           RETURNING id, value, subgroup_id, phase, sample_size, recorded_at`,
          [processId, req.user.company_id, numVal, subgroup_id || null, phase === 2 || phase === '2' ? 2 : 1, sampleSize, recorded_at ?? null, req.user.user_id]
        );
        out.push(mapMeasurement(r.rows[0]));
      }
      return out;
    });
    return reply.status(201).send({ inserted: inserted.length, data: inserted });
  });

  /** Importación CSV/Excel a Fase 1 (DA-13). */
  app.post('/import', async req => {
    const file = await req.file();
    if (!file) throw badRequest('Se requiere un archivo CSV o Excel.');
    const buffer = await file.toBuffer();
    const processId = (file.fields.process_id as { value?: string } | undefined)?.value;
    if (!processId) throw badRequest('Se requiere process_id.');
    await findProcess(pool, processId, req.user.company_id);

    const filename = (file.filename || '').toLowerCase();
    const isExcel = filename.endsWith('.xlsx') || filename.endsWith('.xls');
    let records: Record<string, unknown>[];
    if (isExcel) {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      records = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!, { defval: '' });
    } else {
      records = parseCsv(buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
    }
    if (!records.length) throw badRequest('El archivo está vacío o sin datos reconocibles.');

    const errors: string[] = [];
    const inserted = await transaction(async c => {
      let count = 0;
      for (let i = 0; i < records.length; i++) {
        const row = records[i]!;
        const rawValue = row.value ?? row.Value ?? row.VALOR ?? row.valor ?? row.Valor ?? row.medicion ?? row.Medicion ?? Object.values(row)[0];
        const subgroup = row.subgroup_id ?? row.subgrupo ?? row.Subgrupo ?? row.grupo ?? null;
        const numVal = parseFloat(String(rawValue).replace(',', '.'));
        if (isNaN(numVal)) { errors.push(`Fila ${i + 2}: valor inválido "${String(rawValue)}"`); continue; }
        await c.query(
          'INSERT INTO measurements (process_id, company_id, value, subgroup_id, recorded_by) VALUES ($1,$2,$3,$4,$5)',
          [processId, req.user.company_id, numVal, subgroup !== null && subgroup !== '' ? parseInt(String(subgroup)) : null, req.user.user_id]
        );
        count++;
      }
      return count;
    });
    return { inserted, errors, total_rows: records.length, file_type: isExcel ? 'excel' : 'csv' };
  });

  app.delete<{ Params: { id: string } }>('/:id', async req => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('Medición no encontrada.');
    const r = await pool.query('DELETE FROM measurements WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.company_id]);
    if (!r.rows.length) throw notFound('Medición no encontrada.');
    return { message: 'Medición eliminada.' };
  });

  /** Borrado por lote: mismo resultado visible que borrar una a una. */
  app.post<{ Body: { ids?: string[] } }>('/delete', async req => {
    const ids = (req.body?.ids ?? []).filter(id => /^[0-9a-f-]{36}$/i.test(id));
    const r = await pool.query('DELETE FROM measurements WHERE company_id = $1 AND id = ANY($2::uuid[]) RETURNING id', [req.user.company_id, ids]);
    return { deleted: r.rowCount ?? 0, failed: ids.length - (r.rowCount ?? 0) };
  });

  /** «Eliminar Fase 2 de este proceso» (RF-303). */
  app.delete<{ Querystring: { process_id?: string; phase?: string } }>('/', async req => {
    if (!req.query.process_id) throw badRequest('Se requiere process_id.');
    if (req.query.phase !== '2') throw badRequest('Solo se puede borrar por lote la Fase 2.');
    await findProcess(pool, req.query.process_id, req.user.company_id);
    const r = await pool.query('DELETE FROM measurements WHERE process_id = $1 AND company_id = $2 AND phase = 2', [req.query.process_id, req.user.company_id]);
    return { deleted: r.rowCount ?? 0 };
  });
}
