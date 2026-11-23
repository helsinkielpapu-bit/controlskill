// Gráficos SVG propios en el lenguaje «Hoja de plano»: retícula fina, límites rotulados al margen como cotas.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Ancho real del contenedor: el SVG se dibuja a escala 1, así los textos conservan su tamaño CSS. */
export function useWidth(fallback = 960) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setW(Math.max(260, Math.round(e.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
function ticks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}
const decimalsFor = (span: number) => (span >= 100 ? 0 : span >= 10 ? 1 : span >= 1 ? 2 : span >= 0.1 ? 3 : 4);

export interface Tip { x: number; y: number; lines: string[] }
function Tooltip({ tip }: { tip: Tip | null }) {
  return tip ? <div className="tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.lines.map((l, i) => <div key={i}>{l}</div>)}</div> : null;
}

export interface ControlSeries { points: (number | null)[]; cl: number; ucl: number; lcl: number; pointLimits?: { ucl: number; lcl: number; n?: number }[] }

/**
 * Carta de control. `flagged`: índices fuera de control (marcados con rombo rojo).
 * `reference`: serie de Fase I mostrada antes de la actual (Monitoreo, ambos modos: DA-18).
 */
export function ControlChart({ series, labels, flagged = [], title, height = 280, zones = true, reference, yDomain, pad = 0, valueLabel = 'Valor' }: {
  series: ControlSeries; labels?: string[]; flagged?: number[]; title: string; height?: number; zones?: boolean;
  reference?: (number | null)[]; yDomain?: [number, number]; pad?: number; valueLabel?: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [box, W] = useWidth();
  const H = height, L = 52, R = W < 560 ? 74 : 92, T = 14, B = 30;
  // El motor devuelve límites vacíos (NaN → null) cuando la carta no corresponde a los datos (p. ej. carta p sin n).
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const usable = [series.ucl, series.lcl, series.cl].every(finite) && (!series.pointLimits || series.pointLimits.every(l => finite(l.ucl) && finite(l.lcl)));
  if (!usable) return (
    <figure ref={box} className="chart-empty" role="img" aria-label={`${title}. Límites de control no disponibles.`}>
      <p style={{ padding: '24px 16px', color: 'var(--text-2)' }}>No se pueden calcular los límites de control de esta carta con los datos del proceso. Revisa que el tipo de carta corresponda a los datos.</p>
    </figure>
  );
  const ref = reference ?? [];
  const all = [...ref, ...series.points];
  const total = all.length + pad;
  const vals = all.filter((v): v is number => v != null);
  const limits = [series.ucl, series.lcl, series.cl, ...(series.pointLimits?.flatMap(l => [l.ucl, l.lcl]) ?? [])];
  let [y0, y1] = yDomain ?? [Math.min(...vals, ...limits), Math.max(...vals, ...limits)];
  if (!yDomain) { const span = (y1 - y0) || Math.abs(y1) * 0.1 || 1; y0 -= span * 0.12; y1 += span * 0.12; }
  const x = scale(0, Math.max(total - 1, 1), L, W - R);
  const y = scale(y0, y1, H - B, T);
  const d = decimalsFor(y1 - y0);
  const sigma = (series.ucl - series.cl) / 3;
  const offset = ref.length;
  const flaggedSet = new Set(flagged);
  const path = (pts: (number | null)[], off: number) => pts.reduce((acc, v, i) => v == null ? acc : acc + `${acc && pts[i - 1] != null ? 'L' : 'M'}${x(i + off)},${y(v)}`, '');
  const stepLimit = (key: 'ucl' | 'lcl') => series.pointLimits!.map((l, i) => `${i ? 'L' : 'M'}${x(i + offset - 0.5)},${y(l[key])}H${x(i + offset + 0.5)}`).join('');
  const maxTicks = Math.max(4, Math.floor((W - L - R) / 34));
  const xt = total <= maxTicks ? all.map((_, i) => i) : ticks(0, total - 1, Math.min(10, maxTicks)).filter(v => Number.isInteger(v));

  return (
    <figure style={{ position: 'relative' }} ref={box}>
      <figcaption className="sr-only">{title}</figcaption>
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. LC ${series.cl}, LCS ${series.ucl}, LCI ${series.lcl}. ${flagged.length} puntos fuera de control.`} onMouseLeave={() => setTip(null)}>
        <g className="grid">{ticks(y0, y1, 6).map(t => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
        {zones && sigma > 0 && !series.pointLimits && <>
          <rect x={L} width={W - R - L} y={y(series.cl + 2 * sigma)} height={Math.max(0, y(series.cl - 2 * sigma) - y(series.cl + 2 * sigma))} fill="var(--ink-tint)" opacity={0.45} />
          <rect x={L} width={W - R - L} y={y(series.cl + sigma)} height={Math.max(0, y(series.cl - sigma) - y(series.cl + sigma))} fill="var(--ink-tint)" opacity={0.8} />
        </>}
        {offset > 0 && <><line x1={x(offset - 0.5)} x2={x(offset - 0.5)} y1={T} y2={H - B} stroke="var(--rule-strong)" strokeDasharray="4 4" />
          {/* Si el rótulo no cabe a la derecha de la línea (antes de los rótulos de límites), va a su izquierda */}
          {x(offset - 0.5) + 6 + 112 <= W - R
            ? <text x={x(offset - 0.5) + 6} y={T + 10}>Inicio del monitoreo</text>
            : <text x={x(offset - 0.5) - 6} y={T + 10} textAnchor="end">Inicio del monitoreo</text>}</>}
        {series.pointLimits ? <>
          <path d={stepLimit('ucl')} fill="none" stroke="var(--bad)" strokeWidth={1.5} />
          <path d={stepLimit('lcl')} fill="none" stroke="var(--bad)" strokeWidth={1.5} />
        </> : <>
          <line x1={L} x2={W - R} y1={y(series.ucl)} y2={y(series.ucl)} stroke="var(--bad)" strokeWidth={1.5} />
          <line x1={L} x2={W - R} y1={y(series.lcl)} y2={y(series.lcl)} stroke="var(--bad)" strokeWidth={1.5} />
        </>}
        <line x1={L} x2={W - R} y1={y(series.cl)} y2={y(series.cl)} stroke="var(--ink)" strokeWidth={1.25} strokeDasharray="8 4" />
        {[['LCS', series.ucl, 'var(--bad)'], ['LC', series.cl, 'var(--ink)'], ['LCI', series.lcl, 'var(--bad)']].map(([lab, v, c]) => (
          <g key={lab as string}><line x1={W - R} x2={W - R + 8} y1={y(v as number)} y2={y(v as number)} stroke={c as string} />
            <text x={W - R + 12} y={y(v as number) + 4} style={{ fill: c as string, fontWeight: 700 }}>{lab} {(v as number).toFixed(Math.max(d, 3))}</text></g>
        ))}
        {ref.length > 0 && <path d={path(ref, 0)} fill="none" stroke="var(--rule-strong)" strokeWidth={1.5} />}
        {ref.map((v, i) => v == null ? null : <circle key={`r${i}`} cx={x(i)} cy={y(v)} r={2.5} fill="var(--sheet)" stroke="var(--rule-strong)" />)}
        <path d={path(series.points, offset)} fill="none" stroke="var(--text)" strokeWidth={1.5} />
        {series.points.map((v, i) => {
          if (v == null) return null;
          const cx = x(i + offset), cy = y(v), bad = flaggedSet.has(i);
          const lines = [labels?.[i] ?? `Punto ${i + 1}`, `${valueLabel}: ${v.toFixed(4)}`];
          if (series.pointLimits?.[i]) lines.push(`LCS ${series.pointLimits[i]!.ucl.toFixed(4)} · LCI ${series.pointLimits[i]!.lcl.toFixed(4)}${series.pointLimits[i]!.n != null ? ` · n = ${series.pointLimits[i]!.n}` : ''}`);
          if (bad) lines.push('Fuera de control estadístico');
          return (
            <g key={i} onMouseMove={e => setTip({ x: e.clientX, y: e.clientY, lines })}>
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              {bad ? <path d={`M${cx} ${cy - 7}L${cx + 7} ${cy}L${cx} ${cy + 7}L${cx - 7} ${cy}Z`} fill="var(--bad)" stroke="var(--sheet)" strokeWidth={1.5} />
                : <circle cx={cx} cy={cy} r={3.5} fill="var(--sheet)" stroke="var(--text)" strokeWidth={1.75} />}
            </g>
          );
        })}
        <g>{ticks(y0, y1, 6).map(t => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{t.toFixed(d)}</text>)}</g>
        <g>{xt.map(i => <text key={i} x={x(i)} y={H - 10} textAnchor="middle">{i < offset ? `F1-${i + 1}` : i - offset + 1}</text>)}</g>
      </svg>
      <Tooltip tip={tip} />
    </figure>
  );
}

/** Histograma de densidad con curva normal y especificaciones (F-52). */
export function CapabilityChart({ usl, lsl, nominal, xbar, sigma, histogram, unit }: {
  usl: number; lsl: number; nominal: number | null; xbar: number; sigma: number; unit?: string | null;
  histogram: { midpoints: number[]; frequencies: number[]; binWidth: number } | null;
}) {
  const [box, W] = useWidth();
  const H = 340, L = 52, R = 16, T = 64, B = 34;
  const c = nominal ?? xbar;
  const spread = Math.max(Math.abs(usl - c), Math.abs(lsl - c), 4 * sigma);
  const x0 = c - spread * 1.35, x1 = c + spread * 1.35;
  const pts = Array.from({ length: 161 }, (_, i) => { const xv = x0 + (i * (x1 - x0)) / 160; return { x: xv, y: (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xv - xbar) / sigma) ** 2) }; });
  const total = histogram ? histogram.frequencies.reduce((a, b) => a + b, 0) : 0;
  const bars = histogram ? histogram.midpoints.map((m, i) => ({ m, d: total > 0 && histogram.binWidth > 0 ? histogram.frequencies[i]! / (total * histogram.binWidth) : 0 })) : [];
  const ymax = Math.max(...pts.map(p => p.y), ...bars.map(b => b.d)) * 1.15;
  const x = scale(x0, x1, L, W - R), y = scale(0, ymax, H - B, T);
  const dec = decimalsFor(x1 - x0);
  const bw = histogram ? Math.abs(x(histogram.binWidth) - x(0)) : 0;
  // Rótulos como llamadas de plano: cada marca en su propia altura, con línea de referencia hasta el rótulo.
  const mark = (v: number, label: string, color: string, dash?: string, row = 0) => {
    const ly = 14 + row * 16, anchor = x(v) < L + 50 ? 'start' : x(v) > W - R - 50 ? 'end' : 'middle';
    return (
      <g key={label}><line x1={x(v)} x2={x(v)} y1={ly + 4} y2={H - B} stroke={color} strokeWidth={label.startsWith('x̄') ? 2 : 1.5} strokeDasharray={dash} />
        <text x={x(v)} y={ly} textAnchor={anchor} style={{ fill: color, fontWeight: 700 }}>{label}</text></g>
    );
  };
  return (
    <div ref={box}><svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Distribución del proceso frente a especificaciones. LSI ${lsl}, LSE ${usl}, media ${xbar.toFixed(4)}${unit ? ' ' + unit : ''}.`}>
      <rect x={x(lsl)} width={x(usl) - x(lsl)} y={T} height={H - B - T} fill="var(--ink-tint)" opacity={0.6} />
      <g className="grid">{ticks(0, ymax, 4).map(t => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
      {bars.map((b, i) => <rect key={i} x={x(b.m) - bw / 2 + 1} width={Math.max(bw - 2, 1)} y={y(b.d)} height={H - B - y(b.d)}
        fill={b.m < lsl || b.m > usl ? 'var(--bad)' : 'var(--rule-strong)'} opacity={b.m < lsl || b.m > usl ? 0.55 : 0.7} />)}
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join('')} fill="none" stroke="var(--text)" strokeWidth={2} />
      {mark(lsl, `LSI ${lsl}`, 'var(--bad)')}
      {mark(usl, `LSE ${usl}`, 'var(--bad)')}
      {nominal != null && mark(nominal, `Nom. ${nominal}`, 'var(--ink)', '6 4', 1)}
      {mark(xbar, `x̄ ${xbar.toFixed(3)}`, 'var(--text)', undefined, 2)}
      <g>{ticks(0, ymax, 4).map(t => <text key={t} x={L - 6} y={y(t) + 4} textAnchor="end">{t.toPrecision(2)}</text>)}</g>
      <g>{ticks(x0, x1, Math.max(3, Math.floor(W / 110))).map(t => <text key={t} x={x(t)} y={H - 12} textAnchor="middle">{t.toFixed(dec)}</text>)}</g>
      <text x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>densidad</text>
    </svg></div>
  );
}

/** Gráfico de líneas genérico (curvas CO y AOQ, corridas). */
export function LineChart({ series, xLabel, yLabel, height = 260, yMin, yMax, xFormat = (v: number) => String(v), yFormat = (v: number) => String(v), markers = [], hLines = [], title }: {
  series: { points: { x: number; y: number }[]; color?: string; dots?: boolean; noLine?: boolean }[]; xLabel: string; yLabel: string; height?: number; yMin?: number; yMax?: number;
  xFormat?: (v: number) => string; yFormat?: (v: number) => string; markers?: { x: number; label: string; color: string }[]; hLines?: { y: number; label: string; color: string }[]; title: string;
}) {
  const [box, W] = useWidth();
  const H = height, L = 60, R = 16, T = 24, B = 42;
  const xs = series.flatMap(s => s.points.map(p => p.x)), ys = series.flatMap(s => s.points.map(p => p.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = yMin ?? Math.min(...ys, ...hLines.map(h => h.y));
  const y1 = yMax ?? (Math.max(...ys, ...hLines.map(h => h.y)) * 1.08 || 1);
  const x = scale(x0, x1, L, W - R), y = scale(y0, y1, H - B, T);
  return (
    <div ref={box}><svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <g className="grid">{ticks(y0, y1, 5).map(t => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
      {hLines.map(h => <g key={h.label}><line x1={L} x2={W - R} y1={y(h.y)} y2={y(h.y)} stroke={h.color} strokeDasharray="4 4" /><text x={W - R} y={y(h.y) - 5} textAnchor="end" style={{ fill: h.color }}>{h.label}</text></g>)}
      {markers.map(m => <g key={m.label}><line x1={x(m.x)} x2={x(m.x)} y1={T} y2={H - B} stroke={m.color} strokeDasharray="6 4" strokeWidth={1.5} /><text x={x(m.x) + 5} y={T + 10} style={{ fill: m.color, fontWeight: 700 }}>{m.label}</text></g>)}
      {series.map((s, k) => <g key={k}>
        {!s.noLine && <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join('')} fill="none" stroke={s.color ?? 'var(--ink)'} strokeWidth={2} />}
        {s.dots && s.points.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r={2.5} fill={s.color ?? 'var(--ink)'} />)}
      </g>)}
      <g>{ticks(y0, y1, 5).map(t => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{yFormat(t)}</text>)}</g>
      <g>{ticks(x0, x1, Math.max(3, Math.floor(W / 110))).map(t => <text key={t} x={x(t)} y={H - 22} textAnchor="middle">{xFormat(t)}</text>)}</g>
      <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle">{xLabel}</text>
      <text x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{yLabel}</text>
    </svg></div>
  );
}

/** Dispersión (gráfico Q-Q) con línea de referencia. */
export function ScatterChart({ points, line, xLabel, yLabel, color, title }: { points: { x: number; y: number }[]; line: [{ x: number; y: number }, { x: number; y: number }]; xLabel: string; yLabel: string; color: string; title: string }) {
  return <LineChart title={title} xLabel={xLabel} yLabel={yLabel} height={240}
    yMin={Math.min(...points.map(p => p.y))} yMax={Math.max(...points.map(p => p.y))}
    xFormat={v => v.toFixed(1)} yFormat={v => v.toPrecision(5)}
    series={[{ points: [...line], color: 'var(--rule-strong)' }, { points, color, dots: true, noLine: true }]} />;
}

/** Barras simples con línea de referencia (rangos por subgrupo). */
export function BarChart({ values, refLine, refLabel, color, xLabel, yLabel, title }: { values: number[]; refLine: number; refLabel: string; color: string; xLabel: string; yLabel: string; title: string }) {
  const [box, W] = useWidth();
  const H = 240, L = 60, R = 16, T = 20, B = 42;
  const ymax = Math.max(...values, refLine) * 1.12 || 1;
  const x = scale(0, values.length, L, W - R), y = scale(0, ymax, H - B, T);
  const bw = (W - R - L) / values.length;
  return (
    <div ref={box}><svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <g className="grid">{ticks(0, ymax, 4).map(t => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
      {values.map((v, i) => <rect key={i} x={x(i) + bw * 0.15} width={bw * 0.7} y={y(v)} height={H - B - y(v)} fill={color} opacity={0.75} />)}
      <line x1={L} x2={W - R} y1={y(refLine)} y2={y(refLine)} stroke="var(--ink)" strokeDasharray="6 4" />
      <text x={W - R} y={y(refLine) - 5} textAnchor="end" style={{ fill: 'var(--ink)', fontWeight: 700 }}>{refLabel}</text>
      <g>{ticks(0, ymax, 4).map(t => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{t.toPrecision(3)}</text>)}</g>
      <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle">{xLabel}</text>
      <text x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{yLabel}</text>
    </svg></div>
  );
}

export function ChartLegend({ items }: { items: { label: ReactNode; color: string; dash?: boolean; marker?: 'diamond' }[] }) {
  return <div className="chart-legend">{items.map((it, i) => <span key={i}>
    {it.marker === 'diamond' ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0L12 6L6 12L0 6Z" fill={it.color} /></svg>
      : <i style={{ borderTopColor: it.color, borderTopStyle: it.dash ? 'dashed' : 'solid' }} />}{it.label}</span>)}</div>;
}
