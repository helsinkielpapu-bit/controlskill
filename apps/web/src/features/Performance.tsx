// Evaluación del desempeño de la carta (RF-701…RF-709, DA-11, DA-17).
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHART_LABELS, type ChartType } from '@controlskill/contracts';
import { calcAlpha, inferNFromChart, levels, mean, performanceMetrics, phaseTwoEvaluation, sampleLoadPlans, sanitizePerformanceInputs, sensitivityTable } from '@controlskill/engine';
import { endpoints } from '../app/api';
import { useActiveProcess, ProcessPicker } from '../app/process';
import { Alert, Empty, Field, Figure, Loading, fmt, fmtDate, sym } from '../ui/components';
import { Icon } from '../ui/icons';

const MAIN: Record<ChartType, string> = { xbar_r: 'xbar', xbar_s: 'xbar', p: 'p', np: 'np', c: 'c', u: 'u' };
const FMT = {
  pct: (v: number) => (v * 100).toFixed(2) + '%',
  num: (v: number) => (!isFinite(v) || v > 1e6 ? '> 1 M' : v.toLocaleString('es', { maximumFractionDigits: 1 })),
  hrs: (v: number) => (!isFinite(v) || v > 1e5 ? '> 100 k h' : v.toLocaleString('es', { maximumFractionDigits: 1 }))
};
const tone = (l: string) => (l === 'good' ? 'ok' : l === 'warn' ? 'warn' : 'bad');

