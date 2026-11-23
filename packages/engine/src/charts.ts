// Cartas de control (documento maestro F-21…F-28).
import { mean, stdDev, round } from './stats.js';
import { XBAR_R, XBAR_S, IMR_D4, IMR_E2, D2, C4, factor } from './constants.js';

export interface PointLimit { ucl: number; lcl: number; n: number }
export interface Series {
  points: number[];
  cl: number; ucl: number; lcl: number;
  n?: number;
  /** Límites de cada punto: p y u, y X̄-R/X̄-S con subgrupos de tamaños distintos (DA-23). */
  pointLimits?: PointLimit[];
}
export interface AttributeSeries extends Series {
  variableN: boolean;
  n: number;
}

const ranges = (sgs: readonly (readonly number[])[]) => sgs.map(sg => Math.max(...sg) - Math.min(...sg));

/** ¿Todos los subgrupos tienen el mismo tamaño? */
export const equalSizes = (sgs: readonly (readonly number[])[]) => sgs.every(sg => sg.length === sgs[0]!.length);

/** Tamaño de subgrupo más frecuente (en empate, el primero que aparece). */
export function modalSize(sgs: readonly (readonly number[])[]): number {
  const counts = new Map<number, number>();
  for (const sg of sgs) counts.set(sg.length, (counts.get(sg.length) ?? 0) + 1);
  let best = sgs[0]!.length, max = 0;
  for (const [size, c] of counts) if (c > max) { max = c; best = size; }
  return best;
}

/**
 * DA-23. Subgrupos de tamaños distintos: σ̂ = promedio de Rᵢ/d₂(nᵢ) (X̄-R) o de Sᵢ/c₄(nᵢ) (X̄-S),
 * X̿ ponderada por nᵢ y límites propios de cada subgrupo con su nᵢ.
 */
function unequalLimits(subgroups: readonly (readonly number[])[], kind: 'r' | 's') {
  const means = subgroups.map(sg => mean(sg));
  const disp = kind === 'r' ? ranges(subgroups) : subgroups.map(sg => stdDev(sg));
  const total = subgroups.reduce((s, sg) => s + sg.length, 0);
  const xbarBar = subgroups.reduce((s, sg, i) => s + sg.length * means[i]!, 0) / total;
  const sigma = mean(subgroups.map((sg, i) => disp[i]! / (kind === 'r' ? factor(D2, sg.length) : factor(C4, sg.length))));
  const xLimits: PointLimit[] = subgroups.map(sg => {
    const h = 3 * sigma / Math.sqrt(sg.length);
    return { ucl: round(xbarBar + h, 4), lcl: round(xbarBar - h, 4), n: sg.length };
  });
  const centers = subgroups.map(sg => (kind === 'r' ? factor(D2, sg.length) : factor(C4, sg.length)) * sigma);
  const dLimits: PointLimit[] = subgroups.map((sg, i) => {
    const n = sg.length;
    const [lo, hi] = kind === 'r' ? [factor(XBAR_R, n).D3, factor(XBAR_R, n).D4] : [factor(XBAR_S, n).B3, factor(XBAR_S, n).B4];
    return { ucl: round(hi * centers[i]!, 4), lcl: round(lo * centers[i]!, 4), n };
  });
  const n = modalSize(subgroups);
  const avg = (ls: PointLimit[], k: 'ucl' | 'lcl') => round(mean(ls.map(l => l[k])), 4);
  return {
    main: { points: means.map(v => round(v, 4)), cl: round(xbarBar, 4), ucl: avg(xLimits, 'ucl'), lcl: avg(xLimits, 'lcl'), n, pointLimits: xLimits },
    disp: { points: disp.map(v => round(v, 4)), cl: round(mean(centers), 4), ucl: avg(dLimits, 'ucl'), lcl: avg(dLimits, 'lcl'), n, pointLimits: dLimits }
  };
}

/** F-21. Carta X̄-R. */
export function calculateXbarR(subgroups: readonly (readonly number[])[]): { xbar: Series; r: Series } {
  if (!equalSizes(subgroups)) { const u = unequalLimits(subgroups, 'r'); return { xbar: u.main, r: u.disp }; }
  const means = subgroups.map(sg => mean(sg));
  const rs = ranges(subgroups);
  const xbarBar = mean(means);
  const rBar = mean(rs);
  const n = subgroups[0]!.length;
  const c = factor(XBAR_R, n);
  return {
    xbar: { points: means.map(v => round(v, 4)), cl: round(xbarBar, 4), ucl: round(xbarBar + c.A2 * rBar, 4), lcl: round(xbarBar - c.A2 * rBar, 4), n },
    r: { points: rs.map(v => round(v, 4)), cl: round(rBar, 4), ucl: round(c.D4 * rBar, 4), lcl: round(c.D3 * rBar, 4), n }
  };
}

