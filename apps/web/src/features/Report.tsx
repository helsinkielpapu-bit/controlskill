// Informe integral (RF-901…RF-903, DA-11, DA-14, DA-17). Datos: /analysis/report.
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CHART_LABELS, type ChartType } from '@controlskill/contracts';
import { normalCDF, mean } from '@controlskill/engine';
import { endpoints } from '../app/api';
import { useSession } from '../app/session';
import { useActiveProcess, ProcessPicker } from '../app/process';
import { Alert, Empty, Loading, sym } from '../ui/components';
import { Cota } from '../ui/Cota';
import { Icon } from '../ui/icons';

const fmt = (v: unknown) => (v == null || !isFinite(Number(v)) ? '—' : Number(v).toFixed(4));
const label = (t?: string) => (t ? CHART_LABELS[t as ChartType] ?? t : '—');
type Tone = 'ok' | 'warn' | 'bad' | 'none';
const Stat = ({ l, v, s, tone }: { l: string; v: React.ReactNode; s?: React.ReactNode; tone?: Tone }) => (
  <div className="figure"><dt className="label"><span>{sym(l)}</span></dt><dd><span className={`n ${tone ?? ''}`} style={{ fontSize: 22 }}>{v}</span></dd>{s && <span className="sub">{s}</span>}</div>
);
const Tag = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => <span className={`state ${tone}`} style={{ border: '1px solid currentColor', padding: '1px 8px', marginRight: 8 }}>{children}</span>;

function stability(cc: any): { label: string; tone: Tone; text: string } {
  if (!cc) return { label: 'Sin datos', tone: 'none', text: '' };
  if (cc.oocCount === 0 && cc.totalSubgroups >= 20) return { label: 'Estable', tone: 'ok', text: 'El proceso opera dentro de los límites de control sin señales especiales. La variabilidad es atribuible a causas comunes únicamente.' };
  if (cc.oocCount === 0 && cc.totalSubgroups >= 2) return { label: 'Preliminar', tone: 'none', text: 'No se detectan puntos fuera de control, pero el número de subgrupos es aún limitado para confirmar estabilidad definitiva.' };
  if (cc.oocCount <= 3) return { label: 'Marginalmente estable', tone: 'warn', text: `Se detectaron ${cc.oocCount} punto${cc.oocCount > 1 ? 's' : ''} fuera de control (${cc.summary.oocRate}%). Aunque la mayoría de los puntos están dentro de límites, las señales especiales requieren investigación.` };
  return { label: 'Inestable', tone: 'bad', text: `Se detectaron ${cc.oocCount} puntos fuera de control (${cc.summary.oocRate}%). El proceso presenta causas asignables que deben identificarse y eliminarse antes de establecer límites definitivos.` };
}
// DA-14: el corrimiento de 8 puntos ya no se rotula como regla 2 de Nelson (que usa 9).
const RULE_TEXT: Record<string, { label: string; detail: string }> = {
  ooc: { label: 'Puntos fuera de límites', detail: 'Uno o más puntos superan las bandas de ±3σ (regla 1 de Nelson).' },
  trend: { label: 'Tendencia', detail: '6 o más puntos consecutivos en tendencia monótona (regla 3 de Nelson).' },
  shift: { label: 'Corrimiento (8 puntos)', detail: '8 o más puntos consecutivos al mismo lado de la línea central.' }
};
const cpkScale = (v: number) => v >= 2 ? 'Excelente' : v >= 1.67 ? 'Bueno' : v >= 1.33 ? 'Aceptable' : v >= 1 ? 'Marginal' : v >= 0.67 ? 'Pobre' : 'Inaceptable';
function risk(cap: any): { label: string; tone: Tone; text: string } {
  if (!cap) return { label: 'Sin datos', tone: 'none', text: 'No hay datos de capacidad para evaluar el riesgo.' };
  if (cap.cpk >= 1.33) return { label: 'Muy bajo', tone: 'ok', text: 'Riesgo mínimo: el proceso es capaz (Cpk ≥ 1.33).' };
  if (cap.cpk >= 1.0) return { label: 'Moderado', tone: 'warn', text: `Riesgo moderado: proceso marginalmente capaz (Cpk = ${cap.cpk.toFixed(3)}). Se recomienda monitoreo continuo.` };
  return { label: 'Alto', tone: 'bad', text: `Riesgo alto: proceso no capaz (Cpk = ${cap.cpk.toFixed(3)}). Se requieren acciones correctivas.` };
}
function crossAnalysis(d: any) {
  const recs: { prio: 'high' | 'med' | 'low'; text: string }[] = [];
  const cap = d.capability, cc = d.controlChart, st = d.statisticalTests;
  const isNormal = st?.normality?.normal, isStable = cc && cc.oocCount === 0, isCapable = cap && cap.cpk >= 1.33, isMarginal = cap && cap.cpk >= 1.0 && cap.cpk < 1.33;
  if (isStable && isCapable) recs.push({ prio: 'low', text: 'El proceso es estable y capaz. Mantener monitoreo de rutina y considerar reducir frecuencia de muestreo.' });
  if (isStable && isMarginal) recs.push({ prio: 'med', text: 'Proceso estable pero marginalmente capaz. Reducir variabilidad común (menor σ) o centrar la media hacia el nominal.' });
  if (isStable && cap && cap.cpk < 1.0) recs.push({ prio: 'high', text: 'Proceso estable pero no capaz. Urgente: reducir variabilidad o ajustar media. Evaluar tolerancias de especificación.' });
  if (!isStable && cap) recs.push({ prio: 'high', text: 'Proceso inestable — los índices de capacidad no son fiables. Primero estabilizar el proceso eliminando causas asignables, luego recalcular capacidad.' });
  if (isNormal === false) recs.push({ prio: 'med', text: 'Los datos no son normales. Los índices Cp/Cpk asumen normalidad — considerar transformación Box-Cox o usar índices no paramétricos. Verificar histograma para identificar asimetría o valores atípicos.' });
  if (cap && cap.cpk < cap.cp - 0.1) recs.push({ prio: 'high', text: `Diferencia significativa entre Cp (${fmt(cap.cp)}) y Cpk (${fmt(cap.cpk)}). El proceso está descentrado: ajustar la media hacia el nominal para mejorar capacidad real.` });
  if (cc && cc.totalSubgroups < 20 && cc.oocCount === 0) recs.push({ prio: 'low', text: `Solo ${cc.totalSubgroups} subgrupos disponibles. Para una validación robusta de estabilidad se recomiendan ≥ 20 subgrupos.` });
  if (cap && cap.cpk < 1.0) recs.push({ prio: 'high', text: 'El proceso no es capaz (Cpk < 1.0). Implementar mejora continua para reducir variabilidad.' });
  if (cap && cap.distToNominal != null && cap.distToNominal > cap.tolerance * 0.15) recs.push({ prio: 'med', text: `La media está a ${fmt(cap.distToNominal)} del nominal (tolerancia: ${fmt(cap.tolerance)}). Centrar el proceso para maximizar Cpk.` });
  return recs;
}
const PRIO = { high: 'Alta', med: 'Media', low: 'Baja' };
const pncPct = (mu: number, s: number, usl: number, lsl: number) => (normalCDF((lsl - mu) / s) + (1 - normalCDF((usl - mu) / s))) * 100;