export default function Performance() {
  const qc = useQueryClient();
  const { processId, process, processes, select } = useActiveProcess();
  const type = (process?.chart_type ?? 'xbar_r') as ChartType;
  const [t, setT] = useState('4');
  const [prod, setProd] = useState('100');
  const [cmDelta, setCmDelta] = useState('0.2');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // DA-27: si hay límites de Fase I congelados se usan esos; si no, la carta de Fase I actual
  const chart = useQuery({
    queryKey: ['phase1-limits', processId, type], enabled: !!processId,
    queryFn: async () => (await endpoints.phase1Limits(processId!, type)).frozen ?? await endpoints.controlChart(processId!, type)
  });
  const phase2 = useQuery({ queryKey: ['measurements', processId, '2', 'perf'], enabled: !!processId, queryFn: () => endpoints.measurements(processId!, { limit: 1000, phase: '2' }) });
  const saved = useQuery({ queryKey: ['evaluation', processId], enabled: !!processId, queryFn: () => endpoints.evaluation(processId!) });

  useEffect(() => {
    const cfg = saved.data?.data?.config;
    if (cfg) { if (cfg.t != null) setT(String(cfg.t)); if (cfg.prod != null) setProd(String(cfg.prod)); if (cfg.cmDelta != null) setCmDelta(String(cfg.cmDelta)); }
  }, [saved.data]);

  /** Información de la carta: n, σ̂ del proceso y límites. */
  const info = useMemo(() => {
    const d = chart.data; if (!d) return null;
    const main = d.chartData[MAIN[type]];
    const second = d.chartData.r ?? d.chartData.s ?? null;
    const n = d.effectiveN || (type === 'xbar_r' || type === 'xbar_s' ? inferNFromChart(type, main, second) : null) || (process?.n_size ?? null) || 5;
    const sigmaProcess = type === 'xbar_r' || type === 'xbar_s' ? (d.sigmaWithin != null ? d.sigmaWithin : (main.ucl - main.cl) * Math.sqrt(n) / 3) : null;
    return { main, second, n, sigmaProcess, k: 3, ooc: d.outOfControl.length, total: d.labels.length };
  }, [chart.data, type, process?.n_size]);

  /** Fase II desde la base de datos (DA-11): medias de sesión (F-73). */
  const evaluation = useMemo(() => {
    if (!info || !phase2.data?.data.length || info.sigmaProcess == null || info.sigmaProcess <= 0) return null;
    const groups = new Map<number, { values: number[]; n: number }>();
    [...phase2.data.data].reverse().forEach(m => { if (m.subgroup_id == null) return; const g = groups.get(m.subgroup_id) ?? { values: [], n: 0 }; g.values.push(m.value); g.n += m.sample_size ?? 1; groups.set(m.subgroup_id, g); });
    const means = [...groups.values()].map(g => (type === 'xbar_r' || type === 'xbar_s' ? mean(g.values) : type === 'p' || type === 'u' ? g.values.reduce((a, b) => a + b, 0) / g.n : g.values.reduce((a, b) => a + b, 0)));
    if (!means.length) return null;
    return { ...phaseTwoEvaluation(means, info.main.cl, info.sigmaProcess, info.n, process?.usl ?? null, process?.lsl ?? null), sgCount: means.length };
  }, [info, phase2.data, type, process?.usl, process?.lsl]);

  // δ y %PNC de solo lectura: vienen de Fase II. Sin Fase II queda «0» → δ = 1 y %PNC = 0.
  const deltaField = evaluation ? Math.abs(evaluation.deltaReal).toFixed(4) : '0';
  const pncField = evaluation ? (evaluation.pnc1 != null ? (evaluation.pnc1 * 100).toFixed(4) : '—') : '0';
  const s = sanitizePerformanceInputs({ t, delta: deltaField, pnc: pncField, prod });
  const betaParams = info ? { k: info.k, delta: s.delta, n: info.n, chartType: type, ucl: info.main.ucl, lcl: info.main.lcl, cl: info.main.cl } : null;
  const m = betaParams ? performanceMetrics(betaParams, s.h, s.pnc, s.prod) : null;
  const plans = betaParams ? sampleLoadPlans(betaParams, info!.n, t, cmDelta, s.pnc, s.prod) : null;
  const sens = betaParams ? sensitivityTable(betaParams, s.h, s.pnc, s.prod, info!.sigmaProcess) : [];

  async function save() {
    if (!processId || !evaluation || !m || !plans) return setSaveMsg('No hay datos de evaluación para guardar.');
    await endpoints.saveEvaluation(processId, type, {
      config: { t: s.h, prod: s.prod, cmDelta: parseFloat(cmDelta) || 0.2 }, ...evaluation,
      performance: { k: 3, n: info!.n, h: s.h, delta: s.delta, prod: s.prod, rawPnc: s.pnc * 100, ...m, cmDelta: parseFloat(cmDelta) || 0.2 }, cmPlans: plans
    });
    qc.invalidateQueries({ queryKey: ['evaluation', processId] });
    setSaveMsg('Evaluación y parámetros guardados.');
  }

  const notes: { cls: 'good' | 'warn' | 'danger' | 'info'; badge: string; note?: string }[] = [];
  if (m) {
    if (m.alpha < 0.001) notes.push({ cls: 'warn', badge: 'Muy pocas falsas alarmas', note: 'α muy bajo — el sistema rara vez dará una falsa alarma, pero puede tardar en detectar cambios reales.' });
    else if (m.alpha <= 0.005) notes.push({ cls: 'good', badge: 'α óptimo (3σ estándar)', note: `El nivel α = ${(m.alpha * 100).toFixed(3)}% está dentro del rango industrial estándar. El sistema dará una falsa alarma en promedio cada ${Math.round(m.arl0)} subgrupos.` });
    else if (m.alpha <= 0.05) notes.push({ cls: 'warn', badge: 'Falsas alarmas frecuentes', note: `Con α = ${(m.alpha * 100).toFixed(2)}% se esperan falsas alarmas frecuentes (cada ~${Math.round(m.arl0)} subgrupos). Considera aumentar k.` });
    else notes.push({ cls: 'danger', badge: 'Demasiadas falsas alarmas', note: 'El α supera el 5%. Los operadores tenderán a ignorar las señales. Revisa los límites sigma.' });
    if (m.power >= 0.9) notes.push({ cls: 'good', badge: 'Alta potencia de detección', note: `Con ${FMT.pct(m.power)} de potencia, la carta detecta el cambio de δ=${s.delta}σ en promedio en ${FMT.num(m.arl1)} subgrupos.` });
    else if (m.power >= 0.5) notes.push({ cls: 'warn', badge: 'Potencia moderada', note: `Potencia del ${FMT.pct(m.power)}: el cambio de ${s.delta}σ puede tardar varios ciclos en detectarse. Considera aumentar n o reducir δ mínimo a detectar.` });
    else notes.push({ cls: 'danger', badge: 'Detección lenta', note: `Solo ${FMT.pct(m.power)} de probabilidad de detectar un cambio de ${s.delta}σ en el próximo subgrupo. El proceso puede operar fuera de control durante muchos ciclos. Aumenta n o reduce k.` });
    if (m.ats1 <= s.h) notes.push({ cls: 'good', badge: 'Respuesta < 1 ciclo' });
    else if (m.ats1 <= 8) notes.push({ cls: 'good', badge: 'Respuesta rápida (< 1 turno)', note: `ATS₁ = ${FMT.hrs(m.ats1)} h — el sistema detecta el cambio dentro del turno de trabajo.` });
    else if (m.ats1 <= 24) notes.push({ cls: 'warn', badge: 'Respuesta en el día', note: `ATS₁ = ${FMT.hrs(m.ats1)} h — el cambio puede no detectarse hasta el siguiente turno. Revisa el intervalo h.` });
    else notes.push({ cls: 'danger', badge: 'Respuesta lenta (> 1 día)', note: `ATS₁ = ${FMT.hrs(m.ats1)} h es un tiempo de respuesta muy alto. Reduce h (muestrea más seguido) o aumenta n.` });
    const ppnc = isFinite(m.ppnc) ? m.ppnc : 1e9;
    if (ppnc < 10) notes.push({ cls: 'good', badge: 'PPNC bajo' });
    else if (ppnc < 100) notes.push({ cls: 'warn', badge: `PPNC ≈ ${Math.round(ppnc)} unidades`, note: `En promedio, ${Math.round(ppnc)} unidades no conformes antes de detectar el fallo. Evalúa si es aceptable.` });
    else notes.push({ cls: 'danger', badge: `PPNC alto: ${Math.round(ppnc)} unidades`, note: `Un PPNC de ${Math.round(ppnc)} unidades implica un impacto económico significativo antes de que el sistema detecte el problema.` });
    if (m.alpha >= 0.001 && m.alpha <= 0.005 && m.power >= 0.7) notes.push({ cls: 'info', badge: 'Sistema bien balanceado' });
    else if (m.alpha < 0.001 && m.power < 0.4) notes.push({ cls: 'warn', badge: 'Sistema demasiado conservador', note: 'El sistema casi nunca da falsas alarmas pero tampoco detecta bien. Evalúa reducir k o aumentar n.' });
  }
  const isVar = type === 'xbar_r' || type === 'xbar_s';
  const betaFormula = isVar ? 'β = Φ(k − δ√n) − Φ(−k − δ√n)' : { p: 'β = Φ((LCS − p₁)/σp₁) − Φ((LCI − p₁)/σp₁)', np: 'β = Φ((LCS − np₁)/σnp₁) − Φ((LCI − np₁)/σnp₁)', c: 'β = Φ((LCS − c₁)/√c₁) − Φ((LCI − c₁)/√c₁)', u: 'β = Φ((LCS − u₁)/σu₁) − Φ((LCI − u₁)/σu₁)' }[type];

  return (
    <>
      <div className="page-head"><div><h1>Evaluación del desempeño</h1><p className="lede">Qué tan rápido detecta la carta un cambio real y cuánto producto no conforme se fabrica antes de detectarlo.</p></div></div>
      <div className="sheet" style={{ marginBottom: 16 }}><div className="sheet-body toolbar"><ProcessPicker value={processId} processes={processes} onChange={select} /></div></div>
      {!processId && <section className="sheet"><Empty title="Selecciona un proceso para comenzar">Se usa la carta de control del proceso con sus límites reales.</Empty></section>}
      {chart.isLoading && <Loading text="Cargando carta de control…" />}
      {chart.error && <Alert>Error: {(chart.error as Error).message}</Alert>}

      {info && m && plans && (
        <div className="stack">
          <section className="sheet">
            <div className="sheet-head"><h2>{process?.name} — {CHART_LABELS[type]}</h2>
              <span className={`state ${info.ooc ? 'bad' : 'ok'}`}><Icon name={info.ooc ? 'alert' : 'check'} />{info.ooc ? `${info.ooc} señal${info.ooc > 1 ? 'es' : ''} de ${info.total} SG` : '0 señales (en control)'}</span></div>
            {chart.data?.frozenAt && <p style={{ padding: '8px 16px 0', fontSize: 13, color: 'var(--text-2)' }}>Límites de Fase I congelados el {fmtDate(chart.data.frozenAt)}{chart.data.stale ? ' · las mediciones de Fase I cambiaron después; se siguen usando los límites congelados' : ''}.</p>}
            <dl className="figures" style={{ border: 0 }}>
              <Figure label="LCS" value={fmt(info.main.ucl)} unit={process?.unit} />
              <Figure label="LC" value={fmt(info.main.cl)} unit={process?.unit} />
              <Figure label="LCI" value={fmt(info.main.lcl)} unit={process?.unit} />
              {info.sigmaProcess != null && <Figure label="σ̂ del proceso" value={fmt(info.sigmaProcess)} unit={process?.unit} />}
              <Figure label="n" value={info.n} />
              <Figure label="k" value="3σ" sub="estándar" />
            </dl>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Monitoreo Fase II con datos reales</h2>
              <div className="actions" style={{ alignItems: 'center' }}>
                {saved.data && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Guardada el {fmtDate(saved.data.saved_at)}</span>}
                <button className="btn sm primary" onClick={save} disabled={!evaluation}><Icon name="save" />Guardar evaluación</button></div></div>
            {saveMsg && <div style={{ padding: '12px 16px 0' }}><Alert kind={evaluation ? 'success' : 'error'} onClose={() => setSaveMsg(null)}>{saveMsg}</Alert></div>}
            {!evaluation ? <p style={{ padding: 16, color: 'var(--text-2)' }}>Sin datos de Fase II para este proceso{!isVar && ' o la carta es de atributos'}. Se usa δ = 1σ y %PNC = 0 por defecto.</p> : (
              <dl className="figures" style={{ border: 0 }}>
                <Figure label="Media Fase I (μ₀)" value={fmt(evaluation.mu0)} />
                <Figure label="Media Fase II (μ₁)" value={fmt(evaluation.mu1)} />
                <Figure label="Desplazamiento δ" value={`${evaluation.deltaReal >= 0 ? '+' : ''}${evaluation.deltaReal.toFixed(4)} σ`} tone={Math.abs(evaluation.deltaReal) < 0.5 ? 'ok' : Math.abs(evaluation.deltaReal) < 1 ? 'warn' : 'bad'} sub={`X̄: ${evaluation.shiftXbar >= 0 ? '+' : ''}${evaluation.shiftXbar.toFixed(2)}σ · n = ${evaluation.n}`} />
                <Figure label="Subgrupos en monitoreo" value={evaluation.sgCount} />
                <Figure label="%PNC original (μ₀)" value={evaluation.pnc0 != null ? (evaluation.pnc0 * 100).toFixed(4) + '%' : '—'} />
                <Figure label="%PNC con μ₁" value={evaluation.pnc1 != null ? (evaluation.pnc1 * 100).toFixed(4) + '%' : '—'} large tone={evaluation.pnc0 != null && evaluation.pnc1 != null ? (evaluation.pnc1 > evaluation.pnc0 + 0.001 ? 'bad' : 'ok') : ''} />
              </dl>)}
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Parámetros de evaluación</h2></div>
            <div className="sheet-body grid-form">
              <Field label="Límites sigma (k)" hint="De la carta"><input className="input" readOnly value={3} /></Field>
              <Field label="Tamaño de subgrupo (n)" hint="De la carta"><input className="input" readOnly value={info.n} /></Field>
              <Field label="δ real (σ)" hint="Desviación observada en Fase II"><input className="input" readOnly value={deltaField} /></Field>
              <Field label="% no conformes real" hint="De la Fase II"><input className="input" readOnly value={pncField} /></Field>
              <Field label="Intervalo de muestreo t (h)" hint="Tiempo entre subgrupos inspeccionados"><input className="input" type="number" min={0.25} step={0.25} value={t} onChange={e => setT(e.target.value)} /></Field>
              <Field label="Tasa de producción (u/h)" hint="Unidades producidas por hora"><input className="input" type="number" min={1} value={prod} onChange={e => setProd(e.target.value)} /></Field>
            </div>
          </section>

          <dl className="figures">
            {(() => { const [l, txt] = levels.alpha(m.alpha); return <Figure label="Error tipo I — α" value={m.alpha < 0.001 ? m.alpha.toExponential(2) : m.alpha.toFixed(4)} tone={tone(l)} sub={txt} />; })()}
            {(() => { const [l] = levels.power(m.power); return <Figure label="Error tipo II — β" value={m.beta.toFixed(4)} tone={tone(l)} sub={`P(no detectar δ) · potencia ${FMT.pct(m.power)}`} />; })()}
            {(() => { const [l, txt] = levels.power(m.power); return <Figure label="Potencia — 1 − β" value={FMT.pct(m.power)} tone={tone(l)} sub={txt} />; })()}
            {(() => { const [l] = levels.alpha(m.alpha); return <Figure label="ARL₀" value={FMT.num(m.arl0)} tone={tone(l)} sub="subgrupos entre falsas alarmas" />; })()}
            {(() => { const [l, txt] = levels.arl1(m.arl1); return <Figure label="ARL₁" value={FMT.num(m.arl1)} tone={tone(l)} sub={txt} />; })()}
            <Figure label="ATS₀ = ARL₀ × t" value={FMT.hrs(m.ats0)} unit="h" sub={`≈ ${(m.ats0 / 24).toFixed(1)} días`} />
            {(() => { const [l, txt] = levels.ats1(m.ats1, s.h); return <Figure label="ATS₁ = ARL₁ × t" value={FMT.hrs(m.ats1)} unit="h" tone={tone(l)} sub={txt} />; })()}
            {(() => { const v = isFinite(m.ppnc) ? m.ppnc : 1e9; const [l, txt] = levels.ppnc(v); return <Figure label="PPNC — no conformes antes de detectar" value={FMT.num(v)} unit="u" tone={tone(l)} large sub={`${FMT.hrs(m.ats1)} h × ${(s.pnc * 100).toFixed(2)}% × ${s.prod} u/h · ${txt}`} />; })()}
          </dl>

          <section className="sheet">
            <div className="sheet-head"><h2>Interpretación automática</h2><div className="actions" style={{ gap: 6 }}>{notes.map((n, i) => <span key={i} className={`state ${n.cls === 'good' ? 'ok' : n.cls === 'warn' ? 'warn' : n.cls === 'danger' ? 'bad' : 'none'}`} style={{ border: '1px solid currentColor', padding: '2px 8px', fontSize: 13 }}>{n.badge}</span>)}</div></div>
            <div className="sheet-body" style={{ display: 'grid', gap: 6 }}>{notes.filter(n => n.note).map((n, i) => <p key={i}>{n.note}</p>)}{!notes.some(n => n.note) && <p>El sistema opera dentro de los parámetros esperados.</p>}</div>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Sensibilidad — ARL₁ según la magnitud del cambio δ</h2><span style={{ fontSize: 13, color: 'var(--text-2)' }}>Con los límites reales; fila marcada = δ actual</span></div>
            <div className="table-wrap"><table className="data dense">
              <thead><tr><th className="num">{sym('δ (σ)')}</th><th className="num">Desplazamiento{info.sigmaProcess != null ? ` (${process?.unit || 'u'})` : ''}</th><th className="num">{sym('β')}</th><th className="num">Potencia</th><th className="num">ARL₁</th><th className="num">ATS₁ (h)</th><th className="num">PPNC (u)</th></tr></thead>
              <tbody>{sens.map(r => (
                <tr key={r.delta} aria-selected={r.current}>
                  <td className="num"><b>{r.delta.toFixed(2)}{r.current ? ' ←' : ''}</b></td>
                  <td className="num">{r.realShift != null ? `${r.realShift.toFixed(4)}` : '—'}</td>
                  <td className="num">{r.beta.toFixed(4)}</td>
                  <td className={`num ${r.power < 0.4 ? 'bad' : r.power < 0.7 ? 'warn' : 'ok'}`}>{FMT.pct(r.power)}</td>
                  <td className={`num ${r.arl1 < 20 ? 'ok' : r.arl1 < 50 ? 'warn' : 'bad'}`}>{FMT.num(r.arl1)}</td>
                  <td className={`num ${r.ats1 > 24 ? 'bad' : r.ats1 > 8 ? 'warn' : 'ok'}`}>{FMT.hrs(r.ats1)}</td>
                  <td className={`num ${!isFinite(r.ppnc) || r.ppnc > 100 ? 'bad' : r.ppnc > 10 ? 'warn' : 'ok'}`}>{FMT.num(isFinite(r.ppnc) ? r.ppnc : 1e9)}</td>
                </tr>))}</tbody>
            </table></div>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Carga muestral — CM = n / t</h2></div>
            <div className="sheet-body" style={{ display: 'grid', gap: 14 }}>
              <div className="grid-form">
                <Field label="Incremento de CM (Δ)" hint="CM objetivo = CM actual × (1 + Δ). Ej.: 0.20 = +20%"><input className="input" type="number" min={0} max={1} step={0.05} value={cmDelta} onChange={e => setCmDelta(e.target.value)} /></Field>
                <Field label="CM objetivo"><input className="input" readOnly value={plans.targetCM.toFixed(2)} /></Field>
              </div>
              <p>Plan actual: n = <b>{plans.current.n}</b> · t = <b>{plans.current.t}</b> h · CM = <b>{plans.current.cm.toFixed(2)}</b> u/h · ATS₁ = <b>{plans.current.ats1.toFixed(1)} h</b></p>
              <div className="cols cols-2">
                {([['Plan 1 — misma n, t calculado', plans.plan1], ['Plan 2 — mismo t, n calculado', plans.plan2]] as const).map(([label, p]) => (
                  <div key={label} className="sheet" style={{ padding: 14, borderColor: plans.best === p ? 'var(--ok)' : undefined, borderWidth: plans.best === p ? 2 : 1 }}>
                    <h3 style={{ marginBottom: 8 }}>{label}{plans.best === p && <span className="state ok" style={{ marginLeft: 8 }}><Icon name="check" />Mejor plan</span>}</h3>
                    <dl className="dl">
                      <div><dt className="label">n</dt><dd>{Number.isInteger(p.n) ? p.n : p.n.toFixed(2)}</dd></div><div><dt className="label">t (h)</dt><dd>{p.t.toFixed(2)}</dd></div>
                      <div><dt className="label">CM (u/h)</dt><dd>{p.cm.toFixed(2)}</dd></div><div><dt className="label">β</dt><dd>{p.b.toFixed(4)}</dd></div>
                      <div><dt className="label">Potencia</dt><dd>{(p.power * 100).toFixed(1)}%</dd></div><div><dt className="label">ARL₁</dt><dd>{FMT.num(p.arl1)}</dd></div>
                      <div><dt className="label">ATS₁ (h)</dt><dd className={p.ats1 <= 8 ? 'ok' : p.ats1 <= 24 ? 'warn' : 'bad'}>{p.ats1.toFixed(1)}</dd></div><div><dt className="label">PPNC (u)</dt><dd>{FMT.num(p.ppnc)}</dd></div>
                    </dl>
                  </div>))}
              </div>
              {!plans.best && <Alert>Ningún plan alcanza la CM objetivo de {plans.targetCM.toFixed(2)} u/h. Aumenta Δ%.</Alert>}
            </div>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Referencia de fórmulas · {CHART_LABELS[type]}</h2></div>
            <dl className="figures" style={{ border: 0, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
              <Figure label="Error tipo I" value={<span style={{ fontSize: 16 }}>{isVar ? 'α = 2·(1 − Φ(k))' : `α = 1 − P(LCI ≤ X ≤ LCS), X ~ ${type === 'p' || type === 'np' ? 'Binomial' : 'Poisson'}`}</span>}
                sub={isVar ? `k = 3σ → α = ${calcAlpha(3).toFixed(5)}` : `Exacta con los límites reales de esta carta${m ? ` → α = ${m.alpha.toFixed(5)}` : ''}`} />
              <Figure label="Error tipo II" value={<span style={{ fontSize: 15 }}>{betaFormula}</span>} sub={isVar ? `Con LCS = ${fmt(info.main.ucl)} y LCI = ${fmt(info.main.lcl)}. Aproximación normal.` : 'Aproximación normal a la binomial/Poisson.'} />
              <Figure label="ARL" value={<span style={{ fontSize: 16 }}>ARL₀ = 1/α · ARL₁ = 1/(1 − β)</span>} sub="Subgrupos hasta la señal." />
              <Figure label="ATS" value={<span style={{ fontSize: 16 }}>ATS = ARL × t</span>} sub="Tiempo medio hasta la señal (horas)." />
              <Figure label="PPNC" value={<span style={{ fontSize: 16 }}>ATS₁ × %PNC × λ</span>} sub="Unidades defectuosas antes de detectar." />
              {info.sigmaProcess != null && <Figure label="σ̂ del proceso" value={<span style={{ fontSize: 16 }}>{fmt(info.sigmaProcess)} {process?.unit}</span>} sub={`δ = 1 equivale a ${fmt(info.sigmaProcess)} ${process?.unit ?? ''}.`} />}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
