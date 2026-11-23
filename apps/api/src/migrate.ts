// Ejecutor mínimo de migraciones SQL versionadas (db/migrations/NNN_*.sql).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = fileURLToPath(new URL('../db/migrations/', import.meta.url));

export async function migrate(log = console.log): Promise<void> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const done = new Set((await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(dir + file, 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`  migración aplicada: ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate().then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
}
