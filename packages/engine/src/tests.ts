// Pruebas estadísticas (documento maestro F-40…F-44).
import { mean, stdDev, normalCDF, round, median, fP, chiSqP } from './stats.js';

export interface Unavailable { available: false; reason: string }
export interface AndersonDarling {
  available: true; test: 'Anderson-Darling'; h0: string; statistic: number; p_value: number; n: number;
  normal: boolean; result: string; interpretation: string;
}
export interface Levene {
  available: true; test: 'Levene (Brown-Forsythe)'; h0: string; statistic: number; p_value: number;
  df1: number; df2: number; n_groups: number; homoscedastic: boolean; result: string; interpretation: string;
}
export interface KruskalWallis {
  available: true; test: 'Kruskal-Wallis'; h0: string; statistic: number; p_value: number;
  df: number; n_groups: number; homogeneous: boolean; result: string; interpretation: string;
}
export interface StatisticalTests {
  n_total: number; n_subgroups: number;
  normality: AndersonDarling | Unavailable;
  homoscedasticity: Levene | Unavailable;
  homogeneity: KruskalWallis | Unavailable;
}
export interface TestRow { value: number | string; subgroup_id?: number | string | null }

const verdict = (p: number) => (p > 0.05 ? 'No se rechaza H₀' : 'Se rechaza H₀');

/** F-41. Anderson-Darling con corrección y p-valor de Stephens (1974). */
export function andersonDarlingTest(values: readonly number[]): AndersonDarling | Unavailable {
  const n = values.length;
  if (n < 7) return { available: false, reason: `Se necesitan al menos 7 observaciones (n = ${n}).` };
  const mu = mean(values);
  const s = stdDev(values);
  if (s === 0) return { available: false, reason: 'Desviación estándar = 0; todos los valores son idénticos.' };

  const sorted = [...values].sort((a, b) => a - b);
  let S = 0;
  for (let i = 0; i < n; i++) {
    const z1 = (sorted[i]! - mu) / s;
    const z2 = (sorted[n - 1 - i]! - mu) / s;
    const p1 = Math.max(normalCDF(z1), 1e-15);
    const p2 = Math.max(1 - normalCDF(z2), 1e-15);
    S += (2 * (i + 1) - 1) * (Math.log(p1) + Math.log(p2));
  }
  const A2raw = -n - S / n;
  const A2 = A2raw * (1 + 0.75 / n + 2.25 / (n * n));

  let p: number;
  if (A2 < 0.200) p = 1 - Math.exp(-13.436 + 101.14 * A2 - 223.73 * A2 * A2);
  else if (A2 < 0.340) p = 1 - Math.exp(-8.318 + 42.796 * A2 - 59.938 * A2 * A2);
  else if (A2 < 0.600) p = Math.exp(0.9177 - 4.279 * A2 - 1.38 * A2 * A2);
  else if (A2 < 13) p = Math.exp(1.2937 - 5.709 * A2 + 0.0186 * A2 * A2);
  else p = 0;
  p = Math.min(1, Math.max(0, p));

  return {
    available: true,
    test: 'Anderson-Darling',
    h0: 'Los datos provienen de una distribución normal',
    statistic: round(A2, 4),
    p_value: round(p, 4),
    n,
    normal: p > 0.05,
    result: verdict(p),
    interpretation: p > 0.05
      ? `Con p = ${round(p, 4)} > 0.05, los datos son consistentes con normalidad.`
      : `Con p = ${round(p, 4)} ≤ 0.05, los datos NO siguen una distribución normal.`
  };
}

function groupsOk(groups: readonly (readonly number[])[]): Unavailable | null {
  if (groups.length < 2) return { available: false, reason: 'Se necesitan al menos 2 grupos.' };
  if (groups.some(g => g.length < 2)) return { available: false, reason: 'Cada grupo necesita al menos 2 observaciones.' };
  return null;
}

/** F-42. Levene, variante Brown-Forsythe (mediana). */
export function levenesTest(groups: readonly (readonly number[])[]): Levene | Unavailable {
  const bad = groupsOk(groups); if (bad) return bad;
  const k = groups.length;
  const N = groups.reduce((s, g) => s + g.length, 0);
  const medians = groups.map(g => median(g));
  const Z = groups.map((g, i) => g.map(v => Math.abs(v - medians[i]!)));
  const ZiBar = Z.map(zg => mean(zg));
  const ZBar = mean(Z.flat());
  const num = (N - k) * Z.reduce((s, zg, i) => s + zg.length * (ZiBar[i]! - ZBar) ** 2, 0);
  const den = (k - 1) * Z.reduce((s, zg, i) => s + zg.reduce((ss, z) => ss + (z - ZiBar[i]!) ** 2, 0), 0);
  if (den === 0) return { available: false, reason: 'Sin varianza suficiente para el cálculo.' };
  const W = num / den;
  const p = fP(W, k - 1, N - k);
  return {
    available: true,
    test: 'Levene (Brown-Forsythe)',
    h0: 'Las varianzas de todos los grupos son iguales',
    statistic: round(W, 4),
    p_value: round(p, 4),
    df1: k - 1,
    df2: N - k,
    n_groups: k,
    homoscedastic: p > 0.05,
    result: verdict(p),
    interpretation: p > 0.05
      ? `Con p = ${round(p, 4)} > 0.05, las varianzas son homogéneas en los ${k} grupos.`
      : `Con p = ${round(p, 4)} ≤ 0.05, las varianzas NO son homogéneas entre los ${k} grupos.`
  };
}

