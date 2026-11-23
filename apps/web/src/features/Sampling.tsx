// Diseño de planes de muestreo por atributos (RF-801…RF-805, DA-04). Todo en el navegador.
import { useState } from 'react';
import { aoqCurve, candidatePlans, evaluateSampling, meets, ocCurve, readNumber, type SamplingResult } from '@controlskill/engine';
import { Alert, Field, Figure } from '../ui/components';
import { LineChart } from '../charts/Charts';
import { Icon } from '../ui/icons';

const num = (v: string, d: number) => parseFloat(v) || d;     // vacío o 0 → valor por defecto
const int = (v: string, d: number) => parseInt(v) || d;

export default function Sampling() {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [a, setA] = useState({ N: '1000', aql: '1.0', alpha: '5', ltpd: '5.0', beta: '10' });
  const [m, setM] = useState({ N: '1000', n: '80', nac: '2', aql: '1.0', ltpd: '5.0' });

  const input = mode === 'auto'
    ? { mode, N: int(a.N, 1000), aql: num(a.aql, 1) / 100, alpha: num(a.alpha, 5) / 100, ltpd: num(a.ltpd, 5) / 100, beta: num(a.beta, 10) / 100 } as const
    : { mode, N: int(m.N, 1000), n: int(m.n, 80), c: readNumber(m.nac, 2, parseInt) /* DA-04: el 0 se respeta */, aql: num(m.aql, 1) / 100, ltpd: num(m.ltpd, 5) / 100 } as const;
  const r = evaluateSampling(input);
  const ok = r.feasible ? (r as SamplingResult) : null;

  const field = (label: string, key: string, state: Record<string, string>, set: (f: (s: any) => any) => void, opts: { step?: number; hint?: string } = {}) => (
    <Field label={label} hint={opts.hint}><input className="input" type="number" step={opts.step ?? 1} min={0} value={state[key]} onChange={e => set(s => ({ ...s, [key]: e.target.value }))} /></Field>
  );

  return (
    <>
      <div className="page-head"><div><h1>Diseño de planes de muestreo</h1><p className="lede">Muestreo simple por atributos con distribución binomial: protección del productor (α en NCA) y del consumidor (β en NRC).</p></div></div>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <div className="sheet-head">
          <div className="seg"><button aria-pressed={mode === 'auto'} onClick={() => setMode('auto')}>Diseño automático</button><button aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>Plan manual</button></div>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{mode === 'auto' ? 'Define las restricciones de calidad: el plan óptimo (n, NAC) se calcula automáticamente.' : 'Ingresa n y NAC: se calculan la curva CO y las métricas.'}</span>
        </div>
        <div className="sheet-body grid-form">
          {mode === 'auto' ? <>
            {field('N — tamaño del lote', 'N', a, setA)}
            {field('NCA / AQL (%)', 'aql', a, setA, { step: 0.01 })}
            {field('α — riesgo del productor (%)', 'alpha', a, setA, { step: 0.1 })}
            {field('NRC / LTPD (%)', 'ltpd', a, setA, { step: 0.1 })}
            {field('β — riesgo del consumidor (%)', 'beta', a, setA, { step: 0.1 })}
          </> : <>
            {field('N — tamaño del lote', 'N', m, setM)}
            {field('n — tamaño de muestra', 'n', m, setM)}
            {field('NAC — número de aceptación (c)', 'nac', m, setM, { hint: 'Admite 0 (plan de cero defectos).' })}
            {field('NCA / AQL (%) — referencia', 'aql', m, setM, { step: 0.01 })}
            {field('NRC / LTPD (%) — referencia', 'ltpd', m, setM, { step: 0.1 })}
          </>}
        </div>
      </section>

      {!r.feasible && <Alert>{r.reason === 'aql_ge_ltpd' ? 'NCA debe ser menor que NRC (AQL < LTPD).' : 'No se encontró un plan factible con los parámetros dados. Prueba a aumentar α o β, o a ampliar la separación entre NCA y NRC.'}</Alert>}

      {ok && (
        <div className="stack">
          {ok.truncated && <Alert kind="warning">El plan requiere n = {ok.requiredN} &gt; N = {ok.N}; se inspecciona el lote completo.</Alert>}
          {ok.meetsRisks === false && <Alert>El plan resultante no cumple los riesgos pedidos: α real {(ok.alphaReal * 100).toFixed(2)}% (pedido {(ok.alpha * 100).toFixed(2)}%) · β real {(ok.betaReal * 100).toFixed(2)}% (pedido {(ok.beta * 100).toFixed(2)}%).</Alert>}
          <dl className="figures">
            <Figure label="n — tamaño de muestra" value={ok.n.toLocaleString('es')} large sub="unidades a inspeccionar" />
            <Figure label="NAC — aceptación" value={ok.c} large sub="acepta si defectivos ≤ NAC" tone="ok" />
            <Figure label="NCR — rechazo" value={ok.r} large sub="rechaza si defectivos ≥ NCR" tone="bad" />
            <Figure label="Fracción inspeccionada" value={`${(ok.fraction * 100).toFixed(1)}%`} sub={`${ok.n} / ${ok.N} unidades`} />
            <Figure label="Riesgo del productor (α real)" value={`${(ok.alphaReal * 100).toFixed(2)}%`} tone={(mode === 'auto' ? meets(ok.alphaReal, ok.alpha) : ok.alphaReal <= 0.06) ? 'ok' : mode === 'auto' ? 'bad' : 'warn'} sub={`P(rechazar | p = NCA = ${(ok.aql * 100).toFixed(2)}%)`} />
            <Figure label="Riesgo del consumidor (β real)" value={`${(ok.betaReal * 100).toFixed(2)}%`} tone={(mode === 'auto' ? meets(ok.betaReal, ok.beta) : ok.betaReal <= 0.11) ? 'ok' : mode === 'auto' ? 'bad' : 'warn'} sub={`P(aceptar | p = NRC = ${(ok.ltpd * 100).toFixed(2)}%)`} />
            <Figure label="Pa en NCA" value={`${(ok.paAql * 100).toFixed(2)}%`} tone={ok.paAql >= 0.9 ? 'ok' : 'warn'} sub={ok.paAql >= 0.9 ? 'Protección del productor adecuada' : 'Riesgo del productor elevado'} />
            <Figure label="Pa en NRC" value={`${(ok.paLtpd * 100).toFixed(2)}%`} tone={ok.paLtpd <= 0.15 ? 'ok' : 'warn'} sub={ok.paLtpd <= 0.10 ? 'Protección del consumidor adecuada' : 'Riesgo del consumidor elevado'} />
            <Figure label="AOQL" value={`${(ok.aoql * 100).toFixed(3)}%`} tone={ok.aoql <= 0.02 ? 'ok' : 'warn'} sub="calidad saliente promedio máxima" />
            <Figure label="ATI en NCA" value={Math.round(ok.atiAql).toLocaleString('es')} sub="inspección total promedio (u)" />
          </dl>

          <section className="sheet">
            <div className="sheet-head"><h2>Curva característica de operación (CO)</h2><span style={{ fontSize: 13, color: 'var(--text-2)' }}>Pa frente a % de defectivos del lote</span></div>
            <div className="sheet-body"><LineChart title={`Curva CO del plan n=${ok.n}, NAC=${ok.c}`} series={[{ points: ocCurve(ok.n, ok.c, ok.ltpd).map(p => ({ x: p.p, y: p.pa })), color: 'var(--ink)' }]}
              xLabel="% defectivos en el lote (p)" yLabel="Pa (%)" yMin={0} yMax={100} xFormat={v => `${v.toFixed(1)}%`} yFormat={v => `${v}%`}
              markers={[{ x: ok.aql * 100, label: `NCA ${(ok.aql * 100).toFixed(2)}%`, color: 'var(--ok)' }, { x: ok.ltpd * 100, label: `NRC ${(ok.ltpd * 100).toFixed(2)}%`, color: 'var(--bad)' }]}
              hLines={[{ y: 95, label: 'Pa ≥ 95%', color: 'var(--ok)' }, { y: 10, label: 'Pa ≤ 10%', color: 'var(--bad)' }]} /></div>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Planes candidatos para distintos NAC</h2><span style={{ fontSize: 13, color: 'var(--text-2)' }}>Cumplen ambos riesgos · plan seleccionado marcado</span></div>
            {(() => {
              const alpha = mode === 'auto' ? (input as any).alpha : ok.alpha, beta = mode === 'auto' ? (input as any).beta : ok.beta;
              const rows = candidatePlans(ok.N, ok.aql, alpha, ok.ltpd, beta);
              return rows.length ? (
                <div className="table-wrap"><table className="data dense">
                  <thead><tr><th className="num">NAC</th><th className="num">NCR</th><th className="num">n</th><th className="num">n/N</th><th className="num">Pa en NCA</th><th className="num">Pa en NRC</th><th className="num">α real</th><th className="num">β real</th><th className="num">AOQL</th><th className="num">ATI en NCA</th></tr></thead>
                  <tbody>{rows.map(c => <tr key={c.c} aria-selected={c.c === ok.c}>
                    <td className="num"><b>{c.c}{c.c === ok.c ? ' ←' : ''}</b></td><td className="num">{c.c + 1}</td><td className="num">{c.n.toLocaleString('es')}</td><td className="num">{(c.n / ok.N * 100).toFixed(1)}%</td>
                    <td className={`num ${c.pa_aql >= 0.9 ? 'ok' : 'warn'}`}>{(c.pa_aql * 100).toFixed(2)}%</td><td className={`num ${c.pa_ltpd <= 0.15 ? 'ok' : 'bad'}`}>{(c.pa_ltpd * 100).toFixed(2)}%</td>
                    <td className="num">{(c.alphaR * 100).toFixed(2)}%</td><td className="num">{(c.betaR * 100).toFixed(2)}%</td><td className="num">{(c.aoql * 100).toFixed(3)}%</td><td className="num">{c.atiAql.toLocaleString('es')}</td></tr>)}</tbody>
                </table></div>) : <p style={{ padding: 16, color: 'var(--text-2)' }}>Ningún plan candidato cumple ambos riesgos.</p>;
            })()}
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Curva AOQ — calidad saliente promedio</h2><span style={{ fontSize: 13, color: 'var(--text-2)' }}>Supone inspección 100% de los lotes rechazados</span></div>
            <div className="sheet-body"><LineChart title="Curva AOQ" series={[{ points: aoqCurve(ok.n, ok.c, ok.N).map(p => ({ x: p.p, y: p.aoq })), color: 'var(--ink)' }]}
              xLabel="% defectivos entrantes (p)" yLabel="AOQ (%)" yMin={0} xFormat={v => `${v.toFixed(1)}%`} yFormat={v => `${v.toFixed(3)}%`}
              hLines={[{ y: ok.aoql * 100, label: `AOQL ${(ok.aoql * 100).toFixed(3)}%`, color: 'var(--ink)' }]} /></div>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Interpretación del plan</h2></div>
            <ul className="list">
              <li><Icon name="info" /><span>Plan: inspecciona <b>{ok.n}</b> unidades del lote de <b>{ok.N}</b> ({(ok.fraction * 100).toFixed(1)}%). Acepta el lote si el número de defectivos es ≤ {ok.c} (NAC). Rechaza si ≥ {ok.r} (NCR).</span></li>
              {(mode === 'auto' ? meets(ok.alphaReal, ok.alpha) : ok.alphaReal <= 0.06)
                ? <li><span className="state ok"><Icon name="check" /></span><span>Riesgo del productor α = {(ok.alphaReal * 100).toFixed(2)}%: lotes con calidad NCA ({(ok.aql * 100).toFixed(2)}%) se aceptan el {(ok.paAql * 100).toFixed(1)}% de las veces. Protección al productor adecuada.</span></li>
                : <li><span className="state warn"><Icon name="alert" /></span><span>Riesgo del productor elevado: α = {(ok.alphaReal * 100).toFixed(2)}%. Lotes buenos (p = NCA) se rechazan con frecuencia. Considera aumentar NAC.</span></li>}
              {(mode === 'auto' ? meets(ok.betaReal, ok.beta) : ok.betaReal <= 0.12)
                ? <li><span className="state ok"><Icon name="check" /></span><span>Riesgo del consumidor β = {(ok.betaReal * 100).toFixed(2)}%: lotes con defectividad NRC ({(ok.ltpd * 100).toFixed(2)}%) se rechazan el {((1 - ok.betaReal) * 100).toFixed(1)}% de las veces. Protección al consumidor adecuada.</span></li>
                : <li><span className="state warn"><Icon name="alert" /></span><span>Riesgo del consumidor elevado: β = {(ok.betaReal * 100).toFixed(2)}%. Lotes malos (p = NRC) pasan con demasiada frecuencia. Reduce NAC o aumenta n.</span></li>}
              {ok.fraction > 0.2
                ? <li><span className="state warn"><Icon name="alert" /></span><span>El plan requiere inspeccionar el {(ok.fraction * 100).toFixed(1)}% del lote, lo cual puede ser costoso. Evalúa aumentar NAC para reducir n, o usa un plan de doble muestreo.</span></li>
                : <li><span className="state ok"><Icon name="check" /></span><span>Fracción inspeccionada: {(ok.fraction * 100).toFixed(1)}% — eficiencia de muestreo aceptable.</span></li>}
              <li><Icon name="info" /><span>AOQL = {(ok.aoql * 100).toFixed(3)}%: con inspección rectificante (100% en lotes rechazados), la calidad saliente promedio nunca superará este porcentaje, independientemente de la calidad entrante.</span></li>
              {ok.c === 0 && <li><span className="state warn"><Icon name="alert" /></span><span>NAC = 0 (plan de cero defectos): cualquier unidad defectiva encontrada rechaza el lote. Es muy protector para el consumidor pero puede generar un riesgo productor elevado.</span></li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
