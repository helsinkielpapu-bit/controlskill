// Gesto distintivo: la cota de capacidad (DESIGN.md). Misma forma a tres escalas.
import { decimalsOf } from './components';
import { useWidth } from '../charts/Charts';

export interface CotaProps { lsl: number; usl: number; nominal?: number | null; xbar: number; sigma: number; unit?: string | null; large?: boolean; width?: number }

/** Cota: en la escala grande ocupa todo el ancho disponible, dibujada a escala 1 para que sus rótulos no se encojan. */
export function Cota(props: CotaProps) {
  const [box, w] = useWidth(props.width ?? 760);
  if (!props.large || props.width) return <CotaSvg {...props} />;
  return <div ref={box}><CotaSvg {...props} width={w} /></div>;
}

function CotaSvg({ lsl, usl, nominal, xbar, sigma, unit, large, width = 380 }: CotaProps) {
  const h = large ? 84 : 56, top = large ? 12 : 8, band = large ? 46 : 30, barY = large ? 33 : 23, barH = large ? 10 : 7;
  // En la escala grande la tolerancia ocupa casi todo el ancho; las colas fuera de tolerancia siguen visibles.
  const margin = large ? 0.08 : 0.25;
  const T = usl - lsl, lo = lsl - T * margin, hi = usl + T * margin;
  const x = (v: number) => 10 + (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo) * (width - 20);
  const a = x(lsl), b = x(usl), mu = x(xbar);
  const pl = x(xbar - 3 * sigma), pr = x(xbar + 3 * sigma);
  const m = nominal != null ? x(nominal) : null;
  const d = decimalsOf(lsl, usl, nominal ?? undefined);
  const inL = Math.max(pl, a), inR = Math.min(pr, b);
  const label = `Tolerancia ${lsl.toFixed(d)} a ${usl.toFixed(d)}${unit ? ' ' + unit : ''}; proceso x̄ ± 3σ de ${(xbar - 3 * sigma).toFixed(d + 2)} a ${(xbar + 3 * sigma).toFixed(d + 2)}`;
  const ly = h - 2;
  return (
    <svg className={`cota${large ? ' lg' : ''}`} viewBox={`0 0 ${width} ${h}`} {...(large ? { width, height: h } : {})} role="img" aria-label={label}>
      <rect x={a} y={top} width={b - a} height={band} fill="var(--ink-tint)" />
      <line x1={a} y1={top - 4} x2={a} y2={top + band + 4} stroke="var(--ink)" strokeWidth={1.5} />
      <line x1={b} y1={top - 4} x2={b} y2={top + band + 4} stroke="var(--ink)" strokeWidth={1.5} />
      {m != null && <line x1={m} y1={top} x2={m} y2={top + band} stroke="var(--ink)" strokeDasharray="3 3" />}
      <line x1={a + 6} y1={top + 6} x2={b - 6} y2={top + 6} stroke="var(--ink)" />
      <path d={`M${a} ${top + 6}l7-3v6zM${b} ${top + 6}l-7-3v6z`} fill="var(--ink)" />
      <g className="proc" style={{ transformOrigin: `${mu}px 50%` }}>
        {pl < a && <rect x={pl} y={barY} width={a - pl} height={barH} fill="var(--bad)" />}
        {inR > inL && <rect x={inL} y={barY} width={inR - inL} height={barH} fill="var(--text)" />}
        {pr > b && <rect x={b} y={barY} width={pr - b} height={barH} fill="var(--bad)" />}
      </g>
      <line x1={mu} y1={barY - 4} x2={mu} y2={barY + barH + 4} stroke="var(--text)" strokeWidth={2.5} />
      <text x={a} y={ly} textAnchor="middle">{lsl.toFixed(d)}</text>
      {m != null && <text x={m} y={ly} textAnchor="middle">{nominal!.toFixed(d)}</text>}
      <text x={b} y={ly} textAnchor="middle">{usl.toFixed(d)}</text>
    </svg>
  );
}

export function CotaLegend() {
  return (
    <div className="chart-legend" aria-label="Leyenda de la cota">
      <span><i style={{ width: 22, height: 10, border: 0, borderLeft: '1.5px solid var(--ink)', borderRight: '1.5px solid var(--ink)', background: 'var(--ink-tint)' }} />Tolerancia LSI–LSE</span>
      <span><i style={{ height: 6, border: 0, background: 'var(--text)' }} />Proceso x̄ ± 3σ</span>
      <span><i style={{ height: 6, border: 0, background: 'var(--bad)' }} />Fuera de tolerancia</span>
    </div>
  );
}
