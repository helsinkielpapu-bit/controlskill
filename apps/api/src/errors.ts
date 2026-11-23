import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AnalysisError } from '@controlskill/engine';

/** Error HTTP con mensaje para el usuario (los mensajes literales del documento maestro §5). */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly extra?: Record<string, unknown>) { super(message); }
}
export const badRequest = (m: string) => new HttpError(400, m);
export const notFound = (m: string) => new HttpError(404, m);

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError || err instanceof AnalysisError) {
      return reply.status(err.status).send({ error: err.message, ...(err instanceof HttpError ? err.extra : {}) });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: err.issues[0]?.message ?? 'Datos inválidos.' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ error: 'Demasiados intentos. Intente de nuevo en un minuto.' });
    if (status && status < 500) return reply.status(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.status(500).send({ error: 'Error interno del servidor.' });
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: `Ruta no encontrada: ${req.method} ${req.url}` }));
}
