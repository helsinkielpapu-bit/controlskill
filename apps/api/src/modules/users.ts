// /api/users — gestión de usuarios de la empresa, solo administradores (RF-1102).
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { inviteSchema } from '@controlskill/contracts';
import { pool } from '../db.js';
import { HttpError, badRequest, notFound } from '../errors.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);
  app.addHook('preHandler', app.requireAdmin);

  app.get('/', async req => (await pool.query(
    'SELECT id, name, email, role, created_at FROM users WHERE company_id = $1 ORDER BY created_at ASC',
    [req.user.company_id]
  )).rows);

  app.post('/invite', async (req, reply) => {
    const body = inviteSchema.parse(req.body ?? {});
    const email = body.email.toLowerCase();
    if ((await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows.length) throw new HttpError(409, 'El email ya está registrado.');
    const hash = await bcrypt.hash(body.password, 12);
    const r = await pool.query(
      `INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, created_at`,
      [req.user.company_id, body.name, email, hash, body.role]
    );
    return reply.status(201).send(r.rows[0]);
  });

  app.delete<{ Params: { id: string } }>('/:id', async req => {
    if (req.params.id === req.user.user_id) throw badRequest('No puedes eliminar tu propio usuario.');
    const r = await pool.query('DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.company_id]);
    if (!r.rows.length) throw notFound('Usuario no encontrado.');
    return { message: 'Usuario eliminado.' };
  });
}
