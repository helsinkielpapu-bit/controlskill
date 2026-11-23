// Desempeño de la carta (documento maestro F-71, F-80…F-86).
import { normalCDF as phi, gammaLn } from './stats.js';
import type { ChartType } from './constants.js';

/** F-80. α = 2(1 − Φ(k)) para cartas por variables. */
export const calcAlpha = (k: number) => 2 * (1 - phi(k));

export interface BetaParams { k: number; delta: number; n: number; chartType?: ChartType | string | null; ucl?: number | null; lcl?: number | null; cl?: number | null }

const EPS = 1e-9; // evita que un límite exacto (p. ej. 13.000000001) cambie de conteo por redondeo de coma flotante
const binomPmf = (x: number, n: number, p: number) =>
  p <= 0 ? (x === 0 ? 1 : 0) : p >= 1 ? (x === n ? 1 : 0)
    : Math.exp(gammaLn(n + 1) - gammaLn(x + 1) - gammaLn(n - x + 1) + x * Math.log(p) + (n - x) * Math.log(1 - p));
const poissonPmf = (x: number, m: number) => (m <= 0 ? (x === 0 ? 1 : 0) : Math.exp(x * Math.log(m) - m - gammaLn(x + 1)));

/**
 * DA-26. Probabilidad de falsa alarma (α) con los límites reales de la carta.
 * Variables: 2(1 − Φ(k)). Atributos: distribución exacta del conteo bajo control,
 * binomial en p y np, Poisson en c y u; α = 1 − P(el conteo cae entre LCI y LCS).
 */
export function falseAlarmProbability({ k, n, chartType, ucl, lcl, cl }: BetaParams): number {
  const type = chartType || 'xbar_r';
  if (type === 'xbar_r' || type === 'xbar_s' || ucl == null || cl == null) return calcAlpha(k);
  const lo = lcl ?? 0;
  const size = Math.max(1, Math.round(n));
  let inside = 0;
  if (type === 'p' || type === 'np') {
    const p = type === 'p' ? cl : cl / size;
    const scale = type === 'p' ? size : 1;              // p: se cuenta X = p̂·n
    const a = Math.max(0, Math.ceil(lo * scale - EPS)), b = Math.min(size, Math.floor(ucl * scale + EPS));
    for (let x = a; x <= b; x++) inside += binomPmf(x, size, p);
  } else if (type === 'c' || type === 'u') {
    const scale = type === 'u' ? size : 1;              // u: X = û·n ~ Poisson(n·ū)
    const m = cl * scale;
    const a = Math.max(0, Math.ceil(lo * scale - EPS)), b = Math.floor(ucl * scale + EPS);
    for (let x = a; x <= b; x++) inside += poissonPmf(x, m);
  } else return calcAlpha(k);
  return Math.min(1, Math.max(1e-12, 1 - inside));
}

/** F-81. β según el tipo de carta, con los límites reales en atributos. */
export function calcBeta({ k, delta, n, chartType, ucl, lcl, cl }: BetaParams): number {
  const type = chartType || 'xbar_r';
  const variable = () => { const sh = delta * Math.sqrt(n); return phi(k - sh) - phi(-k - sh); };
  if (type === 'xbar_r' || type === 'xbar_s') return variable();
  if (ucl == null || cl == null) return variable();
  const lclSafe = lcl ?? 0;
  if (type === 'p') {
    const pbar = cl;
    const sigmaP = Math.sqrt(Math.max(pbar * (1 - pbar) / n, 1e-9));
    const p1 = Math.max(1e-9, Math.min(1 - 1e-9, pbar + delta * sigmaP));
    const sig1 = Math.sqrt(Math.max(p1 * (1 - p1) / n, 1e-9));
    return phi((ucl - p1) / sig1) - phi((lclSafe - p1) / sig1);
  }
  if (type === 'np') {
    const npbar = cl;
    const pbar = npbar / Math.max(n, 1);
    const sigma = Math.sqrt(Math.max(npbar * (1 - pbar), 1e-9));
    const np1 = Math.max(0, npbar + delta * sigma);
    const p1 = np1 / Math.max(n, 1);
    const sig1 = Math.sqrt(Math.max(np1 * (1 - p1), 1e-9));
    return phi((ucl - np1) / sig1) - phi((lclSafe - np1) / sig1);
  }
  if (type === 'c') {
    const sigma = Math.sqrt(Math.max(cl, 1e-9));
    const c1 = Math.max(0, cl + delta * sigma);
    const sig1 = Math.sqrt(Math.max(c1, 1e-9));
    return phi((ucl - c1) / sig1) - phi((lclSafe - c1) / sig1);
  }
  if (type === 'u') {
    const sigma = Math.sqrt(Math.max(cl / n, 1e-9));
    const u1 = Math.max(0, cl + delta * sigma);
    const sig1 = Math.sqrt(Math.max(u1 / n, 1e-9));
    return phi((ucl - u1) / sig1) - phi((lclSafe - u1) / sig1);
  }
  return variable();
}

