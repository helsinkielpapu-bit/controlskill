// Campana de capacidad viva (pantalla de acceso): histograma de las últimas 40 lecturas del sensor,
// curva normal ajustada y Cp/Cpk recalculados con cada envase. Mismo método que el módulo Capacidad:
// σ̂ dentro de subgrupos = R̄/d₂ (n = 4) y la clasificación del motor (capaz ≥ 1.33, marginal ≥ 1.00).
import { D2, capabilityStatus } from '@controlskill/engine';
import { SUBGROUP_N } from './FillLine';
import type { SensorState } from './SensorChart';
import { STATUS_WORD, sym } from './components';
import { Icon } from './icons';

const LSL = 495, USL = 505, X0 = 490, X1 = 510, BIN = 1;
const W = 420, H = 150, L = 8, R = 8, T = 10, B = 22;

export function CapabilityLive({ data }: { data: SensorState }) {
  const values = data.recent;
  const ranges = data.groups.slice(-10).map(g => g.range);
  if (values.length < 8 || !ranges.length) return null;

  const mu = values.reduce((a, b) => a + b, 0) / values.length;
  const sigma = ranges.reduce((a, b) => a + b, 0) / ranges.length / D2[SUBGROUP_N]!;
  const cp = (USL - LSL) / (6 * sigma);
  const cpk = Math.min(USL - mu, mu - LSL) / (3 * sigma);
  const status = capabilityStatus(cpk);

  const bins = Array.from({ length: (X1 - X0) / BIN }, (_, i) => ({ from: X0 + i * BIN, n: 0 }));
  for (const v of values) { const i = Math.floor((Math.min(Math.max(v, X0), X1 - 0.001) - X0) / BIN); bins[i]!.n++; }
  const pdf = (x: number) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
  const peak = Math.max(...bins.map(b => b.n), values.length * BIN * pdf(mu));
  const x = (v: number) => L + (v - X0) / (X1 - X0) * (W - L - R);
  const y = (c: number) => H - B - (c / peak) * (H - T - B);
  const curve = Array.from({ length: 81 }, (_, i) => { const v = X0 + (i / 80) * (X1 - X0); return `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(values.length * BIN * pdf(v)).toFixed(1)}`; }).join('');

  return (
    <section className="cap-live" aria-hidden="true">
      <header>
        <span>{sym('Capacidad en vivo · últimos 40 envases')}</span>
        <span className={`cl-state ${status}`}><Icon name={status === 'capaz' ? 'check' : status === 'marginal' ? 'alert' : 'x'} size={13} />{STATUS_WORD[status]}</span>
      </header>
      <div className="cl-body">
        <svg viewBox={`0 0 ${W} ${H}`}>
          {bins.map(b => b.n > 0 && (
            <rect key={b.from} className={`cl-bar${b.from < LSL || b.from >= USL ? ' out' : ''}`} x={x(b.from) + 1} width={x(b.from + BIN) - x(b.from) - 2} y={y(b.n)} height={H - B - y(b.n)} />
          ))}
          <path className="cl-curve" d={curve} />
          <line className="cl-spec" x1={x(LSL)} x2={x(LSL)} y1={T - 4} y2={H - B} />
          <line className="cl-spec" x1={x(USL)} x2={x(USL)} y1={T - 4} y2={H - B} />
          <line className="cl-mu" x1={x(mu)} x2={x(mu)} y1={T} y2={H - B} />
          <line className="cl-axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
          <text x={x(LSL)} y={H - 6} textAnchor="middle">LSI {LSL}</text>
          <text x={x(USL)} y={H - 6} textAnchor="middle">LSE {USL}</text>
          <text x={x(mu)} y={T + 2} textAnchor={mu > 500 ? 'end' : 'start'} dx={mu > 500 ? -4 : 4}>x̄ {mu.toFixed(2)}</text>
        </svg>
        <dl>
          <div><dt>{sym('Cp')}</dt><dd>{cp.toFixed(2)}</dd></div>
          <div><dt>{sym('Cpk')}</dt><dd className={status}>{cpk.toFixed(2)}</dd></div>
          <div><dt>{sym('σ̂ = R̄/d₂')}</dt><dd>{sigma.toFixed(2)} <small>ml</small></dd></div>
        </dl>
      </div>
    </section>
  );
}
