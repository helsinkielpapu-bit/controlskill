import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

export type Queryable = Pick<pg.PoolClient, 'query'>;

/** Ejecuta fn dentro de una transacción. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** NUMERIC llega como texto: se convierte en un solo lugar, con parseFloat. */
export const toNumber = (v: unknown): number | null => (v == null ? null : parseFloat(String(v)));
