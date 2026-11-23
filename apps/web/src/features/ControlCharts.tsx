// Cartas de control de Fase I (RF-401…RF-409, DA-16).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { CHART_LABELS, CHART_TYPES, type ChartType } from '@controlskill/contracts';
import { mean, stdDev } from '@controlskill/engine';
import { endpoints } from '../app/api';
import { useActiveProcess, ProcessPicker } from '../app/process';
import { Alert, Empty, Field, Loading, fmt, sym } from '../ui/components';
import { ControlChart, ChartLegend } from '../charts/Charts';
import { StatTests } from '../ui/StatTests';
import { Icon } from '../ui/icons';

const TITLES: Record<ChartType, { main: string; sec: string | null }> = {
  xbar_r: { main: 'Medias (X̄)', sec: 'Rangos (R)' }, xbar_s: { main: 'Medias (X̄)', sec: 'Desviación estándar (S)' },
  p: { main: 'Proporción de no conformes (p)', sec: null }, np: { main: 'Número de no conformes (np)', sec: null },
  c: { main: 'Número de defectos (c)', sec: null }, u: { main: 'Defectos por unidad (u)', sec: null }
};
const MAIN_KEY: Record<ChartType, string> = { xbar_r: 'xbar', xbar_s: 'xbar', p: 'p', np: 'np', c: 'c', u: 'u' };

