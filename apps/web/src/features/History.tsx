// Historial de datos (RF-301…RF-303).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { endpoints } from '../app/api';
import { useActiveProcess, ProcessPicker } from '../app/process';
import { Alert, Empty, Loading, fmtDate } from '../ui/components';
import { Icon } from '../ui/icons';

const PAGE = 100;
type Phase = 'all' | '1' | '2';

export default function History() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { processId, process, processes, select } = useActiveProcess();
  const phase = (['all', '1', '2'].includes(params.get('phase') ?? '') ? params.get('phase') : 'all') as Phase;
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useQuery({ queryKey: ['measurements', processId, phase, page], enabled: !!processId, queryFn: () => endpoints.measurements(processId!, { limit: PAGE, offset: page * PAGE, phase }) });
  const setPhase = (p: Phase) => { setParams(x => { x.set('phase', p); return x; }); setPage(0); setSelected(new Set()); };
  const toggle = (id: string, on: boolean) => setSelected(s => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
  const rows = list.data?.data ?? [];
  const allOn = rows.length > 0 && rows.every(r => selected.has(r.id));

  async function afterDelete(text: string, kind: 'success' | 'warning' = 'success') { await qc.invalidateQueries(); setMsg({ kind, text }); }
  async function deleteOne(id: string) {
    if (!confirm('¿Eliminar esta medición?')) return;
    try { await endpoints.deleteMeasurement(id); setSelected(s => { const n = new Set(s); n.delete(id); return n; }); await afterDelete('Medición eliminada.'); }
    catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
  }
  async function deleteSelected() {
    const ids = [...selected]; if (!ids.length) return;
    if (!confirm(`¿Eliminar ${ids.length} medición${ids.length !== 1 ? 'es' : ''} seleccionada${ids.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    try {
      const r = await endpoints.deleteMeasurements(ids);
      setSelected(new Set());
      await afterDelete(r.failed ? `Eliminadas ${r.deleted} mediciones. ${r.failed} no pudieron eliminarse.` : `${r.deleted} medición${r.deleted !== 1 ? 'es' : ''} eliminada${r.deleted !== 1 ? 's' : ''} correctamente.`, r.failed ? 'warning' : 'success');
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setBusy(false); }
  }
  async function deletePhaseTwo() {
    if (!processId || !confirm(`¿Eliminar TODOS los datos de monitoreo (Fase 2) de este proceso?\n\nTotal: ${list.data?.total ?? 0} mediciones.\n\nEsta acción no se puede deshacer.`)) return;
    setBusy(true);
    try { const r = await endpoints.deletePhaseTwo(processId); setSelected(new Set()); await afterDelete(`${r.deleted} mediciones de Fase 2 eliminadas.`); }
    catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setBusy(false); }
  }

  const total = list.data?.total ?? 0, pages = Math.max(1, Math.ceil(total / PAGE));
  const specs = process ? [process.lsl != null && `LSI ${process.lsl}`, process.nominal != null && `Nominal ${process.nominal}`, process.usl != null && `LSE ${process.usl}`].filter(Boolean).join(' · ') : '';

  return (
    <>
      <div className="page-head"><div><h1>Historial de datos</h1><p className="lede">Todas las mediciones guardadas, por fase. Desde aquí se corrigen errores de captura.</p></div></div>
      <div className="sheet" style={{ marginBottom: 16 }}>
        <div className="sheet-body toolbar">
          <ProcessPicker value={processId} processes={processes} onChange={id => { select(id); setPage(0); setSelected(new Set()); }} />
          <div className="field"><span>Fase</span>
            <div className="seg">{([['all', 'Todas'], ['1', 'Fase 1'], ['2', 'Fase 2']] as const).map(([v, l]) => <button key={v} aria-pressed={phase === v} onClick={() => setPhase(v)}>{l}</button>)}</div></div>
          {specs && <span style={{ color: 'var(--text-2)', fontSize: 14, alignSelf: 'center' }}>{specs} {process?.unit ?? ''}</span>}
        </div>
      </div>
      {msg && <div style={{ marginBottom: 16 }}><Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert></div>}
      {!processId && <section className="sheet"><Empty title="Selecciona un proceso">Elige un proceso para ver sus mediciones.</Empty></section>}
      {processId && (
        <section className="sheet">
          <div className="sheet-head">
            <h2>{total} {phase === 'all' ? 'mediciones en total' : phase === '1' ? 'mediciones de Fase 1' : 'mediciones de Fase 2'}</h2>
            <div className="actions">
              {selected.size > 0 && <><span style={{ alignSelf: 'center', fontSize: 14 }}>{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
                <button className="btn sm danger" disabled={busy} onClick={deleteSelected}><Icon name="trash" />{busy ? 'Eliminando…' : 'Eliminar seleccionadas'}</button>
                <button className="btn sm" onClick={() => setSelected(new Set())}>Deseleccionar</button></>}
              {phase === '2' && total > 0 && <button className="btn sm danger" disabled={busy} onClick={deletePhaseTwo}><Icon name="trash" />Eliminar Fase 2 de este proceso</button>}
            </div>
          </div>
          {list.isLoading && <Loading />}
          {list.error && <div className="sheet-body"><Alert>Error al obtener las mediciones: {(list.error as Error).message}</Alert></div>}
          {list.data && rows.length === 0 && <Empty title="Sin mediciones">{phase === '2' ? 'No hay datos de monitoreo (Fase 2). Ingresa desde Monitoreo.' : phase === '1' ? 'No hay datos históricos (Fase 1). Ingresa desde Entrada de datos.' : 'No hay mediciones para este proceso.'}</Empty>}
          {rows.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 620 }}>
              <table className="data dense">
                <thead><tr>
                  <th style={{ width: 40 }}><input type="checkbox" aria-label="Seleccionar la página" checked={allOn} onChange={e => rows.forEach(r => toggle(r.id, e.target.checked))} /></th>
                  <th className="num">#</th><th>Fase</th><th className="num">Valor</th><th>Subgrupo</th><th className="num hide-sm">n</th><th>Fecha y hora</th><th className="hide-md">Registrado por</th><th><span className="sr-only">Eliminar</span></th>
                </tr></thead>
                <tbody>{rows.map((m, i) => (
                  <tr key={m.id} aria-selected={selected.has(m.id)}>
                    <td><input type="checkbox" aria-label={`Seleccionar medición ${page * PAGE + i + 1}`} checked={selected.has(m.id)} onChange={e => toggle(m.id, e.target.checked)} /></td>
                    <td className="num muted">{page * PAGE + i + 1}</td>
                    <td><span className={`tag${m.phase === 2 ? ' solid' : ''}`}>Fase {m.phase}</span></td>
                    <td className="num"><b>{m.value.toFixed(4)}</b></td>
                    <td>{m.subgroup_id != null ? `SG ${m.subgroup_id}` : '—'}</td>
                    <td className="num hide-sm muted">{m.sample_size ?? '—'}</td>
                    <td className="muted">{fmtDate(m.recorded_at)}</td>
                    <td className="hide-md muted">{m.recorded_by_name ?? '—'}</td>
                    <td><button className="btn sm icon danger" onClick={() => deleteOne(m.id)} aria-label="Eliminar medición"><Icon name="x" size={14} /></button></td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          <div className="sheet-foot">
            <div className="actions" style={{ alignItems: 'center' }}>
              <button className="btn sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button>
              <span>Página {page + 1} de {pages}</span>
              <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
            </div>
            {selected.size > 0 && <span>{selected.size} seleccionada(s) en total (todas las páginas)</span>}
          </div>
        </section>
      )}
    </>
  );
}
