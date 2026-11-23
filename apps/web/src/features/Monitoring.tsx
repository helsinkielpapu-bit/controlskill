// Monitoreo de Fase II (RF-601…RF-612, DA-06, DA-08, DA-10, DA-11, DA-17).
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import * as XLSX from 'xlsx';
import { CHART_LABELS, CHART_TYPES, type ChartType } from '@controlskill/contracts';
import { applySPCRules, outOfControlIndexes, parseDecimal, mean, stdDev, factor, D2, C4, XBAR_R, XBAR_S } from '@controlskill/engine';
import { endpoints } from '../app/api';
import { useActiveProcess, ProcessPicker } from '../app/process';
import { Alert, Empty, Field, Figure, Loading, Modal, fmt, fmtDate, sym } from '../ui/components';
import { ControlChart, ChartLegend } from '../charts/Charts';
import { Icon } from '../ui/icons';

type Mode = 'industrial' | 'academic';
type Sg = { id: number; ids: string[]; values?: number[]; count?: number; n?: number; time: string };
const XBAR = (t: ChartType) => t === 'xbar_r' || t === 'xbar_s';
const MAIN: Record<ChartType, string> = { xbar_r: 'xbar', xbar_s: 'xbar', p: 'p', np: 'np', c: 'c', u: 'u' };
const pref = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
const now = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Estadístico graficado por subgrupo (F-73, DA-10: X̄ con el tamaño real). */
function statOf(sg: Sg, t: ChartType): number {
  if (XBAR(t)) return mean(sg.values!);
  if (t === 'p' || t === 'u') return sg.count! / sg.n!;
  return sg.count!;
}
function dispOf(sg: Sg, t: ChartType) { return t === 'xbar_s' ? stdDev(sg.values!) : Math.max(...sg.values!) - Math.min(...sg.values!); }