export default function ControlCharts() {
  const [params, setParams] = useSearchParams();
  const { processId, process, processes, select } = useActiveProcess();
  const [type, setType] = useState<ChartType>((params.get('type') as ChartType) || 'xbar_r');
  const [sim, setSim] = useState(false);
  const [simN, setSimN] = useState(5);
  const [rules, setRules] = useState({ ooc: true, trend: true, shift: true });
  const [rawOpen, setRawOpen] = useState(false);

  useEffect(() => { if (process && !params.get('type')) setType(process.chart_type); }, [process?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const isX = type === 'xbar_r' || type === 'xbar_s';

  const chart = useQuery({
    queryKey: ['control-chart', processId, type, sim && isX ? simN : null, rules],
    enabled: !!processId, queryFn: () => endpoints.controlChart(processId!, type, sim && isX ? simN : null, rules)
  });
  const tests = useQuery({ queryKey: ['tests', processId], enabled: !!processId, queryFn: () => endpoints.tests(processId!) });
  const raw = useQuery({ queryKey: ['measurements', processId, 'all-phase1'], enabled: !!processId && rawOpen, queryFn: () => endpoints.measurements(processId!, { limit: 9999, phase: '1' }) });

  const d = chart.data;
  const main = d?.chartData?.[MAIN_KEY[type]];
  const sec = d?.chartData?.r ?? d?.chartData?.s ?? null;
  // DA-24: señales de la carta R o S calculadas en el motor (por encima del LCS y por debajo del LCI, con las reglas activas)
  const secFlags: number[] = d?.dispersionOutOfControl ?? [];
  const signals: any[] = d ? [...d.violations, ...(d.dispersionViolations ?? [])] : [];

  return (
    <>
      <div className="page-head">
        <div><h1>Cartas de control</h1><p className="lede">Límites de Fase I calculados con las mediciones guardadas. Las señales se evalúan con las reglas activas.</p></div>
        <div className="actions">{processId && <Link className="btn" to={`/informes?process_id=${processId}`}><Icon name="file" />Informe</Link>}</div>
      </div>

      <div className="sheet" style={{ marginBottom: 16 }}>
        <div className="sheet-body toolbar">
          <ProcessPicker value={processId} processes={processes} onChange={select} />
          <Field label="Carta">
            <select className="input" value={type} onChange={e => { setType(e.target.value as ChartType); setParams(p => { p.set('type', e.target.value); return p; }, { replace: true }); }}>
              <optgroup label="Variables">{CHART_TYPES.slice(0, 2).map(t => <option key={t} value={t}>{CHART_LABELS[t]}</option>)}</optgroup>
              <optgroup label="Atributos">{CHART_TYPES.slice(2).map(t => <option key={t} value={t}>{CHART_LABELS[t]}</option>)}</optgroup>
            </select>
          </Field>
          {isX && <div className="field"><span>Subgrupos</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', height: 40 }}>
              <label className="check"><input type="checkbox" checked={sim} onChange={e => setSim(e.target.checked)} />Simular de forma secuencial</label>
              {sim && <select className="input" style={{ width: 80 }} value={simN} onChange={e => setSimN(parseInt(e.target.value))} aria-label="Tamaño n simulado">{[2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => <option key={v}>{v}</option>)}</select>}
            </div></div>}
          <div className="field"><span>Reglas activas</span>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', height: 40, flexWrap: 'wrap' }}>
              <label className="check"><input type="checkbox" checked={rules.ooc} onChange={e => setRules(r => ({ ...r, ooc: e.target.checked }))} />Fuera de límites</label>
              <label className="check"><input type="checkbox" checked={rules.trend} onChange={e => setRules(r => ({ ...r, trend: e.target.checked }))} />Tendencia (6)</label>
              <label className="check"><input type="checkbox" checked={rules.shift} onChange={e => setRules(r => ({ ...r, shift: e.target.checked }))} />Corrimiento (8)</label>
            </div></div>
        </div>
        {isX && sim && <p style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--text-2)' }}>Agrupa las mediciones en orden: observaciones 1 a n → SG 1, n+1 a 2n → SG 2, y así sucesivamente.</p>}
      </div>

      {!processId && <section className="sheet"><Empty title="Selecciona un proceso">La carta se calcula con sus mediciones de Fase I.</Empty></section>}
      {processId && process && process.chart_type !== type && <div style={{ marginBottom: 16 }}><Alert kind="info">El proceso está configurado como {CHART_LABELS[process.chart_type]}; estás viendo {CHART_LABELS[type]}.</Alert></div>}
      {chart.isLoading && <Loading text="Calculando la carta…" />}
      {chart.error && <Alert>{(chart.error as Error).message}{!sim && isX && /subgrupo/i.test((chart.error as Error).message) && ' — Activa «Simular de forma secuencial» para agrupar los datos automáticamente.'}</Alert>}

      {d && main && (
        <div className="stack">
          <section className="sheet">
            <div className="sheet-head">
              <h2>{sym(`${CHART_LABELS[type]} · límites de control`)}</h2>
              <div className="actions" style={{ gap: 6 }}>
                {d.simulated && <span className="tag solid">Subgrupos simulados · n = {d.simulate_n} · {main.points.length} subgrupos</span>}
                {d.variableN && <span className="tag">n variable: límites por subgrupo</span>}
                {d.effectiveN != null && <span className="tag">n = {d.effectiveN}</span>}
                {d.sigmaWithin != null && <span className="tag">σ̂w = {fmt(d.sigmaWithin)}</span>}
              </div>
            </div>
            <div className="sheet-body">
              <h3 style={{ marginBottom: 8 }}>{sym(TITLES[type].main)}</h3>
              <ControlChart title={`Carta ${TITLES[type].main}`} series={main} labels={d.labels} flagged={d.outOfControl} valueLabel={TITLES[type].main} />
              {sec && <>
                <h3 style={{ margin: '18px 0 8px' }}>{sym(TITLES[type].sec)}</h3>
                <ControlChart title={`Carta ${TITLES[type].sec}`} series={sec} labels={d.labels} flagged={secFlags} height={200} valueLabel={TITLES[type].sec!} />
              </>}
              <div style={{ marginTop: 10 }}><ChartLegend items={[{ label: 'LCS / LCI', color: 'var(--bad)' }, { label: 'Línea central', color: 'var(--ink)', dash: true }, { label: 'Subgrupo fuera de control', color: 'var(--bad)', marker: 'diamond' }]} /></div>
            </div>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Señales de causas especiales</h2>{signals.length > 0 && <span className="tag solid" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }}>{signals.length}</span>}</div>
            {signals.length === 0
              ? <div className="signal-strip ok"><Icon name="check" /><span className="grow">Proceso bajo control estadístico: no se detectaron señales con las reglas activas.</span></div>
              : <ul className="list">{signals.map((v: any, i: number) => (
                <li key={i}><span className={`state ${v.severity === 'critical' ? 'bad' : 'warn'}`} style={{ minWidth: 110 }}><Icon name={v.severity === 'critical' ? 'x' : 'alert'} />{v.severity === 'critical' ? 'Crítico' : 'Advertencia'}</span>
                  <span><b>{d.labels[v.index]}</b> — {v.description}</span></li>))}</ul>}
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Pruebas estadísticas</h2></div>
            {tests.isLoading ? <Loading text="Calculando pruebas…" /> : tests.data ? <StatTests data={tests.data} /> : <p style={{ padding: 16, color: 'var(--text-2)' }}>{(tests.error as Error)?.message ?? 'Se necesitan al menos 7 mediciones.'}</p>}
          </section>

          <section className="sheet">
            <button className="sheet-head" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} aria-expanded={rawOpen} onClick={() => setRawOpen(o => !o)}>
              <h2>Mediciones de Fase I</h2><span style={{ color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>{rawOpen ? 'Ocultar' : 'Mostrar'}<Icon name="chevron" /></span>
            </button>
            {rawOpen && (raw.isLoading ? <Loading /> : raw.data && <RawTable rows={raw.data.data} type={type} />)}
          </section>
        </div>
      )}
    </>
  );
}

function RawTable({ rows, type }: { rows: { value: number; subgroup_id: number | null; sample_size: number | null }[]; type: ChartType }) {
  const groups = new Map<string, typeof rows>();
  [...rows].reverse().forEach(m => { const k = String(m.subgroup_id ?? '—'); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(m); });
  const isAttr = !['xbar_r', 'xbar_s'].includes(type);
  return (
    <div className="table-wrap" style={{ maxHeight: 420 }}>
      <table className="data dense">
        <thead><tr><th>Subgrupo</th>{isAttr ? <><th className="num">Conteo</th><th className="num">n</th>{(type === 'p' || type === 'u') && <th className="num">{type}</th>}</> : <><th>Mediciones</th><th className="num">{sym('X̄')}</th><th className="num">{type === 'xbar_s' ? 'S' : 'R'}</th></>}</tr></thead>
        <tbody>{[...groups.entries()].map(([k, ms]) => {
          const vals = ms.map(m => m.value);
          if (isAttr) {
            const total = vals.reduce((a, b) => a + b, 0), n = ms.reduce((s, m) => s + (m.sample_size ?? 1), 0);
            return <tr key={k}><td>SG {k}</td><td className="num">{total}</td><td className="num">{n}</td>{(type === 'p' || type === 'u') && <td className="num">{(total / n).toFixed(4)}</td>}</tr>;
          }
          return <tr key={k}><td>SG {k}</td><td className="muted">{vals.map(v => v.toFixed(3)).join(', ')}</td><td className="num"><b>{mean(vals).toFixed(4)}</b></td><td className="num">{(type === 'xbar_s' ? stdDev(vals) : Math.max(...vals) - Math.min(...vals)).toFixed(4)}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}
