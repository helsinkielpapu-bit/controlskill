// Carta en vivo de la pantalla de acceso: carta X̄ con subgrupos de n = 4 envases.
// Cada 4 lecturas del sensor de la llenadora se cierra un subgrupo y se grafica su media frente a
// límites de control de Fase I (σ = 2.0 ml conocida: LC 500, LCS/LCI = 500 ± 3·2/√4 = 503 / 497).
import { useCallback, useRef, useState } from 'react';
import { SUBGROUP_N, type SensorReading } from './FillLine';

const CL = 500, SIGMA = 2, UCL = CL + 3 * SIGMA / Math.sqrt(SUBGROUP_N), LCL = CL - 3 * SIGMA / Math.sqrt(SUBGROUP_N);
const Y0 = 494, Y1 = 506;
const WINDOW = 14;
const W = 560, H = 236, L = 48, R = 78, T = 16, B = 26;

type Subgroup = { key: number; mean: number; range: number; ooc: boolean };
export type SensorState = {
  groups: Subgroup[]; pending: { key: number; values: number[] } | null; k: number; ooc: number; sum: number;
  recent: number[];   // últimas 40 lecturas individuales (10 subgrupos) para la campana de capacidad
};
export const RECENT = 40;

/** Agrupa las lecturas del sensor en subgrupos consecutivos de n = 4 (por número de envase). */
export function useSensorReadings() {
  const [state, setState] = useState<SensorState>({ groups: [], pending: null, k: 0, ooc: 0, sum: 0, recent: [] });
  const seen = useRef(new Set<number>());
  const push = useCallback((r: SensorReading) => {
    if (seen.current.has(r.id)) return; // el modo estricto de React monta dos veces
    seen.current.add(r.id);
    const key = Math.floor(r.id / SUBGROUP_N);
    setState(prev => {
      const s = { ...prev, recent: [...prev.recent, r.value].slice(-RECENT) };
      const values = s.pending && s.pending.key === key ? [...s.pending.values, r.value] : [r.value];
      if (values.length < SUBGROUP_N) return { ...s, pending: { key, values } };
      const mean = values.reduce((a, b) => a + b, 0) / SUBGROUP_N;
      const range = Math.max(...values) - Math.min(...values);
      const ooc = mean > UCL || mean < LCL;
      return { ...s, groups: [...s.groups, { key, mean, range, ooc }].slice(-WINDOW), pending: null, k: s.k + 1, ooc: s.ooc + (ooc ? 1 : 0), sum: s.sum + mean };
    });
  }, []);
  return [state, push] as const;
}

const label = (key: number) => key + 11; // el ciclo previo sembrado ocupa los subgrupos 1–10

export function SensorChart({ data }: { data: SensorState }) {
  const { groups, pending, k, ooc, sum } = data;
  const x = (i: number) => L + (i + (WINDOW - groups.length)) * ((W - L - R) / (WINDOW - 1));
  const y = (v: number) => T + (Y1 - Math.min(Math.max(v, Y0), Y1)) / (Y1 - Y0) * (H - T - B);
  const path = groups.map((g, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(g.mean).toFixed(1)}`).join('');
  const newest = groups.at(-1);
  const filled = pending?.values.length ?? 0;
  const current = pending ? label(pending.key) : newest ? label(newest.key) + 1 : 1;

  return (
    <section className="sensor-chart" aria-hidden="true">
      <header>
        <span className="sc-title">Carta <span className="sym">X̄</span> en vivo · <span className="sym">n</span> = {SUBGROUP_N}</span>
        <span className="sc-live">Subgrupo {current} <span className="sc-slots">{Array.from({ length: SUBGROUP_N }, (_, i) => <i key={i} data-on={i < filled || undefined} />)}</span> {filled}/{SUBGROUP_N}</span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <rect className="sc-band" x={L} width={W - L - R} y={y(UCL)} height={y(LCL) - y(UCL)} />
        {[496, 498, 500, 502, 504].map(v => <text key={v} className="sc-axis" x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text>)}
        <line className="sc-spec" x1={L} x2={W - R} y1={y(UCL)} y2={y(UCL)} />
        <line className="sc-spec" x1={L} x2={W - R} y1={y(LCL)} y2={y(LCL)} />
        <line className="sc-nominal" x1={L} x2={W - R} y1={y(CL)} y2={y(CL)} />
        <text className="sc-lim bad" x={W - R + 8} y={y(UCL) + 4}>LCS {UCL.toFixed(1)}</text>
        <text className="sc-lim" x={W - R + 8} y={y(CL) + 4}>LC {CL.toFixed(1)}</text>
        <text className="sc-lim bad" x={W - R + 8} y={y(LCL) + 4}>LCI {LCL.toFixed(1)}</text>
        <path className="sc-trace" d={path} />
        {groups.map((g, i) => g.ooc
          ? <path key={g.key} className="sc-pt bad" d={`M${x(i)} ${y(g.mean) - 7}l7 7-7 7-7-7z`} />
          : <circle key={g.key} className="sc-pt" cx={x(i)} cy={y(g.mean)} r={4} />)}
        {newest && <circle key={`n${newest.key}`} className={`sc-ping${newest.ooc ? ' bad' : ''}`} cx={x(groups.length - 1)} cy={y(newest.mean)} r={11} />}
      </svg>
      <dl className="sc-figures">
        <div><dt>Subgrupos</dt><dd>{k}</dd></div>
        <div><dt>Fuera de control</dt><dd className={ooc ? 'bad' : ''}>{ooc} <small>({k ? ((ooc / k) * 100).toFixed(1) : '0.0'} %)</small></dd></div>
        <div><dt><span className="sym">X̿</span> · media global</dt><dd>{k ? (sum / k).toFixed(2) : '—'} <small>ml</small></dd></div>
      </dl>
    </section>
  );
}
