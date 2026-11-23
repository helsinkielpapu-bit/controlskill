// Entrada de datos de Fase I (RF-201…RF-210, DA-03, DA-07).
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import * as XLSX from 'xlsx';
import { CHART_LABELS, type ChartType } from '@controlskill/contracts';
import { parseDecimal, parseExcelCell, mean, stdDev, calculateXbarR, calculateXbarS, sigmaWithin,
  calculatePChart, calculateNPChart, calculateCChart, calculateUChart, type AttributeSeries } from '@controlskill/engine';
import { endpoints } from '../app/api';
import { useActiveProcess, ProcessPicker } from '../app/process';
import { Alert, Empty, Field, Figure, Modal, fmt, sym } from '../ui/components';
import { Icon } from '../ui/icons';

const INIT_ROWS = 25;
type AttrType = 'p' | 'np' | 'c' | 'u';
const blank = (n: number) => Array<string>(n).fill('');
const isNum = (s: string) => s.trim() !== '' && !Number.isNaN(parseDecimal(s));
/** DA-21: un tamaño de muestra válido es un entero ≥ 1. */
const isSize = (s: string) => /^\s*\d+\s*$/.test(s) && parseInt(s) >= 1;

function rowStats(row: string[], n: number) {
  const valid = row.filter(v => v.trim()).map(parseDecimal).filter(v => !Number.isNaN(v));
  if (!valid.length) return { state: 'empty' as const };
  if (valid.length !== n) return { state: 'partial' as const };
  const xbar = mean(valid);
  return { state: 'complete' as const, values: valid, xbar, r: Math.max(...valid) - Math.min(...valid), s: stdDev(valid) };
}

