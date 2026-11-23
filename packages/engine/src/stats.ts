// Funciones estadísticas básicas y especiales (documento maestro F-02…F-10).
// El orden de las operaciones está fijado para obtener resultados reproducibles en coma flotante.

/** F-02. Media aritmética; 0 para un arreglo vacío. */
export function mean(values: readonly number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** F-03. Desviación estándar muestral (n − 1); 0 si n < 2. */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Redondeo del sistema: Math.round(v·10^d)/10^d. */
export function round(v: number, d: number): number {
  return Math.round(v * 10 ** d) / 10 ** d;
}

/** F-04. Φ(z) — Abramowitz & Stegun 26.2.17, convención z > 0 (DA-15). */
export function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-(z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
] as const;

/** F-05. ln Γ(x), Lanczos g = 7. */
export function gammaLn(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaLn(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** F-06. Gamma incompleta regularizada inferior P(a, x). */
export function gammaRegP(a: number, x: number): number {
  if (x <= 0) return 0;
  const EPS = 1e-13, FPMIN = 1e-300;
  if (x < a + 1) {
    let term = 1 / a, sum = term;
    for (let n = 1; n < 300; n++) {
      term *= x / (a + n); sum += term;
      if (Math.abs(term) < EPS * Math.abs(sum)) break;
    }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - gammaLn(a)));
  }
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let n = 1; n <= 300; n++) {
    const an = -n * (n - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - gammaLn(a)) * h);
}

/** F-07. Beta incompleta regularizada I_x(a, b). */
export function betaRegI(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - betaRegI(1 - x, b, a);
  const lbeta = gammaLn(a) + gammaLn(b) - gammaLn(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;
  const EPS = 1e-13, FPMIN = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.max(0, Math.min(1, front * h));
}

/** F-08. p-valor χ²: P(χ² > x | df). */
export function chiSqP(chi2: number, df: number): number {
  if (chi2 <= 0) return 1;
  return Math.max(0, 1 - gammaRegP(df / 2, chi2 / 2));
}

/** F-09. p-valor F: P(F > f | df1, df2). */
export function fP(f: number, df1: number, df2: number): number {
  if (f <= 0) return 1;
  return Math.max(0, 1 - betaRegI(df1 * f / (df1 * f + df2), df1 / 2, df2 / 2));
}

/** F-10. Φ⁻¹(p) — aproximación de Acklam. Solo para el gráfico Q-Q. */
export function normInv(p: number): number {
  const a = [0, -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [0, -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [0, -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [0, 7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[1]! * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) * q + c[6]!) /
      ((((d[1]! * q + d[2]!) * q + d[3]!) * q + d[4]!) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5; const r = q * q;
    return (((((a[1]! * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * r + a[6]!) * q /
      (((((b[1]! * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + b[5]!) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[1]! * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) * q + c[6]!) /
    ((((d[1]! * q + d[2]!) * q + d[3]!) * q + d[4]!) * q + 1);
}

/** Mediana con promedio de los dos centrales (usada por Levene). */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1]! + sorted[m]!) / 2 : sorted[m]!;
}
