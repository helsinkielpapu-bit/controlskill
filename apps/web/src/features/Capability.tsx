// Capacidad del proceso (RF-501…RF-508). Cálculo: /analysis/capability (motor único).
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseDecimal, nonconformingPercent, centering, runsTest, normInv, mean, stdDev } from '@controlskill/engine';
import { endpoints, ApiError } from '../app/api';
import { useActiveProcess, ProcessPicker } from '../app/process';
import { Alert, ControlFrame, Empty, Field, Figure, Loading, StatusMark, fmt, sym, type Status } from '../ui/components';
import { Cota, CotaLegend } from '../ui/Cota';
import { CapabilityChart, ScatterChart, BarChart, LineChart } from '../charts/Charts';
import { Icon } from '../ui/icons';

const TITLE: Record<string, string> = {
  capaz: 'Proceso capaz · Cpk ≥ 1.33', marginal: 'Proceso marginalmente capaz · 1.00 ≤ Cpk < 1.33', no_capaz: 'Proceso no capaz · Cpk < 1.00'
};
const SUB: Record<string, string> = {
  capaz: 'El proceso cumple las especificaciones de manera consistente.',
  marginal: 'El proceso requiere monitoreo continuo y mejora.',
  no_capaz: 'El proceso produce defectos. Se requiere acción correctiva inmediata.'
};

/** F-60. Recomendaciones automáticas. */
function recommendations(cap: any, usl: number, lsl: number, nom: number | null) {
  const r: { cls: 'ok' | 'warn' | 'bad'; text: string }[] = [];
  const f = (v: number) => v.toFixed(3);
  if (cap.status === 'capaz') {
    r.push({ cls: 'ok', text: 'El proceso cumple las especificaciones. Mantén el monitoreo con cartas de control.' });
    if (Math.abs(cap.cpk - cap.cp) > 0.1) r.push({ cls: 'warn', text: `Descentrado: Cp=${f(cap.cp)} vs Cpk=${f(cap.cpk)}. Ajusta el proceso al nominal.` });
  } else if (cap.status === 'marginal') {
    r.push({ cls: 'warn', text: 'Proceso marginal. Implementa acciones para reducir la variabilidad.' });
    if (cap.cpu < cap.cpl) r.push({ cls: 'warn', text: `Proceso sesgado hacia LSE (Cpu=${f(cap.cpu)} < Cpl=${f(cap.cpl)}).` });
    else if (cap.cpl < cap.cpu) r.push({ cls: 'warn', text: `Proceso sesgado hacia LSI (Cpl=${f(cap.cpl)} < Cpu=${f(cap.cpu)}).` });
  } else {
    r.push({ cls: 'bad', text: 'Acción correctiva urgente. El proceso genera productos fuera de especificación.' });
    if (cap.cp < 1.0) r.push({ cls: 'bad', text: `Variabilidad excesiva (Cp=${f(cap.cp)}). Identifica y elimina causas.` });
    if (nom != null && Math.abs(cap.xbar - nom) > (usl - lsl) * 0.1) r.push({ cls: 'bad', text: `Proceso significativamente descentrado del nominal (${nom}).` });
  }
  if (cap.n < 30) r.push({ cls: 'warn', text: `Muestra pequeña (n=${cap.n}). Los índices pueden no ser representativos. Recopila ≥ 30 obs.` });
  return r;
}