export interface PerformanceInputs { t?: number | string; delta?: number | string; pnc?: number | string; prod?: number | string }
export interface Sanitized { h: number; delta: number; pnc: number; prod: number }

/** F-80. Saneamiento de entradas. PNC en fracción. */
export function sanitizePerformanceInputs(i: PerformanceInputs): Sanitized {
  const h = Math.max(0.01, parseFloat(String(i.t)) || 4);
  const delta = Math.max(0.01, parseFloat(String(i.delta)) || 1);
  const pnc = parseFloat(String(i.pnc));
  const rawPnc = (pnc == null || isNaN(pnc) || !isFinite(pnc)) ? 0.025 : Math.min(100, Math.max(0, pnc)) / 100;
  const prod = Math.max(0, parseFloat(String(i.prod)) || 100);
  return { h, delta, pnc: rawPnc, prod };
}

export interface PerformanceMetrics { alpha: number; beta: number; power: number; arl0: number; arl1: number; ats0: number; ats1: number; ppnc: number }

/** F-82. Métricas principales. */
export function performanceMetrics(betaParams: BetaParams, h: number, pnc: number, prod: number): PerformanceMetrics {
  const alpha = falseAlarmProbability(betaParams);
  const beta = calcBeta(betaParams);
  const power = Math.max(1e-9, 1 - beta);
  const arl0 = 1 / alpha;
  const arl1 = 1 / power;
  const ats0 = arl0 * h;
  const ats1 = arl1 * h;
  return { alpha, beta, power, arl0, arl1, ats0, ats1, ppnc: ats1 * pnc * prod };
}

export const SENSITIVITY_DELTAS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0] as const;

/** F-85. Tabla de sensibilidad. */
export function sensitivityTable(betaParams: BetaParams, h: number, pnc: number, prod: number, sigmaProcess: number | null) {
  return SENSITIVITY_DELTAS.map(d => {
    const b = calcBeta({ ...betaParams, delta: d });
    const power = Math.max(1e-9, 1 - b);
    const arl1 = 1 / power;
    const ats1 = arl1 * h;
    return { delta: d, beta: b, power, arl1, ats1, ppnc: ats1 * pnc * prod, realShift: sigmaProcess != null ? d * sigmaProcess : null, current: Math.abs(d - betaParams.delta) < 0.001 };
  });
}

export interface LoadPlan { n: number; t: number; cm: number; b: number; power: number; arl1: number; ats1: number; ppnc: number }
export interface LoadPlans { current: LoadPlan; plan1: LoadPlan; plan2: LoadPlan; best: LoadPlan | null; targetCM: number; pctInc: number }

/** F-84. Carga muestral CM = n/t: plan actual, Plan 1 (misma n), Plan 2 (mismo t) y mejor plan. */
export function sampleLoadPlans(betaParams: BetaParams, currentN: number, tRaw: number | string, cmDeltaRaw: number | string, pnc: number, prod: number): LoadPlans {
  const currentT = Math.max(0.01, parseFloat(String(tRaw)) || 4);
  const currentCM = currentN / currentT;
  const pctInc = Math.max(0, Math.min(1, parseFloat(String(cmDeltaRaw)) || 0));
  const targetCM = currentCM * (1 + pctInc);
  const compute = (n: number, t: number): LoadPlan => {
    const b = Math.max(1e-9, Math.min(1 - 1e-9, calcBeta({ ...betaParams, n })));
    const power = Math.max(1e-9, 1 - b);
    const arl1 = 1 / power;
    const ats1 = arl1 * t;
    return { n, t, cm: n / t, b, power, arl1, ats1, ppnc: ats1 * pnc * prod };
  };
  const current = compute(currentN, currentT);
  const plan1 = compute(currentN, currentN / targetCM);
  const plan2 = compute(Math.max(1, targetCM * currentT), currentT);
  const candidates = [plan1, plan2].filter(p => p.cm >= targetCM);
  const best = candidates.length ? candidates.reduce((a, b) => (a.ats1 < b.ats1 ? a : b)) : null;
  return { current, plan1, plan2, best, targetCM, pctInc };
}

