// Construcción de la aplicación Fastify (sin escuchar puerto: lo hace server.ts; las pruebas usan inject).
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { registerAuth } from './auth.js';
import { registerErrorHandler } from './errors.js';
import { authRoutes } from './modules/auth.js';
import { userRoutes } from './modules/users.js';
import { processRoutes } from './modules/processes.js';
import { measurementRoutes } from './modules/measurements.js';
import { analysisRoutes } from './modules/analysis.js';
import { billingRoutes, performanceRoutes, monitoringRoutes } from './modules/company.js';

export async function buildApp(opts: { logger?: boolean } = {}) {
  // trustProxy: en el servidor la app va detrás del proxy HTTPS de la plataforma (IP real para el límite de intentos).
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 10 * 1024 * 1024, trustProxy: env.isProduction });
  registerErrorHandler(app);
  await app.register(cookie);
  await app.register(cors, { origin: [env.webOrigin, 'http://localhost:5173'], credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
  await registerAuth(app);

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  await app.register(async api => {
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(userRoutes, { prefix: '/users' });
    await api.register(processRoutes, { prefix: '/processes' });
    await api.register(measurementRoutes, { prefix: '/measurements' });
    await api.register(analysisRoutes, { prefix: '/analysis' });
    await api.register(billingRoutes, { prefix: '/billing' });
    await api.register(performanceRoutes, { prefix: '/performance' });
    await api.register(monitoringRoutes, { prefix: '/monitoring' });
  }, { prefix: '/api' });

  // En producción la misma app sirve la web compilada (apps/web/dist): web y API comparten origen,
  // así la cookie de sesión sigue siendo SameSite=Strict. En local la sirve Vite y esto no se activa.
  const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (env.isProduction && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.get('/*', (req, reply) => req.url.startsWith('/api/')
      ? reply.status(404).send({ error: `Ruta no encontrada: ${req.method} ${req.url}` })
      : reply.sendFile('index.html'));
  }
  return app;
}
