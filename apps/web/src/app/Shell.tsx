import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router';
import { useSession } from './session';
import { Icon } from '../ui/icons';

const NAV = [
  { to: '/', label: 'Panel', end: true },
  { to: '/fase-1', label: 'Fase I' },
  { to: '/capacidad', label: 'Capacidad' },
  { to: '/fase-2', label: 'Fase II' },
  { to: '/muestreo', label: 'Muestreo' },
  { to: '/informes', label: 'Informes' },
  { to: '/datos', label: 'Datos' }
];
const SUB: Record<string, { to: string; label: string }[]> = {
  '/fase-1': [{ to: '/fase-1/procesos', label: 'Procesos' }, { to: '/fase-1/entrada', label: 'Entrada de datos' }, { to: '/fase-1/cartas', label: 'Cartas de control' }],
  '/fase-2': [{ to: '/fase-2/monitoreo', label: 'Monitoreo' }, { to: '/fase-2/desempeno', label: 'Evaluación del desempeño' }]
};

export function Shell() {
  const { user, company, signOut } = useSession();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const section = Object.keys(SUB).find(k => pathname.startsWith(k));
  const keep = (to: string) => {
    const pid = new URLSearchParams(search).get('process_id');
    return pid ? `${to}?process_id=${pid}` : to;
  };
  const initials = user?.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '?';

  return (
    <>
      <header className="bar">
        <Link to="/" className="brand"><i aria-hidden="true" />ControlSkill</Link>
        <nav className="nav" aria-label="Principal">
          {NAV.map(n => <NavLink key={n.to} to={keep(SUB[n.to] ? SUB[n.to]![0]!.to : n.to)} end={n.end}
            className={({ isActive }) => (isActive || (SUB[n.to] && pathname.startsWith(n.to)) ? 'active' : '')}>{n.label}</NavLink>)}
        </nav>
        <div className="bar-right">
          <span className="company">{company?.name}</span>
          <button className="avatar" aria-label={`Menú de ${user?.name ?? 'usuario'}`} aria-expanded={menu} onClick={() => setMenu(m => !m)}>{initials}</button>
          <button className="menu-btn" aria-expanded={mobile} onClick={() => setMobile(m => !m)}><Icon name="menu" />Menú</button>
        </div>
      </header>
      {menu && (
        <div className="user-menu" role="menu" onMouseLeave={() => setMenu(false)}>
          <header><b>{user?.name}</b><span>{user?.role === 'admin' ? 'Administrador' : 'Analista'} · {company?.name}</span></header>
          {user?.role === 'admin' && <Link to="/admin" onClick={() => setMenu(false)} role="menuitem">Administración</Link>}
          <Link to="/manual" onClick={() => setMenu(false)} role="menuitem">Manual del software</Link>
          {/* Al cerrar sesión se vuelve al inicio, y el siguiente acceso abre el Panel */}
          <button onClick={() => { setMenu(false); navigate('/', { replace: true }); signOut(); }} role="menuitem"><Icon name="logout" />Cerrar sesión</button>
        </div>
      )}
      {mobile && (
        <nav className="mobile-nav" aria-label="Principal (móvil)">
          {NAV.flatMap(n => SUB[n.to] ? SUB[n.to]!.map(s => ({ ...s, label: `${n.label} · ${s.label}` })) : [n]).map(n =>
            <NavLink key={n.to} to={keep(n.to)} end={'end' in n} onClick={() => setMobile(false)}>{n.label}</NavLink>)}
          {user?.role === 'admin' && <NavLink to="/admin" onClick={() => setMobile(false)}>Administración</NavLink>}
          <NavLink to="/manual" onClick={() => setMobile(false)}>Manual</NavLink>
        </nav>
      )}
      {section && (
        <nav className="subnav" aria-label="Sección">
          {SUB[section]!.map(s => <NavLink key={s.to} to={keep(s.to)}>{s.label}</NavLink>)}
        </nav>
      )}
      <main className="page"><Outlet /></main>
    </>
  );
}