function SpecEditor({ process, open, onToggle }: { process: any; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => endpoints.updateProcess(process.id, b),
    onSuccess: () => { qc.invalidateQueries(); setMsg({ kind: 'success', text: 'Especificaciones guardadas.' }); },
    onError: e => setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : String(e) })
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const raw = (k: string) => String(f.get(k) ?? '').trim();
    const lsl = raw('lsl') ? parseDecimal(raw('lsl')) : null, usl = raw('usl') ? parseDecimal(raw('usl')) : null, nom = raw('nominal') ? parseDecimal(raw('nominal')) : null;
    if (raw('lsl') && Number.isNaN(lsl)) return setMsg({ kind: 'error', text: 'LSI inválido.' });
    if (raw('usl') && Number.isNaN(usl)) return setMsg({ kind: 'error', text: 'LSE inválido.' });
    if (lsl != null && usl != null && usl <= lsl) return setMsg({ kind: 'error', text: 'LSE debe ser mayor que LSI.' });
    setMsg(null);
    // DA-02: edición parcial — no se tocan descripción, carta ni n
    save.mutate({ lsl, usl, nominal: nom != null && !Number.isNaN(nom) ? nom : null, unit: raw('unit') || null });
  }
  const summary = [process.lsl != null && `LSI ${process.lsl}`, process.nominal != null && `Nominal ${process.nominal}`, process.usl != null && `LSE ${process.usl}`, process.unit].filter(Boolean).join(' · ');
  return (
    <section className="sheet" style={{ marginBottom: 16 }}>
      <button className="sheet-head" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} aria-expanded={open} onClick={onToggle}>
        <h2>Especificaciones</h2><span style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-2)' }}>{summary || 'Sin definir'}<Icon name="pen" /></span>
      </button>
      {open && (
        <form className="sheet-body" onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
          {(process.lsl == null || process.usl == null) && <Alert kind="warning">Define LSI y LSE para calcular la capacidad del proceso.</Alert>}
          <div className="grid-form">
            <Field label="LSI · límite inferior"><input className="input" name="lsl" inputMode="decimal" defaultValue={process.lsl ?? ''} /></Field>
            <Field label="Valor nominal"><input className="input" name="nominal" inputMode="decimal" defaultValue={process.nominal ?? ''} /></Field>
            <Field label="LSE · límite superior"><input className="input" name="usl" inputMode="decimal" defaultValue={process.usl ?? ''} /></Field>
            <Field label="Unidad"><input className="input" name="unit" defaultValue={process.unit ?? ''} /></Field>
          </div>
          <div className="actions"><button className="btn primary" disabled={save.isPending}><Icon name="save" />{save.isPending ? 'Guardando…' : 'Guardar especificaciones'}</button></div>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        </form>
      )}
    </section>
  );
}

