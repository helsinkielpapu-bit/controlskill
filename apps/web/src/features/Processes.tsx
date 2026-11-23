// Procesos: lista, alta, edición parcial, detalle y borrado (RF-101…RF-104, DA-02, DA-05).
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { CHART_LABELS, CHART_TYPES, type ChartType, type Process } from '@controlskill/contracts';
import { parseDecimal } from '@controlskill/engine';
import { endpoints, ApiError } from '../app/api';
import { useProcesses } from '../app/process';
import { Alert, Drawer, Empty, Field, Loading, Modal, fmtDate } from '../ui/components';
import { Icon } from '../ui/icons';

const CHART_HELP: Record<ChartType, string> = {
  xbar_r: 'Variables · medias y rangos', xbar_s: 'Variables · medias y desviaciones',
  p: 'Atributos · proporción defectuosa (n variable)', np: 'Atributos · número defectuoso (n fijo)',
  c: 'Atributos · defectos por unidad', u: 'Atributos · defectos por unidad (n variable)'
};

function ProcessForm({ initial, onDone }: { initial: Process | null; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartType>(initial?.chart_type ?? 'xbar_r');
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => initial ? endpoints.updateProcess(initial.id, body) : endpoints.createProcess(body as never),
    onSuccess: () => { qc.invalidateQueries(); onDone(`Proceso ${initial ? 'actualizado' : 'creado'} correctamente.`); },
    onError: e => setError(e instanceof ApiError ? e.message : String(e))
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const num = (k: string, msg: string) => { const raw = s(k); if (!raw) return { v: null }; const v = parseDecimal(raw); return Number.isNaN(v) ? { err: msg } : { v }; };
    const nominal = num('nominal', 'Valor nominal inválido.'), lsl = num('lsl', 'LSI inválido.'), usl = num('usl', 'LSE inválido.');
    const bad = [nominal, lsl, usl].find(x => 'err' in x);
    if (bad && 'err' in bad) return setError(bad.err!);
    if (lsl.v != null && usl.v != null && lsl.v >= usl.v) return setError('LSI debe ser menor que LSE.');
    if (!s('name')) return setError('El nombre es obligatorio.');
    setError(null);
    save.mutate({ name: s('name'), description: s('description'), unit: s('unit'), nominal: nominal.v, lsl: lsl.v, usl: usl.v, chart_type: chart, n_size: s('n_size') || null });
  }

  return (
    <form id="process-form" onSubmit={submit} noValidate style={{ display: 'grid', gap: 14 }}>
      {error && <Alert>{error}</Alert>}
      <Field label="Nombre del proceso *"><input className="input" name="name" defaultValue={initial?.name} placeholder="Ej. Llenado de envases" autoFocus /></Field>
      <Field label="Descripción"><textarea className="input" name="description" rows={2} defaultValue={initial?.description ?? ''} placeholder="Descripción opcional del proceso" /></Field>
      <div className="grid-form">
        <Field label="Unidad de medida"><input className="input" name="unit" defaultValue={initial?.unit ?? ''} placeholder="ml, mm, kg…" /></Field>
        <Field label="Valor nominal"><input className="input" name="nominal" inputMode="decimal" defaultValue={initial?.nominal ?? ''} placeholder="500 o 500,0" /></Field>
        <Field label="LSI · límite inferior"><input className="input" name="lsl" inputMode="decimal" defaultValue={initial?.lsl ?? ''} placeholder="495" /></Field>
        <Field label="LSE · límite superior"><input className="input" name="usl" inputMode="decimal" defaultValue={initial?.usl ?? ''} placeholder="505" /></Field>
      </div>
      <div className="grid-form">
        <Field label="Tipo de carta" hint={CHART_HELP[chart]}>
          <select className="input" value={chart} onChange={e => setChart(e.target.value as ChartType)}>
            {CHART_TYPES.map(t => <option key={t} value={t}>{CHART_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label={chart === 'np' ? 'n · muestra fija' : 'n · tamaño de subgrupo'} hint={chart === 'xbar_r' || chart === 'xbar_s' ? 'Entero de 2 a 10. Opcional.' : chart === 'np' ? 'Necesario para la carta np.' : 'Opcional.'}>
          <input className="input" name="n_size" inputMode="numeric" defaultValue={initial?.n_size ?? ''} />
        </Field>
      </div>
    </form>
  );
}

export default function Processes() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error } = useProcesses();
  const [editing, setEditing] = useState<Process | 'new' | null>(null);
  const [detail, setDetail] = useState<Process | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { if (params.get('nuevo') === '1') { setEditing('new'); setParams(p => { p.delete('nuevo'); return p; }, { replace: true }); } }, [params, setParams]);

  const remove = useMutation({
    mutationFn: (p: Process) => endpoints.deleteProcess(p.id),
    onSuccess: (_r, p) => {
      // Si Monitoreo recordaba una sesión activa de este proceso, se olvida para no ofrecer continuarla.
      try { if (JSON.parse(localStorage.getItem('cs_mon_active') ?? 'null')?.processId === p.id) localStorage.removeItem('cs_mon_active'); } catch { /* sin almacenamiento */ }
      qc.invalidateQueries(); setMsg({ kind: 'success', text: `Proceso "${p.name}" eliminado junto con sus datos.` }); setDetail(null);
    },
    onError: e => setMsg({ kind: 'error', text: (e as Error).message })
  });
  const confirmDelete = (p: Process) => {
    const count = p.measurement_count ? `sus ${p.measurement_count} mediciones (Fase I y Fase II)` : 'sus datos';
    if (confirm(`¿Eliminar el proceso "${p.name}"?\n\nTambién se borrarán ${count}, la evaluación de desempeño guardada y sus sesiones de monitoreo.\n\nEsta acción no se puede deshacer.`)) remove.mutate(p);
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Procesos</h1><p className="lede">Define cada proceso con sus especificaciones, el tipo de carta y el tamaño de subgrupo.</p></div>
        <div className="actions"><button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" />Nuevo proceso</button></div>
      </div>
      {msg && <div style={{ marginBottom: 16 }}><Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert></div>}
      <section className="sheet">
        {isLoading && <Loading />}
        {error && <div className="sheet-body"><Alert>{(error as Error).message}</Alert></div>}
        {data && data.length === 0 && <Empty title="Sin procesos" action={<button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" />Crear el primero</button>}>Crea tu primer proceso para comenzar.</Empty>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table className="data stack-sm">
              <thead><tr><th>Proceso</th><th>Carta</th><th className="num">LSI</th><th className="num">Nominal</th><th className="num">LSE</th><th className="num">Mediciones</th><th className="hide-md">Creado por</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {data.map(p => (
                  <tr key={p.id}>
                    <td className="span"><b>{p.name}</b>{p.unit && <span className="muted"> · {p.unit}</span>}{p.description && <div className="muted">{p.description}</div>}</td>
                    <td><span className="tag">{CHART_LABELS[p.chart_type]}</span>{p.n_size != null && <span className="muted"> n = {p.n_size}</span>}</td>
                    <td className="num">{p.lsl ?? '—'}</td><td className="num">{p.nominal ?? '—'}</td><td className="num">{p.usl ?? '—'}</td>
                    <td className="num">{p.measurement_count}</td>
                    <td className="hide-md muted">{p.created_by_name ?? '—'}</td>
                    <td className="span"><div className="actions" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setDetail(p)}>Detalles</button>
                      <button className="btn sm" onClick={() => setEditing(p)}><Icon name="pen" />Editar</button>
                      <button className="btn sm danger" onClick={() => confirmDelete(p)} aria-label={`Eliminar ${p.name}`} disabled={remove.isPending}><Icon name="trash" />Eliminar</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={editing !== null} title={editing === 'new' ? 'Nuevo proceso' : 'Editar proceso'} onClose={() => setEditing(null)}
        footer={<><button className="btn" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary" type="submit" form="process-form">Guardar proceso</button></>}>
        {editing !== null && <ProcessForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onDone={m => { setEditing(null); setMsg({ kind: 'success', text: m }); }} />}
      </Modal>

      <Drawer open={!!detail} title={detail?.name ?? ''} subtitle={detail ? `${CHART_LABELS[detail.chart_type]} · ${detail.unit ?? 'sin unidad'}` : undefined} onClose={() => setDetail(null)}
        footer={detail && <>
          <Link className="btn primary" to={`/capacidad?process_id=${detail.id}`}>Capacidad</Link>
          <Link className="btn" to={`/fase-2/monitoreo?process_id=${detail.id}`}>Monitoreo</Link>
          <Link className="btn" to={`/datos?process_id=${detail.id}`}>Mediciones</Link>
        </>}>
        {detail && <>
          {detail.description && <p>{detail.description}</p>}
          <dl className="dl">
            <div><dt className="label">Mediciones</dt><dd>{detail.measurement_count ?? 0}</dd></div>
            <div><dt className="label">n</dt><dd>{detail.n_size ?? '—'}</dd></div>
            <div><dt className="label">LSI</dt><dd>{detail.lsl ?? '—'}</dd></div>
            <div><dt className="label">LSE</dt><dd>{detail.usl ?? '—'}</dd></div>
            <div><dt className="label">Nominal</dt><dd>{detail.nominal ?? '—'}</dd></div>
            <div><dt className="label">Creado</dt><dd style={{ fontSize: 14 }}>{fmtDate(detail.created_at)}</dd></div>
          </dl>
          <p className="muted" style={{ color: 'var(--text-2)' }}>Creado por {detail.created_by_name ?? '—'}</p>
        </>}
      </Drawer>
    </>
  );
}
