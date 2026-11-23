// Administración (RF-1101…RF-1105, DA-12, DA-14).
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router';
import { endpoints, ApiError } from '../app/api';
import { useSession } from '../app/session';
import { Alert, Empty, Field, Loading, Modal } from '../ui/components';
import { Icon } from '../ui/icons';

// Datos de demostración: 60 valores, 12 subgrupos de 5.
const DEMO = [499.2,501.3,500.8,499.7,500.1,501.5,499.8,500.3,501.1,499.5,500.7,501.2,499.3,500.9,501.4,499.6,500.4,501.0,499.9,500.5,
  501.3,499.4,500.6,501.1,499.8,500.2,500.7,499.5,501.4,500.0,500.3,499.7,501.0,500.5,499.9,501.2,500.1,499.6,500.8,501.5,
  499.4,500.9,501.3,499.8,500.4,501.1,499.2,500.6,501.0,500.3,499.7,500.8,501.4,499.5,500.2,501.3,499.9,500.7,501.1,499.3];
const STATUS: Record<string, string> = { active: 'Activa', inactive: 'Inactiva', past_due: 'Pago vencido', canceled: 'Cancelada' };

export default function Admin() {
  const { user } = useSession();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: endpoints.users, enabled: user?.role === 'admin' });
  const billing = useQuery({ queryKey: ['billing'], queryFn: endpoints.billingStatus });
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: React.ReactNode } | null>(null);
  const [invite, setInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

  async function doInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const b = { name: String(f.get('name') ?? '').trim(), email: String(f.get('email') ?? '').trim(), password: String(f.get('password') ?? ''), role: String(f.get('role')) };
    if (!b.name || !b.email || !b.password) return setInviteError('Todos los campos son obligatorios.');
    try { await endpoints.invite(b); setInvite(false); setInviteError(null); qc.invalidateQueries({ queryKey: ['users'] }); setMsg({ kind: 'success', text: `Usuario "${b.name}" creado correctamente.` }); }
    catch (err) { setInviteError(err instanceof ApiError ? err.message : String(err)); }
  }
  async function remove(id: string, name: string) {
    if (!confirm(`¿Eliminar al usuario "${name}"? Esta acción no se puede deshacer.`)) return;
    try { await endpoints.deleteUser(id); qc.invalidateQueries({ queryKey: ['users'] }); setMsg({ kind: 'success', text: 'Usuario eliminado.' }); }
    catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
  }
  async function activate() {
    try { await endpoints.activateDev(); qc.invalidateQueries({ queryKey: ['billing'] }); setMsg({ kind: 'success', text: 'Suscripción activada en modo desarrollo.' }); }
    catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
  }
  async function loadDemo() {
    try {
      const proc = await endpoints.createProcess({ name: 'Llenado de Envases (Demo)', description: 'Proceso de demostración — Control de volumen de llenado de botellas', unit: 'ml', usl: 505, lsl: 495, nominal: 500 });
      await endpoints.addMeasurements(DEMO.map((value, i) => ({ process_id: proc.id, value, subgroup_id: Math.floor(i / 5) + 1 })));
      qc.invalidateQueries();
      setMsg({ kind: 'success', text: <>Proceso de demostración creado con {DEMO.length} mediciones. <Link to={`/capacidad?process_id=${proc.id}`}>Ver análisis →</Link></> });
    } catch (e) { setMsg({ kind: 'error', text: 'Error al crear datos de demostración: ' + (e as Error).message }); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Administración</h1><p className="lede">Usuarios de la empresa, estado de la suscripción y datos de demostración.</p></div>
        <div className="actions"><button className="btn primary" onClick={() => { setInvite(true); setInviteError(null); }}><Icon name="plus" />Nuevo usuario</button></div></div>
      {msg && <div style={{ marginBottom: 16 }}><Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert></div>}
      <div className="cols cols-2" style={{ marginBottom: 16 }}>
        <section className="sheet">
          <div className="sheet-head"><h2>Suscripción</h2></div>
          <dl className="dl" style={{ margin: 16 }}>
            <div><dt className="label">Estado</dt><dd>{billing.data ? STATUS[billing.data.subscription_status] ?? billing.data.subscription_status : '—'}</dd></div>
            <div><dt className="label">Vence</dt><dd>{billing.data?.subscription_end_date ? new Date(billing.data.subscription_end_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</dd></div>
          </dl>
          <p style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--text-2)' }}>Los pagos están deshabilitados en modo local: no hay conexión con ningún servicio de cobro. El control de suscripción está apagado.</p>
          <div className="actions" style={{ padding: '0 16px 16px' }}>
            <button className="btn" disabled title="Pagos deshabilitados en modo local.">Activar suscripción</button>
            {isLocal && <button className="btn" onClick={activate}>Activar demo (desarrollo)</button>}
          </div>
        </section>
        <section className="sheet">
          <div className="sheet-head"><h2>Datos de demostración</h2></div>
          <p style={{ padding: 16 }}>Crea el proceso «Llenado de Envases (Demo)» (ml, LSI 495, nominal 500, LSE 505) con las 60 mediciones de demostración en 12 subgrupos de 5.</p>
          <div className="actions" style={{ padding: '0 16px 16px' }}><button className="btn" onClick={loadDemo}><Icon name="plus" />Cargar datos de demostración</button></div>
        </section>
      </div>
      <section className="sheet">
        <div className="sheet-head"><h2>Usuarios</h2></div>
        {users.isLoading ? <Loading /> : users.error ? <div className="sheet-body"><Alert>Error al cargar usuarios: {(users.error as Error).message}</Alert></div> : !users.data?.length ? <Empty title="Sin usuarios" /> : (
          <div className="table-wrap"><table className="data stack-sm">
            <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Alta</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{users.data.map(u => <tr key={u.id}>
              <td><b>{u.name}</b>{u.id === user.id && <span className="tag" style={{ marginLeft: 8 }}>Tú</span>}</td>
              <td className="muted">{u.email}</td>
              <td><span className={`tag${u.role === 'admin' ? ' solid' : ''}`}>{u.role === 'admin' ? 'Administrador' : 'Analista'}</span></td>
              <td className="muted">{new Date(u.created_at).toLocaleDateString('es-MX')}</td>
              <td>{u.id !== user.id && <button className="btn sm danger" onClick={() => remove(u.id, u.name)}>Eliminar</button>}</td>
            </tr>)}</tbody>
          </table></div>)}
      </section>
      <Modal open={invite} title="Nuevo usuario" onClose={() => setInvite(false)}
        footer={<><button className="btn" onClick={() => setInvite(false)}>Cancelar</button><button className="btn primary" type="submit" form="invite-form">Crear usuario</button></>}>
        <form id="invite-form" onSubmit={doInvite} noValidate style={{ display: 'grid', gap: 12 }}>
          {inviteError && <Alert>{inviteError}</Alert>}
          <Field label="Nombre"><input className="input" name="name" autoComplete="off" /></Field>
          <Field label="Email"><input className="input" name="email" type="email" autoComplete="off" /></Field>
          <Field label="Contraseña inicial" hint="Mínimo 8 caracteres."><input className="input" name="password" type="password" autoComplete="new-password" /></Field>
          <Field label="Rol"><select className="input" name="role" defaultValue="analyst"><option value="analyst">Analista</option><option value="admin">Administrador</option></select></Field>
        </form>
      </Modal>
    </>
  );
}
