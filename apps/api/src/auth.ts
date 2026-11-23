// Sesión por cookie httpOnly con JWT de 7 días (RF-002) y controles de acceso (RF-007, RF-008).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from './env.js';
import { pool } from './db.js';
import { HttpError } from './errors.js';

export const SESSION_COOKIE = 'cs_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** tv: versión de sesión del usuario al firmar (DA-20). */
export interface SessionClaims { user_id: string; company_id: string; role: 'admin' | 'analyst'; tv: number }

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: SessionClaims; user: SessionClaims }
}
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSubscription: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuth(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: env.jwtSecret,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: '7d' }
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (!req.cookies[SESSION_COOKIE] && !req.headers.authorization) throw new HttpError(401, 'Token de autenticación requerido.');
    try { await req.jwtVerify(); } catch { throw new HttpError(401, 'Token inválido o expirado.'); }
    // DA-20: el usuario debe seguir existiendo y la sesión no debe estar revocada; rol y empresa salen de la base.
    const r = await pool.query<{ role: SessionClaims['role']; company_id: string; token_version: number }>(
      'SELECT role, company_id, token_version FROM users WHERE id = $1', [req.user.user_id]);
    const u = r.rows[0];
    if (!u || u.token_version !== req.user.tv) throw new HttpError(401, 'Sesión no válida. Inicia sesión de nuevo.');
    req.user.role = u.role;
    req.user.company_id = u.company_id;
  });

  app.decorate('requireSubscription', async (req: FastifyRequest) => {
    if (!env.requireSubscription) return;
    const r = await pool.query('SELECT subscription_status FROM companies WHERE id = $1', [req.user.company_id]);
    if (!r.rows.length) throw new HttpError(404, 'Empresa no encontrada.');
    const status = r.rows[0].subscription_status as string;
    if (status !== 'active') throw new HttpError(402, 'Suscripción inactiva o vencida.', { subscription_status: status });
  });

  app.decorate('requireAdmin', async (req: FastifyRequest) => {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Se requieren privilegios de administrador.');
  });
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: env.isProduction, path: '/', maxAge: SESSION_TTL_SECONDS
  });
}

/** Ganchos estándar de las rutas protegidas: sesión + suscripción. */
export const protectedRoute = (app: FastifyInstance) => [app.authenticate, app.requireSubscription];
