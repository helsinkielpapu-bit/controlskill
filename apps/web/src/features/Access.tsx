// Acceso: iniciar sesión y registrar empresa (RF-001, RF-002, RF-009).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { endpoints, ApiError } from '../app/api';
import { useSession } from '../app/session';
import { Alert, Field } from '../ui/components';
import { FillLine } from '../ui/FillLine';
import { BlueprintField } from '../ui/BlueprintField';
import { SensorChart, useSensorReadings } from '../ui/SensorChart';
import { CapabilityLive } from '../ui/CapabilityLive';

/** Cotas del bloque del formulario: su ancho y alto reales en pantalla, en mm a 96 ppp (escala 1:1). */
function FormDims({ box }: { box: React.RefObject<HTMLDivElement | null> }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  if (!size) return null;
  const mm = (px: number) => (px * 25.4 / 96).toFixed(1);
  return <>
    <div className="tb-dim h" aria-hidden="true"><span>{mm(size.w)}</span></div>
    <div className="tb-dim v" aria-hidden="true"><span>{mm(size.h)}</span></div>
  </>;
}

export function Access() {
  const { signIn, expired } = useSession();
  const [tab, setTab] = useState<'login' | 'register'>(new URLSearchParams(location.search).get('register') === '1' ? 'register' : 'login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readings, pushReading] = useSensorReadings();
  const [stamp, setStamp] = useState<{ kind: 'ok' | 'bad'; n: number } | null>(null);
  const stampTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const formBox = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(stampTimer.current), []);
  const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    setError(null);
    clearTimeout(stampTimer.current);
    setStamp(null);
    if (tab === 'register' && (!get('company_name').trim() || !get('name').trim())) return setError('Por favor completa todos los campos.');
    setBusy(true);
    try {
      const session = tab === 'login'
        ? await endpoints.login(get('email').trim(), get('password'))
        : await endpoints.register({ company_name: get('company_name').trim(), name: get('name').trim(), email: get('email').trim(), password: get('password') });
      // Sello de control de calidad y, tras el golpe, entrada al sistema.
      setStamp({ kind: 'ok', n: Date.now() });
      stampTimer.current = setTimeout(() => signIn(session), matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 950);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tab === 'login' ? 'Error al iniciar sesión.' : 'Error al registrar la empresa.');
      setStamp({ kind: 'bad', n: Date.now() });
      // Temblor breve del bloque (sin volver a montar el formulario, para no borrar lo escrito)
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) formBox.current?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
        { duration: 340, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      stampTimer.current = setTimeout(() => setStamp(null), 2200);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-side">
        <BlueprintField />
        <div className="brand"><i aria-hidden="true" />ControlSkill</div>
        <div className="auth-head">
          <h1>Control de procesos estadísticos</h1>
          <p>Fase I, capacidad, monitoreo en Fase II, desempeño de la carta y planes de muestreo en un solo lugar, con el método visible junto a cada resultado.</p>
        </div>
        <SensorChart data={readings} />
        <CapabilityLive data={readings} />
        <FillLine onReading={pushReading} />
      </section>
      <section className="auth-main">
        <div className="sheet-frame" aria-hidden="true">
          {(['top', 'bottom'] as const).map(side => <div key={side} className={`zones ${side}`}>{'ABCDEF'.split('').map(z => <span key={z}>{z}</span>)}</div>)}
          {(['left', 'right'] as const).map(side => <div key={side} className={`zones ${side}`}>{'123456'.split('').map(z => <span key={z}>{z}</span>)}</div>)}
        </div>
        <div className="tb-form" ref={formBox}>
          <FormDims box={formBox} />
          <div className="tb-head" aria-hidden="true"><span>Acceso al sistema</span><span>Doc. CS-ACC-01</span></div>
          <div className="tb-body">
        <div className="seg" role="tablist" aria-label="Acceso">
          <button role="tab" aria-pressed={tab === 'login'} aria-selected={tab === 'login'} onClick={() => { setTab('login'); setError(null); }}>Iniciar sesión</button>
          <button role="tab" aria-pressed={tab === 'register'} aria-selected={tab === 'register'} onClick={() => { setTab('register'); setError(null); }}>Registrar empresa</button>
        </div>
        <h2 style={{ fontSize: 26 }}>{tab === 'login' ? 'Bienvenido de nuevo' : 'Crea la cuenta de tu empresa'}</h2>
        {expired && !error && <Alert kind="warning">Tu sesión ha expirado. Por favor vuelve a iniciar sesión.</Alert>}
        {error && <Alert>{error}</Alert>}
        <form onSubmit={submit} key={tab} noValidate>
          {tab === 'register' && <>
            <Field label="Empresa"><input className="input" name="company_name" autoComplete="organization" required /></Field>
            <Field label="Tu nombre"><input className="input" name="name" autoComplete="name" required /></Field>
          </>}
          <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
          <Field label="Contraseña" hint={tab === 'register' ? 'Mínimo 8 caracteres.' : undefined}>
            <input className="input" name="password" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
          </Field>
          <button className="btn primary" disabled={busy} style={{ height: 44 }}>
            {busy ? (tab === 'login' ? 'Verificando…' : 'Creando cuenta…') : tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
        {tab === 'register' && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Quien registra la empresa queda como administrador y puede invitar a su equipo.</p>}
          </div>
          {stamp && (
            <div key={stamp.n} className={`qc-stamp ${stamp.kind}`} role={stamp.kind === 'ok' ? 'status' : undefined} aria-hidden={stamp.kind === 'bad' || undefined}>
              <b>{stamp.kind === 'ok' ? 'Aprobado' : 'No conforme'}</b>
              <span>{stamp.kind === 'ok' ? 'Conforme · Control de calidad' : 'Revisar y repetir'}</span>
            </div>
          )}
        </div>
        <table className="cajetin" aria-hidden="true">
          <tbody>
            <tr><td colSpan={2} className="cj-brand">ControlSkill<small>Control estadístico de procesos</small></td><td colSpan={2}><small>Título</small>Acceso al sistema</td></tr>
            <tr><td><small>Hoja</small>1/1</td><td><small>Escala</small>1:1</td><td><small>Rev.</small>A</td><td><small>Fecha</small>{today}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
