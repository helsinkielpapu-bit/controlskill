// /api/auth — registro, inicio de sesión, perfil y cierre (RF-001…RF-003, RF-010).
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { registerSchema, loginSchema } from '@controlskill/contracts';
import { pool, transaction } from '../db.js';
import { HttpError } from '../errors.js';
import { setSessionCookie, SESSION_COOKIE } from '../auth.js';

const SALT_ROUNDS = 12;
// 10 intentos por minuto; solo las pruebas automáticas (NODE_ENV=test) usan un tope más alto.
const loginLimit = { rateLimit: { max: process.env.NODE_ENV === 'test' ? 200 : 10, timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', { config: loginLimit }, async (req, reply) => {
    const body = registerSchema.parse(req.body ?? {});
    const email = body.email.toLowerCase();
    const hash = await bcrypt.hash(body.password, SALT_ROUNDS);
    const result = await transaction(async c => {
      const exists = await c.query('SELECT id FROM users WHERE email = $1', [email]);
      if (exists.rows.length) throw new HttpError(409, 'El email ya está registrado.');
      const company = await c.query(
        `INSERT INTO companies (name, email, subscription_status) VALUES ($1, $2, 'inactive') RETURNING id, name, subscription_status`,
        [body.company_name, email]
      );
      const user = await c.query(
        `INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'admin') RETURNING id, name, email, role`,
        [company.rows[0].id, body.name, email, hash]
      );
      return { company: company.rows[0], user: user.rows[0] };
    });
    const token = await reply.jwtSign({ user_id: result.user.id, company_id: result.company.id, role: result.user.role, tv: 0 });
    setSessionCookie(reply, token);
    return reply.status(201).send({ user: result.user, company: result.company });
  });

  app.post('/login', { config: loginLimit }, async (req, reply) => {
    const body = loginSchema.parse(req.body ?? {});
    const r = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.token_version, c.id AS company_id, c.name AS company_name, c.subscription_status
       FROM users u JOIN companies c ON c.id = u.company_id WHERE u.email = $1`,
      [body.email.toLowerCase()]
    );
    const row = r.rows[0];
    if (!row || !(await bcrypt.compare(body.password, row.password_hash))) throw new HttpError(401, 'Credenciales incorrectas.');
    const token = await reply.jwtSign({ user_id: row.id, company_id: row.company_id, role: row.role, tv: row.token_version });
    setSessionCookie(reply, token);
    return {
      user: { id: row.id, name: row.name, email: row.email, role: row.role },
      company: { id: row.company_id, name: row.company_name, subscription_status: row.subscription_status }
    };
  });

  app.post('/logout', async (req, reply) => {
    // DA-20: si la sesión es válida, se revoca (sube la versión); el token deja de servir aunque alguien lo haya copiado.
    try {
      await req.jwtVerify();
      await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1 AND token_version = $2', [req.user.user_id, req.user.tv]);
    } catch { /* sin sesión válida: solo se borra la cookie */ }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: app.authenticate }, async req => {
    const r = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at, c.id AS company_id, c.name AS company_name,
              c.subscription_status, c.subscription_end_date
       FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = $1`,
      [req.user.user_id]
    );
    const row = r.rows[0];
    if (!row) throw new HttpError(404, 'Usuario no encontrado.');
    return {
      user: { id: row.id, name: row.name, email: row.email, role: row.role, created_at: row.created_at },
      company: { id: row.company_id, name: row.company_name, subscription_status: row.subscription_status, subscription_end_date: row.subscription_end_date }
    };
  });
}
