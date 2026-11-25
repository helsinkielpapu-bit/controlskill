// Configuración. En local lee ../../.env (raíz del proyecto) si existe; en el servidor llega por variables de entorno.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver .env.example).`);
  return v;
}

export const env = {
  databaseUrl: process.env.NODE_ENV === 'test' ? required('DATABASE_URL_TEST') : required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  /** En local solo 127.0.0.1; en el servidor HOST=0.0.0.0 y el puerto lo asigna la plataforma (PORT). */
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4100),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173',
  isProduction: process.env.NODE_ENV === 'production',
  /** Indicador de suscripción (DA-12). Apagado por defecto. */
  requireSubscription: process.env.REQUIRE_SUBSCRIPTION === 'true'
};