const A2: Record<number, number> = { 2: 1.880, 3: 1.023, 4: 0.729, 5: 0.577, 6: 0.483, 7: 0.419, 8: 0.373, 9: 0.337, 10: 0.308 };
const A3: Record<number, number> = { 2: 2.659, 3: 1.954, 4: 1.628, 5: 1.427, 6: 1.287, 7: 1.182, 8: 1.099, 9: 1.032, 10: 0.975 };

/** F-86. Inferir n desde UCL/CL y la línea central de la carta secundaria. */
export function inferNFromChart(type: string, main: { ucl?: number | null; cl?: number | null }, second: { cl?: number | null } | null): number | null {
  if (!second || !main.ucl || !main.cl || !second.cl || second.cl === 0) return null;
  const table = type === 'xbar_r' ? A2 : A3;
  const a = (main.ucl - main.cl) / second.cl;
  let best: number | null = null, bestDiff = Infinity;
  for (const [k, v] of Object.entries(table)) {
    const diff = Math.abs(v - a);
    if (diff < bestDiff) { bestDiff = diff; best = parseInt(k); }
  }
  return bestDiff < 0.08 ? best : null;
}

/** F-71. Evaluación de Fase II: desplazamiento y fracción no conforme con μ₀ y μ₁. */
export function phaseTwoEvaluation(sessionMeans: readonly number[], mu0: number, sigmaP: number, n: number, usl: number | null, lsl: number | null) {
  const mu1 = sessionMeans.reduce((a, b) => a + b, 0) / sessionMeans.length;
  const deltaReal = (mu1 - mu0) / sigmaP;
  const shiftXbar = deltaReal * Math.sqrt(n);
  let pnc0: number | null = null, pnc1: number | null = null;
  if (usl != null && lsl != null) {
    pnc0 = phi((lsl - mu0) / sigmaP) + (1 - phi((usl - mu0) / sigmaP));
    pnc1 = phi((lsl - mu1) / sigmaP) + (1 - phi((usl - mu1) / sigmaP));
  }
  return { mu0, mu1, sigmaP, n, deltaReal, shiftXbar, pnc0, pnc1, usl, lsl };
}

type Level = 'good' | 'warn' | 'danger';
/** F-83. Niveles de las tarjetas. */
export const levels = {
  alpha: (a: number): [Level, string] => a < 0.001 ? ['warn', 'Muy pocas falsas alarmas'] : a <= 0.005 ? ['good', 'Nivel estándar industrial'] : a <= 0.05 ? ['warn', 'Falsas alarmas frecuentes'] : ['danger', 'Demasiadas falsas alarmas'],
  power: (p: number): [Level, string] => p >= 0.90 ? ['good', 'Alta sensibilidad'] : p >= 0.70 ? ['good', 'Buena detección'] : p >= 0.40 ? ['warn', 'Detección moderada'] : ['danger', 'Detección baja'],
  arl1: (a: number): [Level, string] => a < 5 ? ['good', 'Detección muy rápida'] : a < 20 ? ['good', 'Detección rápida'] : a < 50 ? ['warn', 'Detección moderada'] : ['danger', 'Detección lenta'],
  ats1: (t: number, h: number): [Level, string] => t <= h ? ['good', '≤ 1 ciclo de muestreo'] : t <= 8 ? ['good', 'Detección en ≤ 1 turno'] : t <= 24 ? ['warn', 'Puede tardar hasta 1 día'] : ['danger', 'Más de 1 día sin detección'],
  ppnc: (v: number): [Level, string] => v < 10 ? ['good', 'Impacto mínimo'] : v < 100 ? ['warn', 'Impacto moderado — revisa t o n'] : ['danger', 'Impacto alto — reduce ATS₁']
};
