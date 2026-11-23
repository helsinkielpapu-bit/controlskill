// Deja la base de pruebas vacía y migrada antes de cada corrida (se ejecuta después de levantar los servidores).
import pg from 'pg';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default async function globalSetup() {
  const envFile = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const dir = fileURLToPath(new URL('../apps/api/db/migrations/', import.meta.url));
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await client.query(readFileSync(dir + f, 'utf8'));
    await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
  }
  await client.end();
}