export default function DataEntry() {
  const qc = useQueryClient();
  const { processId, process, processes, select } = useActiveProcess();
  const variableProcess = !process || process.chart_type === 'xbar_r' || process.chart_type === 'xbar_s';
  const [tab, setTab] = useState<'variable' | 'attribute'>('variable');
  const [n, setN] = useState(5);
  const [rows, setRows] = useState<string[][]>(() => Array.from({ length: INIT_ROWS }, () => blank(5)));
  const [attrType, setAttrType] = useState<AttrType>('p');
  const [npN, setNpN] = useState('50');
  const [attrRows, setAttrRows] = useState<{ n: string; count: string }[]>(() => Array.from({ length: INIT_ROWS }, () => ({ n: '', count: '' })));
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'warning'; text: React.ReactNode } | null>(null);
  const [saving, setSaving] = useState(false);
  const [help, setHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const existing = useQuery({ queryKey: ['measurements', processId, 'count'], enabled: !!processId, queryFn: () => endpoints.measurements(processId!, { limit: 1, phase: '1' }) });

  // Al cambiar de proceso: tabla limpia y pestaña según su carta
  useEffect(() => {
    if (!process) return;
    const variable = process.chart_type === 'xbar_r' || process.chart_type === 'xbar_s';
    setTab(variable ? 'variable' : 'attribute');
    if (!variable) setAttrType(process.chart_type as AttrType);
    if (process.chart_type === 'np' && process.n_size) setNpN(String(process.n_size));
    const size = variable && process.n_size && process.n_size >= 2 && process.n_size <= 10 ? process.n_size : 5;
    setN(size);
    setRows(Array.from({ length: INIT_ROWS }, () => blank(size)));
    setAttrRows(Array.from({ length: INIT_ROWS }, () => ({ n: '', count: '' })));
    setMsg(null);
  }, [process?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const variableChart: 'xbar_r' | 'xbar_s' = process?.chart_type === 'xbar_s' ? 'xbar_s' : 'xbar_r';
  const stats = useMemo(() => rows.map(r => rowStats(r, n)), [rows, n]);
  const complete = stats.filter(s => s.state === 'complete') as Extract<ReturnType<typeof rowStats>, { state: 'complete' }>[];

  /** DA-07: vista previa con el motor único. */
  const preview = useMemo(() => {
    if (complete.length < 2) return null;
    const groups = complete.map(c => c.values);
    if (variableChart === 'xbar_s') {
      const c = calculateXbarS(groups);
      return { main: c.xbar, sec: c.s, secLabel: 'S', disp: c.s.cl, dispLabel: 'S̄ (desv. media)', sigma: sigmaWithin(groups, 'xbar_s'), sigmaLabel: 'σ̂ = S̄/c₄' };
    }
    const c = calculateXbarR(groups);
    return { main: c.xbar, sec: c.r, secLabel: 'R', disp: c.r.cl, dispLabel: 'R̄ (rango medio)', sigma: sigmaWithin(groups, 'xbar_r'), sigmaLabel: 'σ̂ = R̄/d₂' };
  }, [complete, variableChart]);

  const flags = useMemo(() => {
    const map = new Map<number, { x: boolean; d: boolean }>();
    if (!preview) return map;
    let k = 0;
    stats.forEach((s, i) => {
      if (s.state !== 'complete') return;
      const xv = preview.main.points[k]!, dv = preview.sec.points[k]!; k++;
      map.set(i, { x: xv > preview.main.ucl || xv < preview.main.lcl, d: dv > preview.sec.ucl });
    });
    return map;
  }, [preview, stats]);
  const signals = [...flags.values()].filter(f => f.x || f.d).length;

  // ── Atributos ─────────────────────────────────────────────
  const needsN = attrType === 'p' || attrType === 'u';
  const attrFilled = attrRows.map((r, i) => ({ ...r, i })).filter(r => isNum(r.count));
  const attrPreview = useMemo((): (AttributeSeries & { flags: boolean[] }) | null => {
    if (attrFilled.length < 2) return null;
    const cnt = attrFilled.map(r => parseDecimal(r.count));
    let s: AttributeSeries;
    if (attrType === 'p' || attrType === 'u') {
      const ns = attrFilled.map(r => (isNum(r.n) ? parseDecimal(r.n) : 0));
      if (ns.every(v => v === 0)) return null;
      s = attrType === 'p' ? calculatePChart(cnt.map((d, i) => ({ defectives: d, n: ns[i]! }))).p : calculateUChart(cnt.map((c, i) => ({ count: c, n: ns[i]! }))).u;
    } else if (attrType === 'np') s = calculateNPChart(cnt.map(d => ({ defectives: d })), parseInt(npN) || 50).np;
    else s = calculateCChart(cnt.map(c => ({ count: c }))).c;
    const flags = s.points.map((v, i) => { const l = s.pointLimits?.[i]; return v > (l?.ucl ?? s.ucl) || v < (l?.lcl ?? s.lcl); });
    return { ...s, flags };
  }, [attrFilled, attrType, npN]);

  // ── Edición de la rejilla variable ─────────────────────────
  const setCell = (r: number, c: number, v: string) => setRows(prev => {
    const next = prev.map(row => [...row]);
    next[r]![c] = v;
    if (r === next.length - 1 && v.trim()) for (let i = 0; i < 5; i++) next.push(blank(n));
    return next;
  });
  const focusCell = (r: number, c: number) => {
    const el = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${Math.max(0, Math.min(r, rows.length - 1))}"][data-c="${Math.max(0, Math.min(c, n - 1))}"]`);
    el?.focus(); el?.select();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const el = e.currentTarget;
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); c + 1 < n ? focusCell(r, c + 1) : focusCell(r + 1, 0); }
    else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focusCell(r + 1, c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(r - 1, c); }
    else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && c + 1 < n) { e.preventDefault(); focusCell(r, c + 1); }
    else if (e.key === 'ArrowLeft' && el.selectionStart === 0 && c > 0) { e.preventDefault(); focusCell(r, c - 1); }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, r0: number, c0: number) => {
    e.preventDefault();
    const lines = e.clipboardData.getData('text').replace(/\r/g, '').split('\n').filter(l => l.trim());
    setRows(prev => {
      const next = prev.map(row => [...row]);
      lines.forEach((line, ri) => {
        while (next.length <= r0 + ri) next.push(blank(n));
        line.split(/\t|;/).map(v => v.trim()).forEach((v, ci) => { if (c0 + ci < n) next[r0 + ri]![c0 + ci] = v; });
      });
      return next;
    });
  };
  const changeN = (newN: number) => {
    if (newN < n && rows.some(r => r.some(v => v.trim())) && !confirm(`Reducir n de ${n} a ${newN} eliminará las columnas X${newN + 1}–X${n}. ¿Continuar?`)) return;
    setRows(prev => prev.map(r => (r.length < newN ? [...r, ...blank(newN - r.length)] : r.slice(0, newN))));
    setN(newN);
  };
  const clearAll = () => {
    const has = tab === 'attribute' ? attrRows.some(r => r.count.trim()) : rows.some(r => r.some(v => v.trim()));
    if (has && !confirm('¿Limpiar toda la tabla? Los datos no guardados se perderán.')) return;
    setRows(Array.from({ length: INIT_ROWS }, () => blank(n)));
    setAttrRows(Array.from({ length: INIT_ROWS }, () => ({ n: '', count: '' })));
    setMsg(null);
  };

  // ── Importar Excel (navegador; formatos A y B) ─
  async function importFile(file: File) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: '', raw: true });
      if (!raw.length) return alert('El archivo está vacío.');
      const first = raw[0]!.map(v => String(v).trim());
      const isHeader = first.every(v => v === '' || Number.isNaN(parseExcelCell(v)));
      const data = (isHeader ? raw.slice(1) : raw).filter(r => r.some(c => c !== '' && c != null));
      if (!data.length) return alert('No se encontraron filas de datos en el archivo.');
      const colCount = Math.max(...data.map(r => r.map(v => String(v).trim()).reduceRight((acc, v, i) => (acc === -1 && v !== '' ? i : acc), -1) + 1));
      let groups: string[][], size: number;
      if (colCount === 1) {
        const ans = prompt(`El archivo tiene 1 columna de datos.\n¿Cuántas observaciones por subgrupo? (n actual: ${n})`, String(n));
        size = parseInt(ans ?? '');
        if (!size || size < 2 || size > 10) return alert('n debe estar entre 2 y 10.');
        const all = data.map(r => String(r[0] ?? '').replace(',', '.').trim()).filter(v => v !== '' && !Number.isNaN(parseFloat(v)));
        groups = [];
        for (let i = 0; i + size <= all.length; i += size) groups.push(all.slice(i, i + size));
        if (!groups.length) return alert('No hay suficientes datos para formar un subgrupo.');
      } else {
        size = Math.min(Math.max(colCount, 2), 10);
        groups = data.map(r => Array.from({ length: size }, (_, i) => (r[i] != null ? String(r[i]).replace(',', '.').trim() : '')));
      }
      setN(size);
      const next = groups.map(g => Array.from({ length: size }, (_, i) => g[i] ?? ''));
      while (next.length < INIT_ROWS) next.push(blank(size));
      setRows(next);
      setMsg({ kind: 'success', text: <>Se importaron <b>{groups.length} subgrupos</b> con n = {size}. Revisa los datos y pulsa <b>Guardar en el proceso</b> cuando estés listo.</> });
    } catch (err) { alert(`Error al leer el archivo: ${(err as Error).message}`); }
  }
  function downloadTemplate() {
    const headers = Array.from({ length: n }, (_, i) => `x${i + 1}`);
    const ex = Array.from({ length: 10 }, () => Array.from({ length: n }, () => (10 + Math.random()).toFixed(3)));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...ex]), 'Datos');
    XLSX.writeFile(wb, `plantilla_fase1_n${n}.xlsx`);
  }

  // ── Guardar (DA-03: ids a continuación del máximo existente) ─
  async function save() {
    if (!processId || !process) return alert('Selecciona un proceso primero.');
    setMsg(null);
    if (tab === 'attribute') {
      const valid = attrRows.filter(r => isNum(r.count) && parseDecimal(r.count) >= 0);
      if (!valid.length) return alert('La tabla está vacía. Ingresa datos primero.');
      // DA-21: n debe ser un entero ≥ 1
      const badN = attrRows.map((r, i) => (isNum(r.count) && r.n.trim() && !isSize(r.n) ? i + 1 : 0)).filter(Boolean);
      if (attrType === 'np' && !isSize(npN)) return alert('El n de la muestra fija debe ser un número entero mayor o igual a 1.');
      if (badN.length) return alert(`El tamaño de muestra (n) debe ser un número entero mayor o igual a 1. Revisa los subgrupos: ${badN.join(', ')}.`);
      if (!confirm(`Se guardarán ${valid.length} subgrupos de datos (${CHART_LABELS[attrType]}).`)) return;
      const fixed = attrType === 'np' ? (parseInt(npN) || null) : null;
      setSaving(true);
      try {
        const { next } = await endpoints.nextSubgroup(processId, 1);
        const r = await endpoints.addMeasurements(valid.map((row, i) => ({ process_id: processId, value: parseDecimal(row.count), subgroup_id: next + i, sample_size: fixed ?? (isNum(row.n) ? parseDecimal(row.n) : null) })));
        setMsg({ kind: 'success', text: <><b>{r.inserted}</b> registros guardados en <b>{valid.length}</b> subgrupos. <Link to={`/fase-1/cartas?process_id=${processId}`}>Ver carta →</Link></> });
        qc.invalidateQueries();
      } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setSaving(false); }
      return;
    }
    const partial = stats.map((s, i) => (s.state === 'partial' ? i + 1 : 0)).filter(Boolean);
    if (!complete.length && !partial.length) return alert('La tabla está vacía. Ingresa mediciones primero.');
    const { usl, lsl } = process;
    const oos = stats.map((s, i) => (s.state === 'complete' && s.values.some(v => (usl != null && v > usl) || (lsl != null && v < lsl)) ? i + 1 : 0)).filter(Boolean);
    let text = `Se guardarán ${complete.length * n} mediciones en ${complete.length} subgrupos.`;
    if (partial.length) text += `\n\nSubgrupos INCOMPLETOS (se omitirán): ${partial.join(', ')}`;
    if (oos.length) text += `\n\n⚠ ADVERTENCIA: los subgrupos ${oos.join(', ')} tienen valores FUERA de especificación${lsl != null ? ` (LSI=${lsl}` : ''}${usl != null ? (lsl != null ? `, LSE=${usl})` : ` (LSE=${usl})`) : ')'}.\nVerifica que los datos sean correctos antes de guardar.`;
    if (!confirm(text)) return;
    if (!complete.length) return alert('No hay subgrupos completos para guardar.');
    setSaving(true);
    try {
      const { next } = await endpoints.nextSubgroup(processId, 1);
      const items = complete.flatMap((c, k) => c.values.map(v => ({ process_id: processId, value: v, subgroup_id: next + k })));
      const r = await endpoints.addMeasurements(items);
      setMsg({ kind: 'success', text: <><b>{r.inserted}</b> mediciones guardadas en <b>{complete.length}</b> subgrupos (SG {next}–{next + complete.length - 1}). <Link to={`/fase-1/cartas?process_id=${processId}`}>Ver carta de control →</Link> <Link to={`/capacidad?process_id=${processId}`}>Ver capacidad →</Link></> });
      qc.invalidateQueries();
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setSaving(false); }
  }

  const chartMismatch = process && tab === 'attribute' && process.chart_type !== attrType;

  return (
    <>
      <div className="page-head">
        <div><h1>Entrada de datos</h1><p className="lede">Mediciones de Fase I por subgrupo. Tab o Enter para avanzar; pega directamente desde Excel.</p></div>
        <div className="actions">
          <button className="btn" onClick={clearAll} disabled={!processId}><Icon name="refresh" />Nuevo ingreso</button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!processId || tab !== 'variable'}><Icon name="upload" />Importar Excel</button>
          <button className="btn icon" onClick={() => setHelp(true)} aria-label="Cómo preparar el archivo Excel" title="Cómo preparar el archivo Excel">?</button>
          <button className="btn primary" onClick={save} disabled={!processId || saving}><Icon name="save" />{saving ? 'Guardando…' : 'Guardar en el proceso'}</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
        </div>
      </div>

      <div className="sheet" style={{ marginBottom: 16 }}>
        <div className="sheet-body toolbar">
          <ProcessPicker value={processId} processes={processes} onChange={select} />
          <div className="seg" role="tablist" aria-label="Tipo de datos" style={{ alignSelf: 'end' }}>
            <button aria-pressed={tab === 'variable'} onClick={() => setTab('variable')}>Variables (X̄-R, X̄-S)</button>
            <button aria-pressed={tab === 'attribute'} onClick={() => setTab('attribute')}>Atributos (p, np, c, u)</button>
          </div>
          {tab === 'variable' ? (
            <Field label="n · tamaño de subgrupo">
              <select className="input" value={n} onChange={e => changeN(parseInt(e.target.value))} style={{ width: 90 }}>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
          ) : (<>
            <Field label="Tipo de carta">
              <select className="input" value={attrType} onChange={e => { setAttrType(e.target.value as AttrType); setAttrRows(Array.from({ length: INIT_ROWS }, () => ({ n: '', count: '' }))); }}>
                <option value="p">Carta p — proporción de defectivos (n variable)</option>
                <option value="np">Carta np — número de defectivos (n fijo)</option>
                <option value="c">Carta c — número de defectos por unidad</option>
                <option value="u">Carta u — defectos por unidad (n variable)</option>
              </select>
            </Field>
            {attrType === 'np' && <Field label="n · muestra fija" hint="Mismo n para todos los subgrupos."><input className="input" style={{ width: 110 }} inputMode="numeric" value={npN} onChange={e => setNpN(e.target.value)} /></Field>}
          </>)}
        </div>
      </div>

      {!processId && <section className="sheet"><Empty title="Selecciona un proceso">Elige el proceso al que pertenecen las mediciones.</Empty></section>}
      {msg && <div style={{ marginBottom: 16 }}><Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert></div>}
      {processId && existing.data && existing.data.total > 0 && (
        <div style={{ marginBottom: 16 }}><Alert kind="info">
          Este proceso ya tiene {existing.data.total} mediciones guardadas{existing.data.subgroups ? ` en ${existing.data.subgroups} subgrupos` : ''}. Los nuevos subgrupos se numeran a continuación.{' '}
          <Link to={`/datos?process_id=${processId}`}>Historial</Link> · <Link to={`/fase-1/cartas?process_id=${processId}`}>Carta de control</Link> · <Link to={`/capacidad?process_id=${processId}`}>Capacidad</Link>
        </Alert></div>
      )}
      {processId && tab === 'variable' && !variableProcess && <div style={{ marginBottom: 16 }}><Alert kind="warning">Este proceso está configurado con {CHART_LABELS[process!.chart_type]}. Las mediciones por variables se analizarán solo si cambias su tipo de carta en Procesos.</Alert></div>}
      {chartMismatch && <div style={{ marginBottom: 16 }}><Alert kind="warning">El proceso está configurado como {CHART_LABELS[process!.chart_type]}. El informe y la evaluación del desempeño usan esa carta; cámbiala en Procesos si estos datos son de {CHART_LABELS[attrType]}.</Alert></div>}

      {processId && tab === 'variable' && (
        <div className="cols cols-side">
          <section className="sheet" aria-label="Vista previa de la carta">
            <div className="sheet-head"><h2>{sym(`Vista previa · ${CHART_LABELS[variableChart]}`)}</h2></div>
            {!preview ? <Empty title="Sin datos suficientes">Se necesitan al menos 2 subgrupos completos (k = {complete.length}).</Empty> : (<>
              <div className={`signal-strip ${signals ? '' : 'ok'}`}>
                <Icon name={signals ? 'alert' : 'check'} /><span className="grow">{signals ? `${signals} señal${signals > 1 ? 'es' : ''} fuera de control` : `${complete.length} subgrupos en control`}</span>
              </div>
              <dl className="figures" style={{ border: 0 }}>
                <Figure label="X̿ (media global)" value={fmt(preview.main.cl)} />
                <Figure label={preview.dispLabel} value={fmt(preview.disp)} />
                <Figure label={preview.sigmaLabel} value={fmt(preview.sigma)} />
                <Figure label="k (subgrupos completos)" value={complete.length} />
                <Figure label="LCS (X̄)" value={fmt(preview.main.ucl)} />
                <Figure label="LCI (X̄)" value={fmt(preview.main.lcl)} />
                <Figure label={`LCS (${preview.secLabel})`} value={fmt(preview.sec.ucl)} />
                <Figure label={`LC (${preview.secLabel})`} value={fmt(preview.sec.cl)} />
              </dl>
            </>)}
          </section>
          <section className="sheet" aria-label="Tabla de mediciones">
            <div className="sheet-head"><h2>Mediciones por subgrupo</h2><span className="muted" style={{ color: 'var(--text-2)', fontSize: 13 }}>{rows.length} filas · {complete.length} completos</span></div>
            <div className="table-wrap" style={{ maxHeight: 560 }}>
              <table className="entry" ref={tableRef}>
                <thead><tr><th>SG</th>{Array.from({ length: n }, (_, i) => <th key={i}>X<sub>{i + 1}</sub></th>)}<th>{sym('X̄')}</th><th>R</th><th>S</th><th><span className="sr-only">Borrar</span></th></tr></thead>
                <tbody>
                  {rows.map((row, r) => {
                    const s = stats[r]!; const f = flags.get(r);
                    return (
                      <tr key={r} className={s.state === 'complete' ? 'complete' : s.state === 'partial' ? 'partial' : ''}>
                        <td className="sg">{r + 1}</td>
                        {row.map((v, c) => <td key={c}><input data-r={r} data-c={c} value={v} inputMode="decimal" autoComplete="off" spellCheck={false}
                          aria-label={`Subgrupo ${r + 1}, X${c + 1}`} aria-invalid={v.trim() !== '' && !isNum(v)}
                          onChange={e => setCell(r, c, e.target.value)} onKeyDown={e => onKey(e, r, c)} onPaste={e => onPaste(e, r, c)} /></td>)}
                        <td className={`calc${f?.x ? ' flag' : ''}`}>{s.state === 'complete' ? s.xbar.toFixed(4) : '—'}</td>
                        <td className={`calc${f?.d && variableChart === 'xbar_r' ? ' flag' : ''}`}>{s.state === 'complete' ? s.r.toFixed(4) : '—'}</td>
                        <td className={`calc${f?.d && variableChart === 'xbar_s' ? ' flag' : ''}`}>{s.state === 'complete' ? s.s.toFixed(4) : '—'}</td>
                        <td className="del"><button className="btn sm icon" onClick={() => setRows(p => { const x = p.filter((_, i) => i !== r); return x.length ? x : [blank(n)]; })} aria-label={`Eliminar fila ${r + 1}`}><Icon name="x" size={14} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sheet-foot"><button className="btn sm" onClick={() => setRows(p => [...p, ...Array.from({ length: 5 }, () => blank(n))])}><Icon name="plus" />Agregar 5 filas</button><span>n = {n} observaciones por subgrupo</span></div>
          </section>
        </div>
      )}

      {processId && tab === 'attribute' && (
        <div className="cols cols-side">
          <section className="sheet" aria-label="Vista previa de la carta de atributos">
            <div className="sheet-head"><h2>Vista previa · {CHART_LABELS[attrType]}</h2></div>
            {!attrPreview ? <Empty title="Sin datos suficientes">Se necesitan al menos 2 subgrupos con datos.</Empty> : (() => {
              const ooc = attrPreview.flags.filter(Boolean).length;
              const centerLabel = { p: 'p̄ (proporción media)', np: 'n̄p (defectivos medios)', c: 'c̄ (defectos medios)', u: 'ū (defectos por unidad)' }[attrType];
              return <>
                <div className={`signal-strip ${ooc ? '' : 'ok'}`}><Icon name={ooc ? 'alert' : 'check'} /><span className="grow">{ooc ? `${ooc} señal${ooc > 1 ? 'es' : ''} fuera de control` : `${attrFilled.length} subgrupos en control`}</span></div>
                <dl className="figures" style={{ border: 0 }}>
                  <Figure label={centerLabel} value={fmt(attrPreview.cl)} />
                  <Figure label={attrPreview.variableN ? 'LCS (promedio)' : 'LCS'} value={fmt(attrPreview.ucl)} />
                  <Figure label={attrPreview.variableN ? 'LCI (promedio)' : 'LCI'} value={fmt(attrPreview.lcl)} />
                  <Figure label="k (subgrupos)" value={attrFilled.length} />
                </dl>
                {attrPreview.variableN && <p style={{ padding: '0 16px 14px', fontSize: 13, color: 'var(--text-2)' }}>n variable: cada subgrupo se evalúa contra sus propios límites.</p>}
              </>;
            })()}
          </section>
          <section className="sheet">
            <div className="sheet-head"><h2>Datos · {CHART_LABELS[attrType]}</h2></div>
            <div className="table-wrap" style={{ maxHeight: 560 }}>
              <table className="entry">
                <thead><tr><th>SG</th>{needsN && <th>n (muestra)</th>}<th>{attrType === 'c' || attrType === 'u' ? 'Defectos' : 'Defectivos'}</th>{needsN && <th>{attrType === 'u' ? 'û' : 'p̂'}</th>}<th><span className="sr-only">Borrar</span></th></tr></thead>
                <tbody>
                  {attrRows.map((row, i) => {
                    const k = attrFilled.findIndex(r => r.i === i);
                    const flag = k >= 0 && attrPreview?.flags[k];
                    const rate = isNum(row.count) && isNum(row.n) && parseDecimal(row.n) > 0 ? (parseDecimal(row.count) / parseDecimal(row.n)).toFixed(4) : '—';
                    const upd = (key: 'n' | 'count', v: string) => setAttrRows(p => { const x = p.map(r => ({ ...r })); x[i]![key] = v; if (i === x.length - 1 && v.trim()) for (let j = 0; j < 5; j++) x.push({ n: '', count: '' }); return x; });
                    return (
                      <tr key={i} className={isNum(row.count) ? 'complete' : ''}>
                        <td className="sg">{i + 1}</td>
                        {needsN && <td><input value={row.n} inputMode="numeric" aria-label={`Subgrupo ${i + 1}, n`} aria-invalid={row.n.trim() !== '' && !isSize(row.n)} onChange={e => upd('n', e.target.value)} /></td>}
                        <td><input value={row.count} inputMode="decimal" aria-label={`Subgrupo ${i + 1}, conteo`} aria-invalid={row.count.trim() !== '' && !isNum(row.count)} onChange={e => upd('count', e.target.value)} /></td>
                        {needsN && <td className={`calc${flag ? ' flag' : ''}`}>{rate}</td>}
                        <td className="del"><button className="btn sm icon" onClick={() => setAttrRows(p => { const x = p.filter((_, j) => j !== i); return x.length ? x : [{ n: '', count: '' }]; })} aria-label={`Eliminar fila ${i + 1}`}><Icon name="x" size={14} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sheet-foot"><button className="btn sm" onClick={() => setAttrRows(p => [...p, ...Array.from({ length: 5 }, () => ({ n: '', count: '' }))])}><Icon name="plus" />Agregar 5 filas</button><span>{attrRows.length} filas · {attrFilled.length} con datos</span></div>
          </section>
        </div>
      )}

      <Modal open={help} title="Cómo preparar tu archivo Excel" onClose={() => setHelp(false)}
        footer={<><button className="btn" onClick={downloadTemplate}><Icon name="download" />Descargar plantilla</button><button className="btn primary" onClick={() => setHelp(false)}>Entendido</button></>}>
        <p>El archivo puede ser <b>.xlsx</b>, <b>.xls</b> o <b>.csv</b>. El sistema detecta si la primera fila es un encabezado.</p>
        <h3>Formato A · subgrupos en filas (recomendado)</h3>
        <p>Cada fila es un subgrupo completo; el número de columnas define n (máximo 10). Ejemplo: columnas x1…x5 con un subgrupo por fila.</p>
        <h3>Formato B · una sola columna</h3>
        <p>Todas las mediciones en orden. Al importar se pregunta n y se agrupan de arriba hacia abajo; las sobrantes al final se descartan (con n = 5 y 25 observaciones se forman 5 subgrupos).</p>
        <h3>Reglas</h3>
        <ul style={{ paddingLeft: 20, display: 'grid', gap: 4 }}>
          <li>Separador decimal con punto o coma.</li>
          <li>Las celdas vacías o con texto se ignoran dentro de una fila.</li>
          <li>Una fila con menos valores que n queda incompleta y no se guarda.</li>
        </ul>
        <Alert kind="warning">Los datos del Excel se cargan en la tabla pero <b>no se guardan automáticamente</b>. Revisa y pulsa «Guardar en el proceso».</Alert>
      </Modal>
    </>
  );
}