export default function Report() {
  const { company } = useSession();
  const { processId, processes, select } = useActiveProcess();
  const [phase, setPhase] = useState<'all' | 'fase1' | 'fase2' | 'muestreo'>('all');
  const [pdfBusy, setPdfBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const rep = useQuery({ queryKey: ['report', processId], enabled: !!processId, queryFn: () => endpoints.report(processId!) });
  const d = rep.data;

  async function pdf() {
    if (!sheetRef.current || !d) return;
    setPdfBusy(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default as any;
      const fecha = new Date().toISOString().slice(0, 10);
      await html2pdf().set({ margin: [10, 10, 10, 10], filename: `SPC_${String(d.process.name).replace(/[^a-z0-9]/gi, '_')}_${fecha}.pdf`, image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(sheetRef.current).save();
    } catch (e) { alert('Error al generar el PDF: ' + (e as Error).message); } finally { setPdfBusy(false); }
  }

  const show1 = phase === 'all' || phase === 'fase1', show2 = phase === 'all' || phase === 'fase2', showM = phase === 'all' || phase === 'muestreo';

  return (
    <>
      <div className="page-head no-print">
        <div><h1>Informe de análisis</h1><p className="lede">Diagnóstico integral de Fase I, Fase II y muestreo, exportable a PDF.</p></div>
        <div className="actions"><button className="btn primary" onClick={pdf} disabled={!d || pdfBusy}><Icon name="download" />{pdfBusy ? 'Generando…' : 'Descargar PDF'}</button></div>
      </div>
      <div className="sheet no-print" style={{ marginBottom: 16 }}>
        <div className="sheet-body toolbar">
          <ProcessPicker value={processId} processes={processes} onChange={select} />
          <div className="field"><span>Contenido</span><div className="seg">
            {([['all', 'Todo'], ['fase1', 'Fase I'], ['fase2', 'Fase II'], ['muestreo', 'Muestreo']] as const).map(([v, l]) => <button key={v} aria-pressed={phase === v} onClick={() => setPhase(v)}>{l}</button>)}
          </div></div>
        </div>
      </div>
      {!processId && <section className="sheet"><Empty title="Selecciona un proceso">Elige un proceso para generar su informe.</Empty></section>}
      {rep.isLoading && <Loading text="Generando informe…" />}
      {rep.error && <Alert>{(rep.error as Error).message}</Alert>}
      {d && d.dataSummary.n === 0 && <Alert kind="warning">El proceso no tiene datos de Fase I. Ingresa mediciones en Entrada de datos primero.</Alert>}

      {d && (
        <div className="report" ref={sheetRef}>
          <header>
            <h1 style={{ fontSize: 28 }}>Informe de análisis estadístico</h1>
            <p style={{ color: 'var(--text-2)', marginTop: 4 }}>{company?.name} — {d.process.name}</p>
            <div className="title-block">
              <div><span className="label">Proceso</span><div>{d.process.name}</div></div>
              <div><span className="label">Carta</span><div>{label(d.process.chartType)}</div></div>
              <div><span className="label">Fecha</span><div>{new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
              <div><span className="label">Especificación</span><div>{d.process.usl != null && d.process.lsl != null ? `LSI ${d.process.lsl} · LSE ${d.process.usl}${d.process.nominal != null ? ` · Nom. ${d.process.nominal}` : ''}` : 'Sin especificaciones'}</div></div>
              <div><span className="label">Mediciones</span><div>{d.dataSummary.n}</div></div>
              <div><span className="label">Unidad</span><div>{d.process.unit ?? '—'}</div></div>
            </div>
          </header>

          {show1 && <Phase1 d={d} />}
          {show2 && <Phase2 d={d} />}
          {showM && (
            <section><h2>Planes de muestreo por atributos</h2>
              <p className="note">Los planes de muestreo se diseñan en el módulo Muestreo: configura NCA (AQL), NRC (LTPD) y los riesgos α y β para obtener el plan óptimo (n, NAC), la curva CO, el AOQ y las recomendaciones. <b>Parámetros por defecto:</b> N = 1000, AQL = 1%, α = 5%, LTPD = 5%, β = 10%.</p>
            </section>)}
          {show1 && <Conclusion d={d} />}
        </div>
      )}
    </>
  );
}

function Phase1({ d }: { d: any }) {
  const ds = d.dataSummary, cc = d.controlChart, cap = d.capability, st = d.statisticalTests, h = d.histogram;
  const stab = stability(cc);
  const rules = cc ? [...new Set<string>(cc.violations.map((v: any) => v.rule))].map(r => RULE_TEXT[r]!) : [];
  const capTone: Tone = cap ? (cap.cpk >= 1.33 ? 'ok' : cap.cpk >= 1 ? 'warn' : 'bad') : 'none';
  const usl = d.process.usl, lsl = d.process.lsl;
  return (
    <>
      <section>
        <h2>Fase I — Estabilización</h2>
        <dl className="figures">
          <Stat l="n — Mediciones" v={ds.n} s="tamaño de muestra" />
          <Stat l="Media (x̄)" v={fmt(ds.mean)} s="promedio general" />
          <Stat l="Desv. estándar (σ̂)" v={fmt(ds.stdDev)} s={cap?.sigmaMethod === 'sbar_c4' ? 'σ̂ = S̄/c₄ (dentro de subgrupos)' : cap?.sigmaMethod === 'rbar_d2' ? 'σ̂ = R̄/d₂ (dentro de subgrupos)' : 'desviación estándar muestral'} />
          <Stat l="Mínimo" v={fmt(ds.min)} /><Stat l="Máximo" v={fmt(ds.max)} /><Stat l="Rango" v={fmt(ds.range)} s="amplitud total" />
        </dl>
        {cc?.summary && <>
          <h3 style={{ margin: '18px 0 8px' }}>{sym(`Carta de control — ${label(d.process.chartType)}`)}</h3>
          <dl className="figures">
            <Stat l="LCS" v={fmt(cc.summary.ucl)} s="+3σ sobre la línea central" /><Stat l="LC" v={fmt(cc.summary.cl)} s="media de los subgrupos" /><Stat l="LCI" v={fmt(cc.summary.lcl)} s="−3σ bajo la línea central" />
            <Stat l="Subgrupos" v={cc.totalSubgroups} s="totales analizados" /><Stat l="Media de puntos" v={fmt(cc.summary.mean)} />
            <Stat l="Estado" v={<span style={{ fontSize: 16 }}>{cc.oocCount === 0 ? 'En control estadístico' : `${cc.oocCount} punto${cc.oocCount > 1 ? 's' : ''} fuera de control (${cc.summary.oocRate}%)`}</span>} tone={cc.oocCount === 0 ? 'ok' : 'bad'} />
          </dl>
          <p className="note"><Tag tone={stab.tone}>{stab.label}</Tag><b>Análisis de estabilidad:</b> {stab.text}
            {cc.totalSubgroups < 10 && ' El número reducido de subgrupos limita la potencia de las pruebas de estabilidad.'}
            {cc.totalSubgroups >= 25 && ' Con ≥25 subgrupos, la estimación de los límites de control es robusta.'}</p>
          {rules.length > 0 && <div className="note"><b>Reglas de control violadas</b><ul style={{ paddingLeft: 18, marginTop: 6 }}>{rules.map(r => <li key={r.label}><b>{r.label}:</b> {r.detail}</li>)}</ul></div>}
        </>}
        {cap && <>
          <h3 style={{ margin: '18px 0 8px' }}>Análisis de capacidad</h3>
          {usl != null && lsl != null && <Cota lsl={Number(lsl)} usl={Number(usl)} nominal={d.process.nominal != null ? Number(d.process.nominal) : null} xbar={cap.xbar} sigma={cap.sigma} unit={d.process.unit} large />}
          <dl className="figures">
            <Stat l="Cp — potencial" v={fmt(cap.cp)} tone={capTone} s="si el proceso estuviera centrado" />
            <Stat l="Cpk — real" v={fmt(cap.cpk)} tone={capTone} s={`capacidad real (${cpkScale(cap.cpk)})`} />
            <Stat l="Cpu / Cpl" v={`${fmt(cap.cpu)} / ${fmt(cap.cpl)}`} /><Stat l="σ — variabilidad" v={fmt(cap.sigma)} />
            <Stat l="Tolerancia" v={fmt(cap.tolerance)} s={`LSE − LSI (${usl}, ${lsl})`} /><Stat l="Distancia a LSE" v={fmt(cap.distToUsl)} /><Stat l="Distancia a LSI" v={fmt(cap.distToLsl)} />
            {cap.distToNominal != null && <Stat l="Descentrado" v={fmt(cap.distToNominal)} s="|media − nominal|" />}
          </dl>
          <p className="note"><Tag tone={risk(cap).tone}>Riesgo {risk(cap).label}</Tag><b>Interpretación:</b> Cp = {fmt(cap.cp)} indica la capacidad potencial si el proceso estuviera centrado. Cpk = {fmt(cap.cpk)} es la capacidad real considerando la ubicación actual de la media.{' '}
            {cap.cpk < cap.cp - 0.05 ? `Hay una diferencia de ${fmt(cap.cp - cap.cpk)} entre Cp y Cpk, lo que sugiere que el proceso está descentrado. ` : 'El proceso está razonablemente centrado. '}{risk(cap).text}
            {st?.normality?.available && !st.normality.normal && ' Nota: los índices de capacidad asumen normalidad; como los datos no son normales, estos valores deben interpretarse con precaución.'}</p>
        </>}
      </section>

      {st && <section>
        <h2>Fase I — Pruebas estadísticas</h2>
        <dl className="figures">
          <Stat l="Anderson-Darling (normalidad)" v={<span style={{ fontSize: 16 }}>{st.normality?.normal ? 'Normal' : 'No normal'}</span>} tone={st.normality?.normal ? 'ok' : 'warn'} s={`A² = ${st.normality?.statistic != null ? st.normality.statistic.toFixed(4) : '—'} · p = ${st.normality?.p_value != null ? st.normality.p_value.toFixed(4) : '—'}`} />
          <Stat l="Levene (varianzas)" v={<span style={{ fontSize: 16 }}>{st.homoscedasticity?.homoscedastic ? 'Varianzas homogéneas' : 'Varianzas heterogéneas'}</span>} tone={st.homoscedasticity?.homoscedastic ? 'ok' : 'warn'} s={`W = ${st.homoscedasticity?.statistic != null ? st.homoscedasticity.statistic.toFixed(4) : '—'} · p = ${st.homoscedasticity?.p_value != null ? st.homoscedasticity.p_value.toFixed(4) : '—'}`} />
          <Stat l="Kruskal-Wallis (grupos)" v={<span style={{ fontSize: 16 }}>{st.homogeneity?.homogeneous ? 'Grupos homogéneos' : 'Diferencias significativas'}</span>} tone={st.homogeneity?.homogeneous ? 'ok' : 'warn'} s={`H = ${st.homogeneity?.statistic != null ? st.homogeneity.statistic.toFixed(4) : '—'} · p = ${st.homogeneity?.p_value != null ? st.homogeneity.p_value.toFixed(4) : '—'}`} />
        </dl>
        <div className="note"><b>Interpretación:</b>
          <ul style={{ paddingLeft: 18, marginTop: 6 }}>
            <li><b>Normalidad:</b> {st.normality?.available ? st.normality.interpretation : 'Prueba no disponible.'}</li>
            <li><b>Homogeneidad:</b> {st.homoscedasticity?.available ? st.homoscedasticity.interpretation : 'Prueba no disponible (se requieren ≥2 subgrupos con ≥2 obs. cada uno).'}</li>
            <li><b>Grupos:</b> {st.homogeneity?.available ? st.homogeneity.interpretation : 'Prueba no disponible (se requieren ≥2 subgrupos).'}</li>
          </ul>
          {st.normality?.available && !st.normality.normal && <p style={{ marginTop: 8 }}><b>Implicación:</b> la no-normalidad afecta la interpretación de los índices Cp/Cpk (asumen normalidad) y la probabilidad de falsas alarmas en la carta de control. Considere transformar los datos o usar límites de control no paramétricos.</p>}
          {st.homoscedasticity?.available && !st.homoscedasticity.homoscedastic && <p style={{ marginTop: 8 }}><b>Implicación:</b> varianzas heterogéneas entre subgrupos sugieren que la variabilidad del proceso no es constante. Los límites de control calculados con σ global pueden no ser apropiados para todos los subgrupos.</p>}
        </div>
      </section>}

      {h?.midpoints && (() => {
        const total = h.frequencies.reduce((a: number, b: number) => a + b, 0);
        const maxIdx = h.frequencies.indexOf(Math.max(...h.frequencies));
        const asym = maxIdx < h.frequencies.length / 2 - 1 ? 'Los datos se concentran hacia el límite inferior (sesgo izquierdo).' : maxIdx > h.frequencies.length / 2 + 1 ? 'Los datos se concentran hacia el límite superior (sesgo derecho).' : 'Los datos presentan una distribución relativamente simétrica.';
        const gaps = h.frequencies.filter((f: number) => f === 0).length > h.frequencies.length * 0.3;
        return <section>
          <h2>Fase I — Histograma</h2>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 8 }}>{h.labels.length} intervalos · rango [{fmt(h.min)}, {fmt(h.max)}]</p>
          <table className="data dense"><thead><tr><th>Intervalo</th><th className="num">Frecuencia</th><th>%</th></tr></thead>
            <tbody>{h.midpoints.map((m: number, i: number) => { const f = h.frequencies[i] || 0, pct = total ? f / total * 100 : 0; return (
              <tr key={i}><td>{(m - h.binWidth / 2).toFixed(3)} — {(m + h.binWidth / 2).toFixed(3)}</td><td className="num">{f}</td><td><span style={{ display: 'inline-block', width: 44 }}>{pct.toFixed(1)}%</span><span style={{ display: 'inline-block', height: 8, width: Math.round(pct * 3), background: 'var(--ink)', verticalAlign: 'middle' }} /></td></tr>); })}</tbody></table>
          <div className="note"><b>Análisis de distribución:</b>
            <ul style={{ paddingLeft: 18, marginTop: 6 }}>
              <li>{asym}</li>
              {gaps && <li>Se observan intervalos con frecuencia cero — posible estratificación o datos faltantes entre ciertos rangos.</li>}
              {h.binWidth > 0 && <li>Ancho de intervalo: {fmt(h.binWidth)}. {h.frequencies.length < 8 ? 'El número reducido de intervalos puede ocultar detalles de la distribución.' : h.frequencies.length > 20 ? 'El número elevado de intervalos puede generar ruido visual.' : 'El número de intervalos es adecuado para visualizar la distribución.'}</li>}
              {usl != null && lsl != null && <li>Límites de especificación: LSI = {fmt(lsl)}, LSE = {fmt(usl)}. {h.max > Number(usl) && 'Hay datos que superan el LSE. '}{h.min < Number(lsl) && 'Hay datos por debajo del LSI.'}</li>}
            </ul></div>
        </section>;
      })()}

      {(cap || cc || st) && (() => {
        const isStable = cc && cc.oocCount === 0, isCapable = cap && cap.cpk >= 1.33, isMarginal = cap && cap.cpk >= 1.0 && cap.cpk < 1.33;
        const isNormal = st?.normality?.available ? st.normality.normal : null;
        const [tone, title, detail]: [Tone, string, string] =
          isStable && isCapable ? ['ok', 'Estable y capaz', 'El proceso cumple con los requisitos de estabilidad y capacidad. Ideal para producción sostenible.']
          : isStable && isMarginal ? ['warn', 'Estable pero marginal', 'El proceso es estable pero la capacidad es marginal. Requiere monitoreo continuo y acciones de mejora para alcanzar Cpk ≥ 1.33.']
          : isStable && cap && cap.cpk < 1.0 ? ['bad', 'Estable pero no capaz', 'Proceso estable pero incapaz de producir dentro de especificaciones. Urgente reducir variabilidad o ajustar tolerancias.']
          : !isStable && cap && isCapable ? ['warn', 'Inestable pero capaz', 'Aunque los índices de capacidad son buenos, la inestabilidad invalida su interpretación. Primero estabilizar el proceso.']
          : !isStable && cap && isMarginal ? ['bad', 'Inestable y marginal', 'El proceso es inestable y marginalmente capaz. Abordar causas asignables y luego mejorar capacidad.']
          : !isStable && cc && cap ? ['bad', 'Inestable y no capaz', 'Situación crítica: inestable e incapaz. Detener producción si es posible, identificar causas asignables, reducir variabilidad.']
          : !cc && cap ? ['none', 'Sin carta de control', 'No hay datos de carta de control para evaluar estabilidad. La capacidad se calculó sobre datos agrupados.']
          : ['none', 'Datos insuficientes', 'No hay suficientes datos de Fase I para una evaluación integral.'];
        const recs = crossAnalysis(d);
        return <section>
          <h2>Evaluación integral</h2>
          <dl className="figures">
            <Stat l="Estabilidad" v={<span style={{ fontSize: 16 }}>{stability(cc).label}</span>} tone={stability(cc).tone} s={cc ? `${cc.totalSubgroups} subgrupos analizados` : 'No evaluado'} />
            <Stat l="Capacidad (Cpk)" v={cap ? fmt(cap.cpk) : '—'} tone={cap ? (cap.cpk >= 1.33 ? 'ok' : cap.cpk >= 1 ? 'warn' : 'bad') : 'none'} s={cap ? (cap.cpk >= 1.33 ? 'Capaz' : cap.cpk >= 1 ? 'Marginal' : 'No capaz') : 'Sin datos'} />
            <Stat l="Normalidad" v={<span style={{ fontSize: 16 }}>{isNormal === true ? 'Normal' : isNormal === false ? 'No normal' : '—'}</span>} tone={isNormal === true ? 'ok' : isNormal === false ? 'warn' : 'none'} s="Anderson-Darling" />
            <Stat l="Riesgo de defectos" v={<span style={{ fontSize: 16 }}>{risk(cap).label}</span>} tone={risk(cap).tone} />
          </dl>
          <p className="note"><Tag tone={tone}>{title}</Tag><b>Diagnóstico integral:</b> {detail}{isNormal === false && ' La no-normalidad añade incertidumbre a los índices de capacidad.'}{cap && cap.cp > 1.67 && ' La capacidad potencial (Cp) es excelente, lo que indica que hay oportunidad de mejorar la capacidad real centrando el proceso.'}</p>
          {recs.length > 0 && <table className="data dense" style={{ marginTop: 12 }}><thead><tr><th>Prioridad</th><th>Recomendación</th></tr></thead>
            <tbody>{recs.map((r, i) => <tr key={i}><td><span className={`prio ${r.prio}`}>{PRIO[r.prio]}</span></td><td>{r.text}</td></tr>)}</tbody></table>}
        </section>;
      })()}
    </>
  );
}

function Phase2({ d }: { d: any }) {
  const sgs: { subgroup_id: number; values: number[]; sampleSize: number }[] = d.phaseTwo ?? [];
  const type = d.process.chartType as string;
  const isX = type === 'xbar_r' || type === 'xbar_s';
  const means = sgs.map(g => (isX ? mean(g.values) : type === 'p' || type === 'u' ? g.values.reduce((a, b) => a + b, 0) / g.sampleSize : g.values.reduce((a, b) => a + b, 0)));
  // DA-27: la Fase II se compara con los límites de Fase I congelados, si existen
  const fz = d.frozenLimits;
  const fMain = fz?.chartData?.[isX ? 'xbar' : type];
  const summary = fMain ? { cl: fMain.cl, ucl: fMain.ucl, lcl: fMain.lcl } : d.controlChart?.summary;
  const ev = d.evaluation?.data;
  return (
    <section>
      <h2>Fase II — Monitoreo SPC</h2>
      {fz && <p className="note">Comparada con los límites de Fase I congelados el {new Date(fz.frozenAt).toLocaleDateString('es-MX')}{fz.stale ? '; las mediciones de Fase I cambiaron después, pero la Fase II se sigue evaluando contra esos límites' : ''}.</p>}
      {!sgs.length ? <p className="note">No hay datos de Fase II guardados para este proceso. Inicia un monitoreo en el módulo correspondiente.</p> : (() => {
        const mu1 = mean(means), mu0 = summary?.cl ?? d.dataSummary?.mean ?? null;
        const sigma = (isX ? fz?.sigmaWithin : null) ?? d.capability?.sigma ?? null;
        const nSize = (isX ? fz?.effectiveN : null) ?? (d.process.nSize ? parseInt(d.process.nSize) : (isX ? sgs[0]!.values.length : null));
        const sigmaX = sigma != null && nSize ? sigma / Math.sqrt(nSize) : null;
        const monShift = sigmaX && mu0 != null ? (mu1 - mu0) / sigmaX : null;
        const shift = sigma && mu0 != null ? (mu1 - mu0) / sigma : null;
        const usl = d.process.usl != null ? Number(d.process.usl) : null, lsl = d.process.lsl != null ? Number(d.process.lsl) : null;
        const pnc0 = sigma && usl != null && lsl != null && mu0 != null ? pncPct(mu0, sigma, usl, lsl) : null;
        const pnc1 = sigma && usl != null && lsl != null ? pncPct(mu1, sigma, usl, lsl) : null;
        const dp = pnc0 != null && pnc1 != null ? pnc1 - pnc0 : null;
        const recent = sgs.map((g, i) => ({ g, v: means[i]! })).slice(-20);
        return <>
          <dl className="figures">
            <Stat l="Subgrupos en Fase II" v={sgs.length} /><Stat l="n (tamaño de subgrupo)" v={nSize ?? '—'} />
            <Stat l="Media Fase I (μ₀)" v={fmt(mu0)} /><Stat l="Media Fase II (μ₁)" v={fmt(mu1)} />
            <Stat l="Desplazamiento (σ proceso)" v={shift != null ? `${shift >= 0 ? '+' : ''}${shift.toFixed(4)}σ` : '—'} tone={shift != null && Math.abs(shift) > 0.5 ? 'bad' : undefined} s={`X̄: ${monShift != null ? `${monShift >= 0 ? '+' : ''}${monShift.toFixed(2)}σ` : '—'} · n = ${nSize ?? '?'}`} />
            <Stat l="%PNC original (μ₀)" v={pnc0 != null ? pnc0.toFixed(4) + '%' : '—'} /><Stat l="%PNC recalculado (μ₁)" v={pnc1 != null ? pnc1.toFixed(4) + '%' : '—'} />
            <Stat l="Δ %PNC" v={dp != null ? `${dp >= 0 ? '+' : ''}${dp.toFixed(4)} p. p.` : '—'} tone={dp != null ? (dp > 0 ? 'bad' : dp < 0 ? 'ok' : undefined) : undefined} />
          </dl>
          <p className="note">La sesión de monitoreo registró <b>{sgs.length}</b> subgrupos (n = {nSize ?? '?'}) en Fase II. {mu0 != null && <>La media pasó de <b>{fmt(mu0)}</b> (Fase I) a <b>{fmt(mu1)}</b> (Fase II). </>}
            {shift != null && <>Desplazamiento de <b>{shift >= 0 ? '+' : ''}{shift.toFixed(4)}σ</b> en el proceso. </>}
            {monShift != null && <>En la carta X̄ equivale a <b>{monShift >= 0 ? '+' : ''}{monShift.toFixed(2)}σ</b>. </>}
            {shift != null && Math.abs(shift) >= 1 ? 'El desplazamiento supera 1σ del proceso, puede indicar un cambio significativo en la calidad del producto.' : shift != null && Math.abs(shift) >= 0.5 ? 'El desplazamiento supera 0.5σ del proceso, monitorear tendencia cuidadosamente.' : 'El proceso se mantiene centrado respecto a la referencia de Fase I.'}</p>
          <table className="data dense" style={{ marginTop: 12 }}><thead><tr><th>Subgrupo</th><th className="num">Valor</th><th>Estado</th></tr></thead>
            <tbody>{recent.map(({ g, v }) => { const bad = summary && (v > summary.ucl || v < summary.lcl); return <tr key={g.subgroup_id} className={bad ? 'flag' : ''}><td>SG #{g.subgroup_id}</td><td className="num">{v.toFixed(4)}</td><td className={`state ${bad ? 'bad' : 'ok'}`}>{bad ? 'Fuera de control' : 'En control'}</td></tr>; })}</tbody></table>
          {sgs.length > 20 && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>Mostrando los últimos 20 de {sgs.length} subgrupos.</p>}
        </>;
      })()}

      {ev && ev.mu0 != null && ev.deltaReal != null && (() => {
        const s = ev.sigmaP ?? d.capability?.sigma, usl = ev.usl ?? (d.process.usl != null ? Number(d.process.usl) : null), lsl = ev.lsl ?? (d.process.lsl != null ? Number(d.process.lsl) : null);
        const p0 = s > 0 && usl != null && lsl != null ? pncPct(ev.mu0, s, usl, lsl) : null, p1 = s > 0 && usl != null && lsl != null && ev.mu1 != null ? pncPct(ev.mu1, s, usl, lsl) : null;
        const p = ev.performance;
        return <>
          <h3 style={{ margin: '18px 0 8px' }}>Evaluación de desempeño guardada ({new Date(d.evaluation.saved_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })})</h3>
          <dl className="figures">
            <Stat l="μ₀" v={fmt(ev.mu0)} /><Stat l="μ₁" v={fmt(ev.mu1)} /><Stat l="δ (σ proceso)" v={`${ev.deltaReal >= 0 ? '+' : ''}${ev.deltaReal.toFixed(4)}σ`} tone={Math.abs(ev.deltaReal) > 0.5 ? 'bad' : undefined} />
            <Stat l="σ̂ proceso" v={fmt(s)} /><Stat l="n" v={ev.n} /><Stat l="Subgrupos" v={ev.sgCount} />
            <Stat l="%PNC original" v={p0 != null ? p0.toFixed(4) + '%' : '—'} /><Stat l="%PNC recalculado" v={p1 != null ? p1.toFixed(4) + '%' : '—'} />
            {p && <>
              <Stat l="Configuración" v={<span style={{ fontSize: 15 }}>k = {p.k}σ · n = {p.n} · t = {p.h} h · δ = {p.delta}σ</span>} />
              <Stat l="α" v={p.alpha < 0.001 ? p.alpha.toExponential(2) : p.alpha.toFixed(4)} /><Stat l="β" v={p.beta.toFixed(4)} /><Stat l="Potencia" v={`${(p.power * 100).toFixed(1)}%`} />
              <Stat l="ARL₀ / ARL₁" v={`${fmt(p.arl0)} / ${fmt(p.arl1)}`} /><Stat l="ATS₀ / ATS₁" v={`${p.ats0.toFixed(1)} / ${p.ats1.toFixed(1)} h`} /><Stat l="PPNC" v={`${fmt(p.ppnc)} u`} />
            </>}
          </dl>
          {ev.cmPlans?.best && <p className="note"><b>Plan recomendado (carga muestral, CM objetivo {ev.cmPlans.targetCM.toFixed(2)} u/h):</b> n = {Number.isInteger(ev.cmPlans.best.n) ? ev.cmPlans.best.n : ev.cmPlans.best.n.toFixed(2)} · t = {ev.cmPlans.best.t.toFixed(2)} h · ATS₁ = {ev.cmPlans.best.ats1.toFixed(1)} h</p>}
        </>;
      })()}
    </section>
  );
}

function Conclusion({ d }: { d: any }) {
  const cap = d.capability, cc = d.controlChart, st = d.statisticalTests;
  const isNormal = st?.normality?.available ? st.normality.normal : null;
  const high = crossAnalysis(d).filter(r => r.prio === 'high');
  let p1: React.ReactNode;
  if (cap && cc && cc.oocCount === 0 && cap.cpk >= 1.33) p1 = <>El proceso se encuentra en <b>control estadístico</b> y es <b>capaz</b> (Cpk = {fmt(cap.cpk)}). Está operando dentro de los límites de control y cumple las especificaciones con margen.{cap.cpk >= 1.67 && ' La capacidad es excelente (Cpk ≥ 1.67), lo que indica un proceso de alta calidad.'}</>;
  else if (cap && cc && cc.oocCount === 0 && cap.cpk >= 1.0) p1 = <>El proceso es <b>estable</b> pero su capacidad es <b>marginal</b> (Cpk = {fmt(cap.cpk)}). Aunque no hay causas asignables, la variabilidad común es excesiva para las especificaciones actuales.</>;
  else if (cap && cc && cc.oocCount === 0) p1 = <>El proceso es <b>estable</b> pero <b>no es capaz</b> (Cpk = {fmt(cap.cpk)}). Se requiere acción correctiva para reducir variabilidad o ajustar la media.</>;
  else if (cap && cc) p1 = <>El proceso presenta <b>inestabilidad</b> ({cc.oocCount} punto{cc.oocCount > 1 ? 's' : ''} fuera de control) y una capacidad {cap.cpk >= 1.33 ? 'aparentemente buena' : cap.cpk >= 1.0 ? 'marginal' : 'insuficiente'} (Cpk = {fmt(cap.cpk)}). Los índices de capacidad no son fiables hasta estabilizar el proceso.</>;
  else if (cap) p1 = <>No se pudo evaluar la estabilidad por falta de datos de carta de control. La capacidad calculada (Cpk = {fmt(cap.cpk)}) asume que el proceso está estable, lo cual debe verificarse.</>;
  else if (cc) p1 = <>No hay límites de especificación definidos, por lo que no se puede calcular la capacidad del proceso. La carta de control muestra un proceso {cc.oocCount === 0 ? 'estable' : 'con señales fuera de control'}.</>;
  else p1 = 'No hay suficientes datos de Fase I para generar una conclusión sustancial.';
  return (
    <section>
      <h2>Conclusión general</h2>
      <div className="note" style={{ borderColor: 'var(--ink)', borderWidth: 2, display: 'grid', gap: 8 }}>
        <p>{p1}</p>
        {st && <p>{isNormal === true && 'Los datos siguen una distribución normal (Anderson-Darling, p > 0.05), lo que valida el uso de índices Cp/Cpk y la interpretación de la carta de control basada en ±3σ.'}
          {isNormal === false && <>Los datos <b>no son normales</b> (Anderson-Darling, p = {st.normality.p_value.toFixed(4)}). Los índices de capacidad deben interpretarse con precaución. Se recomienda transformación Box-Cox o usar técnicas no paramétricas.</>}
          {st.homoscedasticity?.available && !st.homoscedasticity.homoscedastic && ` Además, las varianzas no son homogéneas entre subgrupos (Levene, p = ${st.homoscedasticity.p_value.toFixed(4)}), lo que sugiere que la variabilidad no es constante.`}</p>}
        {high.length > 0 ? <div><b>Acciones prioritarias requeridas:</b><ul style={{ paddingLeft: 18, marginTop: 4 }}>{high.map((r, i) => <li key={i}>{r.text}</li>)}</ul></div>
          : cap && cap.cpk >= 1.33 && cc && cc.oocCount === 0 ? <p>Se recomienda mantener el monitoreo de rutina y proceder a Fase II para vigilancia continua. Considere reducir la frecuencia de muestreo si el proceso se mantiene estable y capaz.</p>
          : cap && cap.cpk >= 1.0 ? <p>Se recomienda implementar un plan de mejora enfocado en reducir la variabilidad y/o centrar la media hacia el nominal para alcanzar Cpk ≥ 1.33.</p> : null}
      </div>
    </section>
  );
}
