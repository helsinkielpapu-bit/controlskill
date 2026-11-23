// Componentes compartidos del sistema «Hoja de plano».
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/**
 * Protege la notación estadística en rótulos en versalitas y títulos estrechos:
 * σ no debe volverse Σ, ni d₂ D₂, y la x̄ usa la fuente que dibuja bien el macrón.
 */
const SYMBOLS = /(σ̂?w?|σ|[xX]̄|R̄|S̄|μ₀|μ₁|Cp[kul]?|d₂|c₄|δ|α|β)/;
export function sym(t: ReactNode): ReactNode {
  if (typeof t !== 'string' || !SYMBOLS.test(t)) return t;
  return t.split(new RegExp(SYMBOLS.source, 'g')).map((part, i) => (i % 2 ? <span key={i} className="sym">{part}</span> : part));
}

export type Status ='capaz' | 'marginal' | 'no_capaz' | 'sin_datos';
export const STATUS_CLASS: Record<Status, 'ok' | 'warn' | 'bad' | 'none'> = { capaz: 'ok', marginal: 'warn', no_capaz: 'bad', sin_datos: 'none' };
export const STATUS_WORD: Record<Status, string> = { capaz: 'Capaz', marginal: 'Marginal', no_capaz: 'No capaz', sin_datos: 'Sin datos' };
const STATUS_ICON: Record<Status, IconName> = { capaz: 'check', marginal: 'half', no_capaz: 'x', sin_datos: 'dash' };

/** Etiqueta de Cpk según su valor. */
export const cpkLabel = (cpk: number | null | undefined) => cpk == null ? 'Sin datos' : cpk >= 1.33 ? 'Capaz' : cpk >= 1.0 ? 'Marginalmente capaz' : 'No capaz';
export const statusOf = (cpk: number | null | undefined): Status => cpk == null ? 'sin_datos' : cpk >= 1.33 ? 'capaz' : cpk >= 1.0 ? 'marginal' : 'no_capaz';

export function StatusMark({ status, label }: { status: Status; label?: string }) {
  return <span className={`state ${STATUS_CLASS[status]}`}><Icon name={STATUS_ICON[status]} />{label ?? STATUS_WORD[status]}</span>;
}

/** Marco de control tipo GD&T: «Cpk │ 0.841». */
export function ControlFrame({ label, value, digits = 3, status, large }: { label: string; value: number | null | undefined; digits?: number; status?: Status; large?: boolean }) {
  const s = status ?? 'sin_datos';
  return (
    <span className={`fcf${large ? ' lg' : ''}${value == null ? ' muted' : ''}`}>
      <b>{label}</b><i className={value == null ? 'none' : STATUS_CLASS[s]}>{value == null ? '—' : value.toFixed(digits)}</i>
    </span>
  );
}

export function Alert({ kind = 'error', children, onClose }: { kind?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode; onClose?: () => void }) {
  const icon: IconName = kind === 'success' ? 'check' : kind === 'info' ? 'info' : 'alert';
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} /><div className="grow">{children}</div>
      {onClose && <button className="x" style={{ width: 26, height: 26 }} onClick={onClose} aria-label="Cerrar aviso"><Icon name="x" size={14} /></button>}
    </div>
  );
}

export const Loading = ({ text = 'Cargando…' }: { text?: string }) => <div className="loading"><span className="spinner" />{text}</div>;

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children && <div>{children}</div>}{action}</div>;
}

export function Figure({ label, value, unit, sub, tone, large }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; tone?: string; large?: boolean }) {
  return (
    <div className="figure">
      <dt className="label"><span>{sym(label)}</span></dt>
      <dd><span className={`n${large ? ' lg' : ''} ${tone ?? ''}`}>{value}</span>{unit && <span className="unit">{unit}</span>}</dd>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function Drawer({ open, title, subtitle, onClose, children, footer }: { open: boolean; title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <aside className="drawer" data-open={open} aria-hidden={!open} aria-label={title}>
      <div className="drawer-head"><div><h2>{title}</h2>{subtitle && <div className="muted" style={{ color: 'var(--text-2)', fontSize: 13 }}>{subtitle}</div>}</div>
        <button ref={closeRef} className="x" onClick={onClose} aria-label="Cerrar detalle"><Icon name="x" /></button></div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </aside>
  );
}

export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose} aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <label className="field"><span>{sym(label)}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export const fmt = (v: number | null | undefined, d = 4) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));
export const fmtDate = (v: string | null | undefined) => v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const decimalsOf = (...vals: (number | null | undefined)[]) =>
  Math.min(4, Math.max(0, ...vals.filter((v): v is number => v != null).map(v => (String(v).split('.')[1] ?? '').length)));