/** F-22. Carta X̄-S. */
export function calculateXbarS(subgroups: readonly (readonly number[])[]): { xbar: Series; s: Series } {
  if (!equalSizes(subgroups)) { const u = unequalLimits(subgroups, 's'); return { xbar: u.main, s: u.disp }; }
  const means = subgroups.map(sg => mean(sg));
  const stdevs = subgroups.map(sg => stdDev(sg));
  const xbarBar = mean(means);
  const sBar = mean(stdevs);
  const n = subgroups[0]!.length;
  const c = factor(XBAR_S, n);
  return {
    xbar: { points: means.map(v => round(v, 4)), cl: round(xbarBar, 4), ucl: round(xbarBar + c.A3 * sBar, 4), lcl: round(xbarBar - c.A3 * sBar, 4), n },
    s: { points: stdevs.map(v => round(v, 4)), cl: round(sBar, 4), ucl: round(c.B4 * sBar, 4), lcl: round(c.B3 * sBar, 4), n }
  };
}

/** F-23. Carta I-MR (DA-13: disponible en el motor, no expuesta en la interfaz). */
export function calculateIMR(values: readonly number[]): { i: Series; mr: Series } {
  const xbar = mean(values);
  const mrs: number[] = [];
  for (let i = 1; i < values.length; i++) mrs.push(Math.abs(values[i]! - values[i - 1]!));
  const mrBar = mean(mrs);
  return {
    i: { points: values.map(v => round(v, 4)), cl: round(xbar, 4), ucl: round(xbar + IMR_E2 * mrBar, 4), lcl: round(xbar - IMR_E2 * mrBar, 4) },
    mr: { points: mrs.map(v => round(v, 4)), cl: round(mrBar, 4), ucl: round(IMR_D4 * mrBar, 4), lcl: 0 }
  };
}

/** F-25. Carta p (n variable o fijo). */
export function calculatePChart(subgroups: readonly { defectives: number; n: number }[]): { p: AttributeSeries } {
  const totalDef = subgroups.reduce((s, sg) => s + sg.defectives, 0);
  const totalN = subgroups.reduce((s, sg) => s + sg.n, 0);
  const pBar = totalN > 0 ? totalDef / totalN : 0;
  const pointData = subgroups.map(sg => {
    const p = sg.n > 0 ? sg.defectives / sg.n : 0;
    const std = Math.sqrt(pBar * (1 - pBar) / sg.n);
    const ucl = Math.min(1, pBar + 3 * std);
    const lcl = Math.max(0, pBar - 3 * std);
    return { value: round(p, 4), n: sg.n, ucl: round(ucl, 4), lcl: round(lcl, 4) };
  });
  const variableN = new Set(subgroups.map(sg => sg.n)).size > 1;
  return {
    p: {
      points: pointData.map(p => p.value),
      pointLimits: pointData.map(p => ({ ucl: p.ucl, lcl: p.lcl, n: p.n })),
      cl: round(pBar, 4),
      ucl: round(mean(pointData.map(p => p.ucl)), 4),
      lcl: round(mean(pointData.map(p => p.lcl)), 4),
      variableN,
      n: round(mean(subgroups.map(sg => sg.n)), 0)
    }
  };
}

/** F-26. Carta np (n fijo). */
export function calculateNPChart(subgroups: readonly { defectives: number }[], nFixed: number): { np: AttributeSeries } {
  const counts = subgroups.map(sg => sg.defectives);
  const npBar = mean(counts);
  const pBar = npBar / nFixed;
  const std = Math.sqrt(nFixed * pBar * (1 - pBar));
  const ucl = Math.min(nFixed, npBar + 3 * std);
  const lcl = Math.max(0, npBar - 3 * std);
  return { np: { points: counts.map(v => round(v, 0)), cl: round(npBar, 4), ucl: round(ucl, 4), lcl: round(lcl, 4), n: nFixed, variableN: false } };
}

/** F-27. Carta c. */
export function calculateCChart(subgroups: readonly { count: number }[]): { c: AttributeSeries } {
  const counts = subgroups.map(sg => sg.count);
  const cBar = mean(counts);
  const std = Math.sqrt(cBar);
  return { c: { points: counts.map(v => round(v, 0)), cl: round(cBar, 4), ucl: round(cBar + 3 * std, 4), lcl: round(Math.max(0, cBar - 3 * std), 4), variableN: false, n: 1 } };
}

/** F-28. Carta u. */
export function calculateUChart(subgroups: readonly { count: number; n: number }[]): { u: AttributeSeries } {
  const totalDef = subgroups.reduce((s, sg) => s + sg.count, 0);
  const totalN = subgroups.reduce((s, sg) => s + sg.n, 0);
  const uBar = totalN > 0 ? totalDef / totalN : 0;
  const pointData = subgroups.map(sg => {
    const u = sg.n > 0 ? sg.count / sg.n : 0;
    const std = Math.sqrt(uBar / sg.n);
    const ucl = uBar + 3 * std;
    const lcl = Math.max(0, uBar - 3 * std);
    return { value: round(u, 4), n: sg.n, ucl: round(ucl, 4), lcl: round(lcl, 4) };
  });
  const variableN = new Set(subgroups.map(sg => sg.n)).size > 1;
  return {
    u: {
      points: pointData.map(p => p.value),
      pointLimits: pointData.map(p => ({ ucl: p.ucl, lcl: p.lcl, n: p.n })),
      cl: round(uBar, 4),
      ucl: round(mean(pointData.map(p => p.ucl)), 4),
      lcl: round(mean(pointData.map(p => p.lcl)), 4),
      variableN,
      n: round(mean(subgroups.map(sg => sg.n)), 0)
    }
  };
}