export default function Monitoring() {
  const qc = useQueryClient();
  const { processId, process, processes, select } = useActiveProcess();
  const [type, setType] = useState<ChartType>('xbar_r');
  const [mode, setModeState] = useState<Mode>((pref.get('cs_mon_mode') as Mode) || 'industrial');
  const [running, setRunning] = useState(false);
  const [n, setN] = useState(5);
  const [limits, setLimits] = useState<any>(null);
  const [frozen, setFrozen] = useState<any>(null); // DA-27: información de los límites congelados
  const [subgroups, setSubgroups] = useState<Sg[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [inputs, setInputs] = useState<string[]>(Array(5).fill(''));
  const [attr, setAttr] = useState({ count: '', n: '' });
  const [rules, setRules] = useState({ ooc: true, trend: true, shift: true });
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info' | 'warning'; text: React.ReactNode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [restore] = useState(() => { try { return JSON.parse(pref.get('cs_mon_active') ?? 'null'); } catch { return null; } });
  const [showRestore, setShowRestore] = useState(!!restore);
  const firstInput = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (process && !running) setType(process.chart_type); }, [process?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMode = (m: Mode) => { setModeState(m); pref.set('cs_mon_mode', m); };

  const limitsFrom = (r: any, t: ChartType) => ({ main: r.chartData[MAIN[t]], sec: r.chartData.r ?? r.chartData.s ?? null, n: r.effectiveN as number | null, sigmaWithin: r.sigmaWithin as number | null });
  /** Límites calculados en vivo (modo Académico: simulación con otro n, no se guarda). */
  async function loadLimits(pid: string, t: ChartType, simN: number | null) {
    return limitsFrom(await endpoints.controlChart(pid, t, simN), t);
  }
  const finiteLimits = (l: { main: any }) => [l.main.cl, l.main.ucl, l.main.lcl].every(v => typeof v === 'number' && Number.isFinite(v));
  /** DA-27: límites de Fase I congelados; si aún no existen y son calculables, se congelan ahora. */
  async function loadFrozenLimits(pid: string, t: ChartType) {
    const { frozen: existing } = await endpoints.phase1Limits(pid, t);
    if (existing) return { l: limitsFrom(existing, t), info: { ...existing, justFrozen: false } };
    const live = await loadLimits(pid, t, null);
    if (!finiteLimits(live)) return { l: live, info: null };
    const { frozen } = await endpoints.freezePhase1Limits(pid, t);
    return { l: limitsFrom(frozen, t), info: { ...frozen, justFrozen: true } };
  }
  /**
   * Límites para la Fase II con subgrupos de tamaño `size`. Si la Fase I tuvo tamaños distintos (límites por punto, DA-23),
   * se calculan con σ̂ para ese n; si no, son los mismos de la Fase I.
   */
  function forPhaseTwo(l: ReturnType<typeof limitsFrom>, t: ChartType, size: number) {
    const plain = { ...l, main: { ...l.main, pointLimits: undefined }, sec: l.sec ? { ...l.sec, pointLimits: undefined } : null };
    if (!XBAR(t) || !l.main.pointLimits || !l.sigmaWithin) return plain;
    const s = l.sigmaWithin, h = 3 * s / Math.sqrt(size), r4 = (v: number) => Math.round(v * 1e4) / 1e4;
    const center = t === 'xbar_r' ? factor(D2, size) * s : factor(C4, size) * s;
    const [lo, hi] = t === 'xbar_r' ? [factor(XBAR_R, size).D3, factor(XBAR_R, size).D4] : [factor(XBAR_S, size).B3, factor(XBAR_S, size).B4];
    return {
      ...plain,
      main: { ...plain.main, ucl: r4(l.main.cl + h), lcl: r4(l.main.cl - h) },
      sec: plain.sec ? { ...plain.sec, cl: r4(center), ucl: r4(hi * center), lcl: r4(lo * center) } : null
    };
  }
  async function recalcLimits() {
    if (!processId) return;
    if (!confirm('Los límites de Fase I se recalcularán con las mediciones de Fase I actuales y la Fase II se evaluará contra los nuevos límites. ¿Continuar?')) return;
    setBusy(true);
    try { await endpoints.freezePhase1Limits(processId, type); await start(); }
    catch (e) { setMsg({ kind: 'error', text: `Error al recalcular los límites: ${(e as Error).message}` }); }
    finally { setBusy(false); }
  }

  async function start(opts?: { pid?: string; t?: ChartType; m?: Mode; size?: number }) {
    const pid = opts?.pid ?? processId; const t = opts?.t ?? type; const m = opts?.m ?? mode;
    if (!pid) return setMsg({ kind: 'error', text: 'Selecciona un proceso antes de iniciar.' });
    setMsg(null); setLoading(true); setRunning(false); setSubgroups([]); setSessionCount(0); setLimits(null);
    try {
      const proc = processes.find(p => p.id === pid);
      const { l: phaseOne, info } = await loadFrozenLimits(pid, t);
      setFrozen(info);
      if (!finiteLimits(phaseOne)) {
        setMsg({ kind: 'error', text: `No se pueden calcular los límites de Fase I con ${CHART_LABELS[t]} para este proceso. Elige la carta que corresponde a sus datos${proc ? ` (configurada: ${CHART_LABELS[proc.chart_type]})` : ''}.` });
        return;
      }
      let size = opts?.size ?? (m === 'industrial' && proc?.n_size ? proc.n_size : 5);
      if (phaseOne.main.n >= 2 && XBAR(t)) size = phaseOne.main.n;
      setLimits(forPhaseTwo(phaseOne, t, size)); setN(size); setInputs(Array(size).fill(''));
      // Fase II desde la base de datos (DA-11)
      const p2 = await endpoints.measurements(pid, { limit: 1000, phase: '2' });
      const map = new Map<number, typeof p2.data>();
      [...p2.data].reverse().forEach(r => { if (r.subgroup_id == null) return; if (!map.has(r.subgroup_id)) map.set(r.subgroup_id, []); map.get(r.subgroup_id)!.push(r); });
      const loaded: Sg[] = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([id, rs]) => XBAR(t)
        ? { id, ids: rs.map(r => r.id), values: rs.map(r => r.value), time: fmtDate(rs[0]!.recorded_at) }
        : { id, ids: rs.map(r => r.id), count: rs.reduce((s, r) => s + r.value, 0), n: rs.reduce((s, r) => s + (r.sample_size ?? 1), 0), time: fmtDate(rs[0]!.recorded_at) });
      setSubgroups(loaded);
      setRunning(true);
      pref.set('cs_mon_active', JSON.stringify({ processId: pid, processName: proc?.name, chartType: t, mode: m, sgSize: size }));
      if (loaded.length) setMsg({ kind: 'info', text: <>Se cargaron <b>{loaded.length} subgrupos</b> de monitoreo guardados para este proceso. <Link to={`/datos?process_id=${pid}&phase=2`}>Ver o eliminar datos</Link></> });
      setTimeout(() => firstInput.current?.focus(), 50);
    } catch (e) {
      setMsg({ kind: 'error', text: `Sin datos de Fase 1 para este proceso. Ingresa datos históricos en Entrada de datos primero. (${(e as Error).message})` });
      pref.set('cs_mon_active', null);
    } finally { setLoading(false); }
  }

  async function adjustN(delta: number) {
    if (!processId || !limits || !XBAR(type)) return;
    const next = Math.min(10, Math.max(2, n + delta)); if (next === n) return;
    setBusy(true);
    // Simulación del modo Académico: límites de Fase I reagrupados con otro n; no cambia los límites congelados
    try { const l = await loadLimits(processId, type, next); setLimits(forPhaseTwo(l, type, next)); setN(next); setInputs(Array(next).fill('')); }
    catch (e) { setMsg({ kind: 'error', text: `Error recalculando límites: ${(e as Error).message}` }); }
    finally { setBusy(false); }
  }

  // Siguiente número de subgrupo. Se lee de una referencia para que los
  // ingresos en lote (Excel, pegado) numeren 1, 2, 3… aunque se encadenen dentro del mismo render.
  const latest = useRef<Sg[]>([]);
  latest.current = subgroups;
  const idAfter = (list: Sg[]) => (list.length ? list.at(-1)!.id + 1 : 1);
  const nextId = idAfter(subgroups);

  async function add(values?: string[], a?: { count: string; n: string }) {
    if (!processId || !limits) return false;
    const v = values ?? inputs, at = a ?? attr;
    const nextId = idAfter(latest.current);
    let items: Record<string, unknown>[], sg: Omit<Sg, 'ids' | 'time'>;
    if (XBAR(type)) {
      const nums = v.slice(0, n).map(s => parseDecimal(s));
      if (v.slice(0, n).some(s => !s.trim()) || nums.some(Number.isNaN)) { setMsg({ kind: 'error', text: 'Completa todos los valores del subgrupo.' }); return false; }
      items = nums.map(x => ({ process_id: processId, value: x, subgroup_id: nextId, phase: 2 }));
      sg = { id: nextId, values: nums };
    } else {
      const cnt = parseFloat(at.count);
      if (Number.isNaN(cnt) || cnt < 0) { setMsg({ kind: 'error', text: type === 'p' || type === 'np' ? 'Ingresa un número válido de defectuosos.' : 'Ingresa un conteo válido de defectos.' }); return false; }
      // DA-21: n escrito debe ser un entero ≥ 1 (vacío usa el n del proceso)
      if ((type === 'p' || type === 'u') && String(at.n).trim() && !(/^\s*\d+\s*$/.test(String(at.n)) && parseInt(String(at.n)) >= 1)) {
        setMsg({ kind: 'error', text: 'El tamaño de muestra (n) debe ser un número entero mayor o igual a 1.' }); return false;
      }
      const size = type === 'np' ? (limits.main.n || n) : type === 'c' ? 1 : (parseInt(String(at.n)) || n);
      items = [{ process_id: processId, value: cnt, subgroup_id: nextId, phase: 2, ...(type !== 'c' ? { sample_size: size } : {}) }];
      sg = { id: nextId, count: cnt, n: size };
    }
    setBusy(true);
    try {
      const r = await endpoints.addMeasurements(items);
      latest.current = [...latest.current, { ...sg, ids: r.data.map(x => x.id), time: now() }];
      setSubgroups(latest.current);
      setSessionCount(c => c + 1);
      setInputs(Array(n).fill('')); setAttr({ count: '', n: '' });
      firstInput.current?.focus();
      qc.invalidateQueries({ queryKey: ['measurements'] });
      return true;
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); return false; } finally { setBusy(false); }
  }

  async function undo() {
    const last = subgroups.at(-1); if (!last) return;
    setBusy(true);
    try { await Promise.all(last.ids.map(id => endpoints.deleteMeasurement(id))); setSubgroups(s => s.slice(0, -1)); setSessionCount(c => Math.max(0, c - 1)); }
    catch (e) { setMsg({ kind: 'error', text: `Error al deshacer: ${(e as Error).message}` }); } finally { setBusy(false); }
  }

  async function bulk(rows: string[][], stopAfterErrors = Infinity) {
    let ok = 0, errs = 0;
    for (const cells of rows) {
      const good = XBAR(type) ? await add(cells) : await add(undefined, { count: cells[0] ?? '', n: cells[1] ?? '' });
      good ? ok++ : errs++;
      if (errs >= stopAfterErrors) break; // la importación de Excel se detiene tras 5 errores
    }
    setMsg(ok ? { kind: 'success', text: `${ok} subgrupo${ok > 1 ? 's' : ''} agregado${ok > 1 ? 's' : ''}${errs ? `, ${errs} error(es)` : ''}.` }
      : { kind: 'error', text: 'No se pudieron agregar datos. Revisa el formato: filas = subgrupos, columnas separadas por tabulador.' });
  }
  const onPaste = (e: ClipboardEvent) => {
    const lines = e.clipboardData.getData('text').replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return;
    e.preventDefault();
    bulk(lines.map(l => l.split('\t').map(c => c.trim())));
  };

  async function importExcel(file: File) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: '' });
    if (!rows.length) return;
    const headers = rows[0]!.map(h => String(h).toLowerCase().trim().replace(/\s+/g, '_'));
    const data = rows.slice(1).filter(r => r.some(c => c !== '' && c != null));
    const toNum = (v: unknown) => parseFloat(String(v).replace(',', '.'));
    const col = (names: string[], def: number) => { for (const nm of names) { const i = headers.indexOf(nm); if (i !== -1) return i; } return def; };
    let parsed: string[][] = [];
    if (XBAR(type)) parsed = data.map(r => r.map(toNum).filter(v => !Number.isNaN(v)).map(String)).filter(v => v.length >= 2);
    else {
      const cCol = type === 'p' || type === 'np' ? col(['defectuosos', 'defectives', 'def', 'd', ...(type === 'np' ? ['np'] : [])], 0) : col(['defectos', 'defects', 'count', 'c', 'conteo'], 0);
      const nCol = type === 'u' ? col(['n', 'tamaño', 'size', 'unidades', 'units'], 1) : col(['n', 'tamaño', 'size', 'muestra', 'inspectados'], 1);
      parsed = data.map(r => [toNum(r[cCol]), toNum(r[nCol])]).filter(([c, s]) => !Number.isNaN(c!) && c! >= 0 && ((type !== 'p' && type !== 'u') || (!Number.isNaN(s!) && s! > 0))).map(([c, s]) => [String(c), String(s)]);
    }
    if (!parsed.length) return setMsg({ kind: 'error', text: 'No se encontraron filas válidas. Revisa el formato con el botón ?' });
    if (confirm(`Se encontraron ${parsed.length} subgrupos en el archivo.\n¿Importar todos?`)) bulk(parsed, 5);
  }
  function template() {
    const head = XBAR(type) ? Array.from({ length: n }, (_, i) => `x${i + 1}`) : type === 'p' ? ['defectuosos', 'n'] : type === 'np' ? ['defectuosos'] : type === 'c' ? ['defectos'] : ['defectos', 'n'];
    const ex = XBAR(type) ? Array.from({ length: 3 }, () => Array.from({ length: n }, () => (10 + Math.random()).toFixed(2))) : type === 'p' ? [[3, 100], [5, 120], [2, 100]] : type === 'np' ? [[4], [7], [2]] : type === 'c' ? [[8], [12], [5]] : [[14, 10], [22, 15], [9, 10]];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...ex]), 'Datos');
    XLSX.writeFile(wb, `plantilla_spc_${{ xbar_r: 'XbarR', xbar_s: 'XbarS', p: 'p', np: 'np', c: 'c', u: 'u' }[type]}.xlsx`);
  }

  // ── Señales (DA-08: mismas 3 reglas sobre la secuencia de Fase II, contra límites congelados) ──
  const points = useMemo(() => subgroups.map(s => statOf(s, type)), [subgroups, type]);
  const violations = useMemo(() => limits ? applySPCRules(points, limits.main.cl, limits.main.ucl, limits.main.lcl, { detectOutOfControl: rules.ooc, detectTrend: rules.trend, detectShift: rules.shift }) : [], [points, limits, rules]);
  const ooc = outOfControlIndexes(violations);
  const secPoints = XBAR(type) ? subgroups.map(s => dispOf(s, type)) : [];
  // DA-24: la carta R o S de Fase II se evalúa con las mismas reglas, por encima del LCS y por debajo del LCI
  const secViolations = useMemo(() => limits?.sec ? applySPCRules(secPoints, limits.sec.cl, limits.sec.ucl, limits.sec.lcl ?? 0, { detectOutOfControl: rules.ooc, detectTrend: rules.trend, detectShift: rules.shift })
    .map(v => ({ ...v, description: `${type === 'xbar_s' ? 'Desviación estándar (S)' : 'Rangos (R)'}: ${v.description}` })) : [], [secPoints.join(','), limits, rules, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const secFlags = outOfControlIndexes(secViolations);
  const signals = [...violations, ...secViolations].sort((a, b) => a.index - b.index);
  const anyOoc = [...new Set([...ooc, ...secFlags])];
  const accMean = points.length ? mean(points) : null;
  const shift = XBAR(type) && limits && accMean != null ? (accMean - limits.main.cl) / ((limits.main.ucl - limits.main.cl) / 3) : null;
  const liveValues = inputs.slice(0, n).map(parseDecimal).filter(v => !Number.isNaN(v));
  const live = XBAR(type) ? (liveValues.length ? mean(liveValues) : null)
    : attr.count.trim() ? ((type === 'p' || type === 'u') && parseDecimal(attr.n) > 0 ? parseDecimal(attr.count) / parseDecimal(attr.n) : type === 'np' || type === 'c' ? parseDecimal(attr.count) : null) : null;
  // Eje Y fijo (no cambia al agregar datos), con un margen del 25 % del ancho entre límites.
  // Eje fijo con margen del 25 % del ancho entre límites, para que no se aplasten cuando la media es alta.
  const span = limits ? Math.max(limits.main.ucl - limits.main.lcl, 0.001) : 1;
  const secSpan = limits?.sec ? Math.max(limits.sec.ucl - (limits.sec.lcl ?? 0), 0.001) : 1;
  // DA-18: la Fase I se ve como referencia en ambos modos; el eje fijo solo se amplía si algún punto de Fase I queda fuera.
  const within = (lo: number, hi: number, ref?: (number | null)[]): [number, number] => {
    const v = (ref ?? []).filter((x): x is number => x != null);
    return [Math.min(lo, ...v), Math.max(hi, ...v)];
  };
  const lastBad = anyOoc.includes(points.length - 1);

  return (
    <>
      <div className="page-head">
        <div><h1>Monitoreo en tiempo real</h1><p className="lede">Fase II: cada subgrupo se guarda al instante y se evalúa contra los límites congelados de Fase I.</p></div>
        <div className="actions">
          <button className="btn" onClick={() => setSessionsOpen(true)}><Icon name="folder" />Sesiones</button>
          {running && processId && <Link className="btn" to={`/informes?process_id=${processId}`}><Icon name="file" />Informe</Link>}
        </div>
      </div>

      {showRestore && restore && !running && (
        <div style={{ marginBottom: 16 }}><Alert kind="info" onClose={() => { setShowRestore(false); pref.set('cs_mon_active', null); }}>
          Se detectó una sesión anterior de <b>{restore.processName ?? 'un proceso'}</b> ({CHART_LABELS[restore.chartType as ChartType]}).{' '}
          <button className="btn sm primary" onClick={() => { setShowRestore(false); select(restore.processId); setType(restore.chartType); setMode(restore.mode); start({ pid: restore.processId, t: restore.chartType, m: restore.mode, size: restore.sgSize }); }}>Continuar sesión</button>
        </Alert></div>
      )}

      <div className="sheet" style={{ marginBottom: 16 }}>
        <div className="sheet-body toolbar">
          <ProcessPicker value={processId} processes={processes} onChange={id => { select(id); setRunning(false); setLimits(null); }} />
          <Field label="Carta">
            <select className="input" value={type} onChange={e => { setType(e.target.value as ChartType); setRunning(false); setLimits(null); }}>
              {CHART_TYPES.map(t => <option key={t} value={t}>{CHART_LABELS[t]}</option>)}
            </select>
          </Field>
          <div className="field"><span>Modo</span><div className="seg">
            <button aria-pressed={mode === 'industrial'} onClick={() => setMode('industrial')}>Industrial</button>
            <button aria-pressed={mode === 'academic'} onClick={() => setMode('academic')}>Académico</button>
          </div></div>
          <button className="btn primary" style={{ alignSelf: 'end' }} onClick={() => start()} disabled={!processId || loading}>{loading ? 'Cargando…' : running ? 'Reiniciar monitoreo' : 'Iniciar monitoreo'}</button>
        </div>
        <p style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--text-2)' }}>{mode === 'industrial'
          ? 'Industrial: n fijo y límites congelados desde Fase I, que se muestra como referencia; la vista se centra en las alertas.'
          : 'Académico: n ajustable en vivo (recalcula los límites de Fase I con agrupación secuencial) y Fase I visible como referencia.'}</p>
      </div>

      {msg && <div style={{ marginBottom: 16 }}><Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert></div>}
      {!running && !loading && <section className="sheet"><Empty title={processId ? 'Listo para iniciar' : 'Selecciona un proceso'}>Elige proceso, carta y modo, y pulsa «Iniciar monitoreo».</Empty></section>}
      {loading && <Loading text="Cargando límites de Fase I…" />}

      {running && limits && (
        <>
          {frozen && (frozen.stale
            ? <div style={{ marginBottom: 12 }}><Alert kind="warning">
                Las mediciones de Fase I cambiaron después de congelar los límites el {fmtDate(frozen.frozenAt)}. La Fase II se sigue evaluando con los límites congelados.{' '}
                <button className="btn sm" onClick={recalcLimits} disabled={busy}>Recalcular límites de Fase I</button>
              </Alert></div>
            : <div className="frozen-note" role="note">
                <Icon name="info" />
                <span className="grow">Límites de Fase I congelados el {fmtDate(frozen.frozenAt)}{frozen.frozenBy ? ` por ${frozen.frozenBy}` : ''}{frozen.justFrozen ? ' (al iniciar este primer monitoreo)' : ''}. La Fase II siempre se evalúa contra ellos.
                  {mode === 'academic' && XBAR(type) && frozen.effectiveN && n !== frozen.effectiveN ? ` Simulación con n = ${n}: no cambia los límites guardados.` : ''}</span>
                <button className="btn sm" onClick={recalcLimits} disabled={busy}><Icon name="refresh" />Recalcular límites de Fase I</button>
              </div>)}
          <div className={`signal-strip ${!points.length ? 'idle' : anyOoc.length ? '' : 'ok'}`} style={{ marginBottom: 16 }} role="status" aria-live="polite">
            <Icon name={anyOoc.length ? 'alert' : 'check'} />
            <span className="grow">{!points.length ? 'Límites de Fase I listos · ingresa el primer subgrupo'
              : anyOoc.length ? `Proceso fuera de control · ${anyOoc.length} subgrupo${anyOoc.length > 1 ? 's' : ''} con señal${lastBad ? ' · el último subgrupo está fuera de control: investiga causas asignables' : ''}`
              : `Proceso estable · ${points.length} subgrupos sin señales`}</span>
            <span>F2: {points.length}</span>
          </div>

          <div className="cols cols-side">
            <div className="stack">
              <section className="sheet" onPaste={onPaste}>
                <div className="sheet-head"><h2>Subgrupo #{nextId}</h2>
                  {mode === 'academic' && XBAR(type) && <div className="actions" style={{ alignItems: 'center', gap: 6 }}>
                    <span className="label">n</span><button className="btn sm icon" disabled={busy || n <= 2} onClick={() => adjustN(-1)} aria-label="Reducir n">−</button>
                    <b style={{ minWidth: 34, textAlign: 'center' }}>{n}</b><button className="btn sm icon" disabled={busy || n >= 10} onClick={() => adjustN(1)} aria-label="Aumentar n">+</button></div>}
                </div>
                <div className="sheet-body" style={{ display: 'grid', gap: 12 }}>
                  {XBAR(type) ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(n, 5)}, 1fr)`, gap: 8 }}>
                      {Array.from({ length: n }, (_, i) => (
                        <label key={i} className="field"><span>X<sub>{i + 1}</sub></span>
                          <input ref={i === 0 ? firstInput : undefined} className="input" inputMode="decimal" autoComplete="off" value={inputs[i] ?? ''} id={`mon-x${i}`}
                            aria-invalid={!!inputs[i]?.trim() && Number.isNaN(parseDecimal(inputs[i]!))}
                            onChange={e => setInputs(v => { const x = [...v]; x[i] = e.target.value; return x; })}
                            onKeyDown={e => { if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && i === n - 1)) { e.preventDefault(); i + 1 < n ? document.getElementById(`mon-x${i + 1}`)?.focus() : add(); } }} /></label>
                      ))}
                    </div>
                  ) : (
                    <div className="grid-form">
                      <Field label={type === 'p' || type === 'np' ? 'Defectuosos' : 'Defectos'}><input ref={firstInput} className="input" inputMode="numeric" value={attr.count} onChange={e => setAttr(a => ({ ...a, count: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') add(); }} /></Field>
                      {(type === 'p' || type === 'u') && <Field label={type === 'p' ? 'Tamaño n' : 'Unidades n'}><input className="input" inputMode="numeric" placeholder={String(n)} value={attr.n} onChange={e => setAttr(a => ({ ...a, n: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') add(); }} /></Field>}
                    </div>
                  )}
                  <dl className="dl"><div><dt className="label">{sym(XBAR(type) ? 'X̄ actual' : `${type} actual`)}</dt><dd>{live != null ? fmt(live) : '—'}</dd></div>
                    <div><dt className="label">Frente a la media acumulada</dt><dd>{XBAR(type) && live != null && accMean != null ? (Math.abs(live - accMean) < 0.0001 ? '—' : `${live > accMean ? '↑' : '↓'} ${Math.abs(live - accMean).toFixed(4)}`) : '—'}</dd></div></dl>
                  <button className="btn primary" style={{ height: 46 }} onClick={() => add()} disabled={busy}><Icon name="plus" />{busy ? 'Guardando…' : XBAR(type) ? 'Agregar subgrupo' : 'Agregar'}</button>
                  <div className="actions">
                    <button className="btn" style={{ flex: 1 }} onClick={undo} disabled={busy || !subgroups.length}><Icon name="undo" />Deshacer último</button>
                    <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="upload" />Excel</button>
                    <button className="btn icon" onClick={() => setHelp(true)} aria-label="Formato del archivo Excel">?</button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importExcel(f); }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Puedes pegar varias filas desde Excel: filas = subgrupos, columnas = valores.</p>
                </div>
              </section>
              <dl className="figures">
                <Figure label="Subgrupos F2" value={points.length || '—'} />
                <Figure label="Esta sesión" value={sessionCount} />
                <Figure label={`${XBAR(type) ? 'X̄' : type.toUpperCase()} acumulada`} value={accMean != null ? fmt(accMean) : '—'}
                  sub={shift != null ? <span className={Math.abs(shift) < 0.5 ? 'ok' : Math.abs(shift) < 1 ? 'warn' : 'bad'}>{shift >= 0 ? '+' : ''}{shift.toFixed(2)}σ frente a la LC</span> : undefined} />
                <Figure label={`Último ingreso${subgroups.length ? ` · ${XBAR(type) ? 'X̄' : type}` : ''}`} value={subgroups.length ? fmt(points.at(-1)) : '—'}
                  sub={subgroups.length ? `SG #${subgroups.at(-1)!.id} · ${subgroups.at(-1)!.time}` : undefined} />
                <Figure label="LC de Fase I" value={fmt(limits.main.cl)} sub={`LCI ${fmt(limits.main.lcl)} · LCS ${fmt(limits.main.ucl)} · F1: ${limits.main.points.length} SG`} />
              </dl>
              <section className="sheet">
                <div className="sheet-head"><h2>Reglas</h2></div>
                <div className="sheet-body" style={{ display: 'grid', gap: 8 }}>
                  <label className="check"><input type="checkbox" checked={rules.ooc} onChange={e => setRules(r => ({ ...r, ooc: e.target.checked }))} />Fuera de límites</label>
                  <label className="check"><input type="checkbox" checked={rules.trend} onChange={e => setRules(r => ({ ...r, trend: e.target.checked }))} />Tendencia (6 puntos)</label>
                  <label className="check"><input type="checkbox" checked={rules.shift} onChange={e => setRules(r => ({ ...r, shift: e.target.checked }))} />Corrimiento (8 puntos)</label>
                </div>
              </section>
            </div>

            <div className="stack">
              <section className="sheet">
                <div className="sheet-head"><h2>{sym(`${XBAR(type) ? 'Medias (X̄)' : CHART_LABELS[type]} · límites de Fase I`)}</h2>
                  <ChartLegend items={[{ label: 'LCS / LCI', color: 'var(--bad)' }, { label: 'LC', color: 'var(--ink)', dash: true }, { label: 'Fase I', color: 'var(--rule-strong)' }, { label: 'Señal', color: 'var(--bad)', marker: 'diamond' }]} /></div>
                <div className="sheet-body">
                  <ControlChart title="Carta de monitoreo" series={{ ...limits.main, pointLimits: undefined, points }} flagged={ooc} labels={subgroups.map(s => `SG #${s.id}`)}
                    reference={limits.main.points} pad={Math.max(0, 12 - points.length)}
                    yDomain={within(limits.main.lcl - span * 0.25, limits.main.ucl + span * 0.25, limits.main.points)} zones />
                  {limits.sec && <>
                    <h3 style={{ margin: '14px 0 6px' }}>{type === 'xbar_s' ? 'Desviación estándar (S)' : 'Rangos (R)'}</h3>
                    <ControlChart title="Carta de dispersión de monitoreo" series={{ ...limits.sec, points: secPoints }} flagged={secFlags} height={190}
                      reference={limits.sec.points} pad={Math.max(0, 12 - points.length)}
                      yDomain={within((limits.sec.lcl ?? 0) - secSpan * 0.25, limits.sec.ucl + secSpan * 0.25, limits.sec.points)} />
                  </>}
                </div>
              </section>

              <section className="sheet">
                <div className="sheet-head"><h2>Señales detectadas</h2></div>
                {!points.length ? <p style={{ padding: 16, color: 'var(--text-2)' }}>Ingresa el primer subgrupo para comenzar el monitoreo.</p>
                  : !signals.length ? <div className="signal-strip ok"><Icon name="check" /><span className="grow">Proceso bajo control estadístico: no se detectaron señales de causas especiales.</span></div>
                  : <ul className="list">{signals.map((v, i) => <li key={i}><span className={`state ${v.severity === 'critical' ? 'bad' : 'warn'}`} style={{ minWidth: 110 }}><Icon name={v.severity === 'critical' ? 'x' : 'alert'} />{v.severity === 'critical' ? 'Crítico' : 'Advertencia'}</span><span><b>SG #{subgroups[v.index]?.id}</b> — {v.description}</span></li>)}</ul>}
              </section>

              <section className="sheet">
                <div className="sheet-head"><h2>Historial de monitoreo (Fase II)</h2><span className="tag">{subgroups.length}</span></div>
                {!subgroups.length ? <p style={{ padding: 16, color: 'var(--text-2)' }}>Sin datos de monitoreo aún.</p> : (
                  <div className="table-wrap" style={{ maxHeight: 360 }}>
                    <table className="data dense">
                      <thead><tr><th>SG</th>{XBAR(type) ? <><th>Valores</th><th className="num">{sym('X̄')}</th><th className="num">{type === 'xbar_s' ? 'S' : 'R'}</th></> : <><th className="num">Conteo</th><th className="num">n</th>{(type === 'p' || type === 'u') && <th className="num">{type}</th>}</>}<th>Estado</th><th>Hora</th></tr></thead>
                      <tbody>{[...subgroups].map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
                        <tr key={s.id} className={anyOoc.includes(i) ? 'flag' : ''}>
                          <td>#{s.id}</td>
                          {XBAR(type) ? <><td className="muted">{s.values!.map(v => v.toFixed(3)).join(', ')}</td><td className="num"><b>{fmt(points[i])}</b></td><td className="num">{fmt(secPoints[i])}</td></>
                            : <><td className="num">{s.count}</td><td className="num">{s.n}</td>{(type === 'p' || type === 'u') && <td className="num"><b>{fmt(points[i])}</b></td>}</>}
                          <td>{anyOoc.includes(i) ? <span className="state bad"><Icon name="x" />Fuera de control</span> : <span className="state ok"><Icon name="check" />Estable</span>}</td>
                          <td className="muted">{s.time}</td>
                        </tr>))}</tbody>
                    </table>
                  </div>)}
              </section>
            </div>
          </div>
        </>
      )}

      <Sessions open={sessionsOpen} onClose={() => setSessionsOpen(false)} canSave={running && !!processId}
        current={{ process_id: processId, chart_type: type, chart_label: CHART_LABELS[type], mode, sg_size: n, subgroup_count: subgroups.length, processName: process?.name }}
        onLoad={s => { setSessionsOpen(false); select(s.process_id); setType(s.chart_type); setMode(s.mode); start({ pid: s.process_id, t: s.chart_type, m: s.mode, size: s.sg_size ?? undefined }); }} />

      <Modal open={help} title="Formato del archivo Excel" onClose={() => setHelp(false)}
        footer={<><button className="btn" onClick={template}><Icon name="download" />Plantilla para {CHART_LABELS[type]}</button><button className="btn primary" onClick={() => setHelp(false)}>Entendido</button></>}>
        <p>Archivo <b>.xlsx</b>, <b>.xls</b> o <b>.csv</b> con encabezados en la primera fila; cada fila siguiente es un subgrupo. Las celdas vacías o con texto se ignoran.</p>
        <ul style={{ paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li><b>X̄-R y X̄-S:</b> columnas x1, x2, … (tantas como n).</li>
          <li><b>Carta p:</b> defectuosos y n (n puede variar por fila).</li>
          <li><b>Carta np:</b> defectuosos (n fijo del proceso).</li>
          <li><b>Carta c:</b> defectos.</li>
          <li><b>Carta u:</b> defectos y n.</li>
        </ul>
        <p>Punto o coma como separador decimal. La importación se detiene si hay 5 errores.</p>
      </Modal>
    </>
  );
}

function Sessions({ open, onClose, canSave, current, onLoad }: { open: boolean; onClose: () => void; canSave: boolean; current: any; onLoad: (s: any) => void }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['sessions'], enabled: open, queryFn: endpoints.sessions });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setName(`${current.processName ?? ''} — ${new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!name.trim()) return setError('Escribe un nombre para la sesión.');
    try { await endpoints.saveSession({ ...current, name: name.trim() }); setError(null); qc.invalidateQueries({ queryKey: ['sessions'] }); }
    catch (e) { setError((e as Error).message); }
  }
  async function remove(id: string) {
    if (!confirm('¿Eliminar esta sesión guardada?')) return;
    await endpoints.deleteSession(id); qc.invalidateQueries({ queryKey: ['sessions'] });
  }
  return (
    <Modal open={open} title="Sesiones de monitoreo" onClose={onClose}>
      {canSave && <div className="sheet" style={{ padding: 14, display: 'grid', gap: 10 }}>
        <Field label="Guardar la sesión actual como"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Turno mañana, Lote 42" /></Field>
        <div className="actions"><button className="btn primary" onClick={save}><Icon name="save" />Guardar sesión</button></div>
        {error && <Alert>{error}</Alert>}
      </div>}
      {list.isLoading ? <Loading /> : !list.data?.length ? <Empty title="No hay sesiones guardadas">Inicia un monitoreo y guárdalo para continuarlo después.</Empty> : (
        <ul className="list sheet">{list.data.map((s: any) => (
          <li key={s.id} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div><b>{s.name}</b><div style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.process_name} · {s.chart_label ?? s.chart_type} · {s.subgroup_count} subgrupo{s.subgroup_count !== 1 ? 's' : ''} · {fmtDate(s.saved_at)}</div></div>
            <div className="actions" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="btn sm primary" onClick={() => onLoad(s)}>Continuar</button><button className="btn sm icon danger" onClick={() => remove(s.id)} aria-label="Eliminar sesión"><Icon name="trash" /></button></div>
          </li>))}</ul>
      )}
    </Modal>
  );
}