export default function Capability() {
  const { processId, process, processes, select } = useActiveProcess();
  const [specOpen, setSpecOpen] = useState(false);
  useEffect(() => { setSpecOpen(!!process && (process.lsl == null || process.usl == null)); }, [process?.id, process?.lsl, process?.usl]);

  const cap = useQuery({ queryKey: ['capability', processId], enabled: !!processId, queryFn: () => endpoints.capability(processId!) });
  const hist = useQuery({ queryKey: ['histogram', processId, 10], enabled: !!processId && cap.isSuccess, queryFn: () => endpoints.histogram(processId!, 10) });
  const tests = useQuery({ queryKey: ['tests', processId], enabled: !!processId && cap.isSuccess, queryFn: () => endpoints.tests(processId!) });
  const meas = useQuery({ queryKey: ['measurements', processId, 200], enabled: !!processId && cap.isSuccess, queryFn: () => endpoints.measurements(processId!, { limit: 200, phase: '1' }) });

  const c = cap.data?.capability;
  const p = cap.data?.process ?? process;
  const usl = p?.usl as number, lsl = p?.lsl as number, nom = (p?.nominal ?? null) as number | null;
  const hasSub = c?.sigmaMethod === 'rbar_d2' || c?.sigmaMethod === 'sbar_c4';
  const sigmaF = c?.sigmaMethod === 'sbar_c4' ? 'S̄/c₄' : 'R̄/d₂';
  const status = (c?.status ?? 'sin_datos') as Status;

  return (
    <>
      <div className="page-head">
        <div><h1>Capacidad del proceso</h1><p className="lede">Índices con σ dentro de subgrupos cuando existen; supuestos y fracción no conforme estimada.</p></div>
      </div>
      <div className="sheet" style={{ marginBottom: 16 }}><div className="sheet-body toolbar"><ProcessPicker value={processId} processes={processes} onChange={select} /></div></div>
      {!processId && <section className="sheet"><Empty title="Selecciona un proceso">La capacidad se calcula con sus mediciones de Fase I.</Empty></section>}
      {process && <SpecEditor key={process.id} process={process} open={specOpen} onToggle={() => setSpecOpen(o => !o)} />}
      {cap.isLoading && <Loading text="Calculando capacidad…" />}
      {cap.error && <Alert>{(cap.error as Error).message}</Alert>}

      {c && (
        <div className="stack">
          <section className="sheet">
            <div className={`signal-strip ${status === 'capaz' ? 'ok' : status === 'marginal' ? 'idle' : ''}`} style={status === 'marginal' ? { background: 'var(--warn)' } : undefined}>
              <Icon name={status === 'capaz' ? 'check' : 'alert'} /><span className="grow">{TITLE[status]}<span style={{ fontWeight: 400, marginLeft: 10 }}>{SUB[status]}</span></span>
            </div>
            <div className="sheet-body cap-head">
              <ControlFrame label="Cpk" value={c.cpk} status={status} large />
              <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                <Cota lsl={lsl} usl={usl} nominal={nom} xbar={c.xbar} sigma={c.sigma} unit={p?.unit} large />
                <CotaLegend />
              </div>
            </div>
            <div className="label" style={{ padding: '0 16px 8px' }}>{hasSub ? <>Índices de capacidad · <span className="sym">σ̂<sub>w</sub> = {sigmaF}</span></> : sym('Índices de capacidad · σ global, sin subgrupos')}</div>
            <dl className="figures" style={{ borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
              <Figure label="Cp · potencial" value={fmt(c.cp, 3)} />
              <Figure label="Cpk · real" value={fmt(c.cpk, 3)} tone={status === 'capaz' ? 'ok' : status === 'marginal' ? 'warn' : 'bad'} />
              <Figure label="Cpu · hacia LSE" value={fmt(c.cpu, 3)} />
              <Figure label="Cpl · hacia LSI" value={fmt(c.cpl, 3)} />
              <Figure label="Media x̄" value={fmt(c.xbar)} unit={p?.unit} />
              <Figure label={hasSub ? 'σ̂w · corto plazo' : 'Desv. estándar σ'} value={fmt(c.sigma)} sub={hasSub ? `${sigmaF} dentro de subgrupos` : undefined} />
              <Figure label="Mediciones" value={c.n} sub={c.n_subgroups > 1 ? `${c.n_subgroups} subgrupos × ${c.subgroup_size}` : 'observaciones'} />
              <Figure label="Tolerancia LSE − LSI" value={fmt(c.tolerance)} unit={p?.unit} />
              <Figure label="Distancia a nominal" value={c.distToNominal != null ? fmt(c.distToNominal) : '—'} sub={c.distToNominal == null ? 'Nominal no definido' : undefined}
                tone={c.distToNominal == null ? '' : c.distToNominal <= 0.5 * c.sigma ? 'ok' : c.distToNominal <= 1.5 * c.sigma ? 'warn' : 'bad'} />
              <Figure label="Distancia a LSE" value={fmt(c.distToUsl)} tone={c.distToUsl > 0 ? 'ok' : 'bad'} />
              <Figure label="Distancia a LSI" value={fmt(c.distToLsl)} tone={c.distToLsl > 0 ? 'ok' : 'bad'} />
            </dl>
          </section>

          <section className="sheet">
            <div className="sheet-head"><h2>Distribución del proceso frente a especificaciones</h2></div>
            {nom != null && c.sigma > 0 && (() => {
              const k = centering(c.xbar, nom, c.sigma);
              const text = k.kind === 'centered' ? 'Proceso centrado respecto al valor nominal'
                : k.kind === 'slight' ? `Proceso ligeramente descentrado — desplazamiento de ${k.deviation.toFixed(3)} ${p?.unit ?? ''} desde el nominal`
                : `Proceso descentrado — desplazamiento de ${k.deviation.toFixed(3)} ${p?.unit ?? ''} respecto al nominal`;
              return <div style={{ padding: '12px 16px 0' }}><Alert kind={k.kind === 'centered' ? 'success' : k.kind === 'slight' ? 'warning' : 'error'}>{text}</Alert></div>;
            })()}
            <div className="sheet-body"><CapabilityChart usl={usl} lsl={lsl} nominal={nom} xbar={c.xbar} sigma={c.sigma} unit={p?.unit} histogram={hist.data?.histogram ?? null} /></div>
          </section>

          <PncSection c={c} usl={usl} lsl={lsl} unit={p?.unit} />
          <Assumptions tests={tests.data} measurements={meas.data?.data ?? []} />

          <section className="sheet">
            <div className="sheet-head"><h2>Recomendaciones</h2></div>
            <ul className="list">{recommendations(c, usl, lsl, nom).map((r, i) => <li key={i}><span className={`state ${r.cls}`}><Icon name={r.cls === 'ok' ? 'check' : r.cls === 'warn' ? 'alert' : 'x'} /></span><span>{r.text}</span></li>)}</ul>
          </section>
        </div>
      )}
    </>
  );
}

function PncSection({ c, usl, lsl, unit }: { c: any; usl: number; lsl: number; unit?: string | null }) {
  if (!Number.isFinite(usl) || !Number.isFinite(lsl) || !(c.sigma > 0)) return null;
  const r = nonconformingPercent(c.xbar, c.sigma, usl, lsl);
  const pct = (v: number) => (v < 0.0001 ? '< 0.0001%' : `${v.toFixed(4)}%`);
  const tone = (v: number) => (v > 1 ? 'bad' : v > 0.27 ? 'warn' : 'ok');
  return (
    <section className="sheet">
      <div className="sheet-head"><h2>Fracción no conforme estimada (%PNC)</h2></div>
      <dl className="figures" style={{ border: 0 }}>
        <Figure label="Cola superior (LSE)" value={pct(r.upper)} tone={tone(r.upper)} sub={<>Z<sub>LSE</sub> = ({usl} − {c.xbar.toFixed(4)}) / {c.sigma.toFixed(4)} = <b>{r.zUsl.toFixed(4)}</b> · p = Φ(−Z)</>} />
        <Figure label="Cola inferior (LSI)" value={pct(r.lower)} tone={tone(r.lower)} sub={<>Z<sub>LSI</sub> = ({c.xbar.toFixed(4)} − {lsl}) / {c.sigma.toFixed(4)} = <b>{r.zLsl.toFixed(4)}</b> · p = Φ(−Z)</>} />
        <Figure label="%PNC total" value={pct(r.total)} tone={tone(r.total)} large sub="p sup + p inf" />
      </dl>
      <p style={{ padding: '0 16px 14px', fontSize: 12, color: 'var(--text-2)' }}>Calculado con σ̂ = {c.sigma.toFixed(4)} {unit ?? ''} y x̄ = {c.xbar.toFixed(4)} {unit ?? ''}. Referencia: más de 0.27% indica proceso fuera de ±3σ; más de 1%, proceso no aceptable.</p>
    </section>
  );
}

function Assumptions({ tests, measurements }: { tests: any; measurements: { value: number; subgroup_id: number | null }[] }) {
  const values = [...measurements].reverse().map(m => m.value);
  const norm = tests?.normality, homo = tests?.homoscedasticity;
  const rt = runsTest(values.length >= 10 ? values : null);
  const card = (title: string, ok: boolean | null, stat: string, interp: string, chart: React.ReactNode) => (
    <div className="sheet" style={{ padding: 14, borderColor: ok == null ? undefined : ok ? 'var(--ok)' : 'var(--bad)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3>{title}</h3><StatusMark status={ok == null ? 'sin_datos' : ok ? 'capaz' : 'no_capaz'} label={ok == null ? 'N/D' : ok ? 'Válido' : 'No válido'} /></div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 10px' }}>{stat}<br /><em>{interp}</em></p>{chart}
    </div>
  );
  const color = (ok: boolean | null) => (ok == null ? 'var(--rule-strong)' : ok ? 'var(--ok)' : 'var(--bad)');
  const normOk = norm?.available ? norm.normal : null, homoOk = homo?.available ? homo.homoscedastic : null, indOk = rt ? rt.independent : null;

  let qq: React.ReactNode = null;
  if (values.length >= 4) {
    const sorted = [...values].sort((a, b) => a - b), mu = mean(sorted), sd = stdDev(sorted);
    const pts = sorted.map((v, i) => ({ x: normInv((i + 0.5) / sorted.length), y: v }));
    qq = <ScatterChart title="Gráfico Q-Q de normalidad" points={pts} line={[{ x: pts[0]!.x, y: mu + sd * pts[0]!.x }, { x: pts.at(-1)!.x, y: mu + sd * pts.at(-1)!.x }]} xLabel="Cuantil teórico normal" yLabel="Observado" color={color(normOk)} />;
  }
  const groups = new Map<number | string, number[]>();
  measurements.forEach(m => { const k = m.subgroup_id ?? '__all__'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(m.value); });
  const ranges = [...groups.values()].filter(g => g.length >= 2).map(g => Math.max(...g) - Math.min(...g));

  return (
    <section className="sheet">
      <div className="sheet-head"><h2>Supuestos del análisis</h2><span style={{ fontSize: 13, color: 'var(--text-2)' }}>Deben cumplirse para que los índices de capacidad sean válidos.</span></div>
      <div className="cols cols-3" style={{ padding: 16 }}>
        {card('Normalidad', normOk, norm?.available ? `A² = ${norm.statistic.toFixed(4)} · p = ${norm.p_value.toFixed(4)}` : 'Se necesitan ≥ 7 observaciones',
          norm?.available ? (norm.normal ? 'p > 0.05 — No se rechaza normalidad' : 'p ≤ 0.05 — Se rechaza normalidad') : '—', qq)}
        {card('Homogeneidad de varianzas', homoOk, homo?.available ? `W = ${homo.statistic.toFixed(4)} · p = ${homo.p_value.toFixed(4)}` : 'Se requieren ≥ 2 subgrupos con ≥ 2 obs.',
          homo?.available ? (homo.homoscedastic ? 'p > 0.05 — Varianzas homogéneas' : 'p ≤ 0.05 — Varianzas no homogéneas') : '—',
          ranges.length >= 2 && <BarChart title="Rango por subgrupo" values={ranges} refLine={mean(ranges)} refLabel={`R̄ = ${mean(ranges).toFixed(3)}`} color={color(homoOk)} xLabel="Subgrupo" yLabel="Rango" />)}
        {card('Independencia (rachas)', indOk, rt ? `Rachas = ${rt.runs} · esperadas ≈ ${rt.expectedRuns.toFixed(1)} · p = ${rt.p.toFixed(4)}` : values.length < 10 ? `Se requieren ≥ 10 obs. (hay ${values.length})` : 'Sin datos',
          rt ? (rt.independent ? 'p > 0.05 — Observaciones independientes' : 'p ≤ 0.05 — Posible dependencia') : '—',
          values.length >= 4 && <LineChart title="Gráfico de corridas" height={240} series={[{ points: values.map((v, i) => ({ x: i + 1, y: v })), color: color(indOk), dots: values.length <= 60 }]}
            hLines={[{ y: mean(values), label: `μ = ${mean(values).toFixed(3)}`, color: 'var(--ink)' }]} yMin={Math.min(...values)} yMax={Math.max(...values)}
            xLabel="Observación" yLabel="Valor" xFormat={v => String(Math.round(v))} yFormat={v => v.toPrecision(5)} />)}
      </div>
    </section>
  );
}