/** F-43. Kruskal-Wallis con corrección por empates. */
export function kruskalWallisTest(groups: readonly (readonly number[])[]): KruskalWallis | Unavailable {
  const bad = groupsOk(groups); if (bad) return bad;
  const k = groups.length;
  const N = groups.reduce((s, g) => s + g.length, 0);
  const all = groups.flatMap((g, gi) => g.map(v => ({ v, gi, r: 0 })));
  all.sort((a, b) => a.v - b.v);
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length - 1 && all[j + 1]!.v === all[j]!.v) j++;
    const r = (i + j + 2) / 2;
    for (let m = i; m <= j; m++) all[m]!.r = r;
    i = j + 1;
  }
  const Ri = Array<number>(k).fill(0);
  all.forEach(({ gi, r }) => (Ri[gi] = Ri[gi]! + r));
  const H = (12 / (N * (N + 1))) * Ri.reduce((s, r, gi) => s + r * r / groups[gi]!.length, 0) - 3 * (N + 1);

  // Corrección por empates: frecuencias por valor (por claves de un objeto)
  const freq = new Map<string, number>();
  all.forEach(({ v }) => freq.set(String(v), (freq.get(String(v)) ?? 0) + 1));
  const tieC = 1 - [...freq.values()].filter(t => t > 1).reduce((s, t) => s + (t ** 3 - t), 0) / (N ** 3 - N);
  const Hadj = tieC > 0 ? H / tieC : H;
  const p = chiSqP(Hadj, k - 1);
  return {
    available: true,
    test: 'Kruskal-Wallis',
    h0: 'Las medianas de todos los grupos son iguales',
    statistic: round(Hadj, 4),
    p_value: round(p, 4),
    df: k - 1,
    n_groups: k,
    homogeneous: p > 0.05,
    result: verdict(p),
    interpretation: p > 0.05
      ? `Con p = ${round(p, 4)} > 0.05, las medianas son homogéneas en los ${k} grupos.`
      : `Con p = ${round(p, 4)} ≤ 0.05, existen diferencias significativas entre los ${k} grupos.`
  };
}

/** F-40. Ejecuta las tres pruebas con su agrupación. */
export function runStatisticalTests(rows: readonly TestRow[]): StatisticalTests {
  const values = rows.map(r => parseFloat(String(r.value)));
  const normality = andersonDarlingTest(values);
  const sgMap = new Map<unknown, number[]>();
  rows.forEach(r => {
    const key = r.subgroup_id != null ? r.subgroup_id : '__solo__';
    if (!sgMap.has(key)) sgMap.set(key, []);
    sgMap.get(key)!.push(parseFloat(String(r.value)));
  });
  const hasGroups = !(sgMap.size === 1 && sgMap.has('__solo__'));
  const groups = hasGroups
    ? [...sgMap.entries()].filter(([k]) => k !== '__solo__').map(([, g]) => g).filter(g => g.length >= 2)
    : [];
  const noGroups: Unavailable = { available: false, reason: 'Se requieren al menos 2 subgrupos con ≥ 2 observaciones cada uno.' };
  return {
    n_total: values.length,
    n_subgroups: groups.length,
    normality,
    homoscedasticity: groups.length >= 2 ? levenesTest(groups) : noGroups,
    homogeneity: groups.length >= 2 ? kruskalWallisTest(groups) : noGroups
  };
}

export interface RunsTest { runs: number; expectedRuns: number; z: number; p: number; independent: boolean }
/** F-44. Prueba de rachas sobre la mediana (presentación en Capacidad). */
export function runsTest(values: readonly number[] | null | undefined): RunsTest | null {
  if (!values || values.length < 10) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)]!;
  let runs = 1;
  for (let i = 1; i < values.length; i++) {
    if ((values[i - 1]! > med) !== (values[i]! > med)) runs++;
  }
  const n1 = values.filter(v => v > med).length;
  const n2 = values.length - n1;
  const expectedRuns = 1 + (2 * n1 * n2) / (n1 + n2);
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / ((n1 + n2) ** 2 * (n1 + n2 - 1));
  if (variance <= 0) return null;
  const z = (runs - expectedRuns) / Math.sqrt(variance);
  const p = 2 * (1 - normalCDF(Math.abs(z)));
  return { runs, expectedRuns, z, p, independent: p > 0.05 };
}
