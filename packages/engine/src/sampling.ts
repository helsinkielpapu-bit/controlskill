// Planes de muestreo por atributos, binomial (documento maestro F-90…F-95).

function logFact(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
function logBinom(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFact(n) - logFact(k) - logFact(n - k);
}
function binomPMF(n: number, k: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logBinom(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** F-90. Probabilidad de aceptación P(X ≤ c). */
export function acceptanceProbability(n: number, c: number, p: number): number {
  if (p <= 0) return 1;
  if (p >= 1) return c >= n ? 1 : 0;
  let prob = 0;
  for (let k = 0; k <= Math.min(c, n); k++) prob += binomPMF(n, k, p);
  return Math.min(1, prob);
}

/** F-91. Menor n en [1, 5000] con Pa(n, c, LTPD) ≤ β. */
export function findConsumerN(c: number, ltpd: number, beta: number): number | null {
  if (acceptanceProbability(1, c, ltpd) <= beta) return 1;
  let lo = 1, hi = 5000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (acceptanceProbability(mid, c, ltpd) <= beta) hi = mid; else lo = mid + 1;
  }
  return lo <= 5000 ? lo : null;
}

export interface DesignedPlan { n: number; c: number; pa_aql: number; pa_ltpd: number }
/** F-92. Plan de mínimo n que cumple ambos riesgos. α y β como fracción. */
export function designPlan(aql: number, alpha: number, ltpd: number, beta: number): DesignedPlan | null {
  const candidates: DesignedPlan[] = [];
  for (let c = 0; c <= 50; c++) {
    const n = findConsumerN(c, ltpd, beta);
    if (!n || n > 5000) continue;
    const pa_aql = acceptanceProbability(n, c, aql);
    if (pa_aql >= 1 - alpha) candidates.push({ n, c, pa_aql, pa_ltpd: acceptanceProbability(n, c, ltpd) });
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.n - b.n)[0]!;
}

/** F-93. Calidad saliente promedio. */
export function aoq(n: number, c: number, N: number, p: number): number {
  return p * acceptanceProbability(n, c, p) * (N - n) / N;
}
/** F-93. AOQL: máximo de AOQ para p = i/1000, i = 1…200. */
export function computeAOQL(n: number, c: number, N: number): number {
  let maxAoq = 0;
  for (let i = 1; i <= 200; i++) {
    const a = aoq(n, c, N, i / 1000);
    if (a > maxAoq) maxAoq = a;
  }
  return maxAoq;
}
/** F-94. Inspección total promedio. */
export function ati(n: number, c: number, N: number, p: number): number {
  const pa = acceptanceProbability(n, c, p);
  return n * pa + N * (1 - pa);
}

/** DA-25: ¿el riesgo real no supera el pedido? (tolerancia solo para el redondeo de coma flotante) */
export const meets = (real: number, requested: number) => real <= requested + 1e-12;

export interface SamplingInput { mode: 'auto' | 'manual'; N: number; aql: number; ltpd: number; alpha?: number; beta?: number; n?: number; c?: number }
export interface SamplingResult {
  feasible: true; n: number; c: number; r: number; N: number; truncated: boolean; requiredN: number;
  aql: number; ltpd: number; alpha: number; beta: number;
  paAql: number; paLtpd: number; alphaReal: number; betaReal: number; aoql: number; atiAql: number; fraction: number;
  /** DA-25: en modo automático, si el plan final (también si se recortó a N) cumple α y β pedidos; null en modo manual. */
  meetsRisks: boolean | null;
}
export interface SamplingInfeasible { feasible: false; reason: 'aql_ge_ltpd' | 'no_plan' }

/**
 * Recalcula el plan. Valores en fracción (no %).
 * DA-04: `truncated` señala cuando el n requerido supera N (se inspecciona el lote completo).
 */
export function evaluateSampling(input: SamplingInput): SamplingResult | SamplingInfeasible {
  let n: number, c: number, alpha: number, beta: number;
  const { N, aql, ltpd } = input;
  if (input.mode === 'auto') {
    alpha = input.alpha!; beta = input.beta!;
    if (aql >= ltpd) return { feasible: false, reason: 'aql_ge_ltpd' };
    const plan = designPlan(aql, alpha, ltpd, beta);
    if (!plan) return { feasible: false, reason: 'no_plan' };
    n = plan.n; c = plan.c;
  } else {
    n = input.n!; c = input.c!;
    alpha = 1 - acceptanceProbability(n, c, aql);
    beta = acceptanceProbability(n, c, ltpd);
  }
  const requiredN = n;
  const truncated = n > N;
  if (truncated) n = N;
  const paAql = acceptanceProbability(n, c, aql);
  const paLtpd = acceptanceProbability(n, c, ltpd);
  return {
    feasible: true, n, c, r: c + 1, N, truncated, requiredN, aql, ltpd, alpha, beta,
    paAql, paLtpd, alphaReal: 1 - paAql, betaReal: paLtpd,
    aoql: computeAOQL(n, c, N), atiAql: ati(n, c, N, aql), fraction: n / N,
    meetsRisks: input.mode === 'auto' ? meets(1 - paAql, alpha) && meets(paLtpd, beta) : null
  };
}

export interface CandidatePlan { c: number; n: number; pa_aql: number; pa_ltpd: number; alphaR: number; betaR: number; aoql: number; atiAql: number }
/** F-95. Tabla de planes candidatos (NAC 0…15). */
export function candidatePlans(N: number, aql: number, alpha: number, ltpd: number, beta: number): CandidatePlan[] {
  const rows: CandidatePlan[] = [];
  for (let c = 0; c <= 15; c++) {
    const n = findConsumerN(c, ltpd, beta);
    if (!n || n > N) continue;
    const pa_aql = acceptanceProbability(n, c, aql);
    const pa_ltpd = acceptanceProbability(n, c, ltpd);
    const alphaR = 1 - pa_aql, betaR = pa_ltpd;
    // DA-25: solo planes que cumplen estrictamente los riesgos pedidos (sin holgura)
    if (!meets(alphaR, alpha) || !meets(betaR, beta)) continue;
    rows.push({ c, n, pa_aql, pa_ltpd, alphaR, betaR, aoql: computeAOQL(n, c, N), atiAql: Math.round(ati(n, c, N, aql)) });
  }
  return rows;
}

/** Curva CO (121 puntos) en porcentaje. */
export function ocCurve(n: number, c: number, ltpd: number) {
  const pts = 120, maxP = Math.min(Math.max(ltpd * 3, 0.25), 1);
  return Array.from({ length: pts + 1 }, (_, i) => {
    const p = (i / pts) * maxP;
    return { p: p * 100, pa: +(acceptanceProbability(n, c, p) * 100).toFixed(4) };
  });
}
/** Curva AOQ (p = i/500) en porcentaje. */
export function aoqCurve(n: number, c: number, N: number) {
  return Array.from({ length: 100 }, (_, k) => {
    const p = (k + 1) / 500;
    return { p: p * 100, aoq: +(aoq(n, c, N, p) * 100).toFixed(5) };
  });
}

/** Lectura de entradas; un 0 explícito se respeta (DA-04). */
export function readNumber(raw: string | number | null | undefined, fallback: number, parser: (s: string) => number = parseFloat): number {
  if (raw == null || String(raw).trim() === '') return fallback;
  const v = parser(String(raw));
  return Number.isNaN(v) ? fallback : v;
}
