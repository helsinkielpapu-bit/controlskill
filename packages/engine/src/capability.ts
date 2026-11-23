// Capacidad del proceso (documento maestro F-12, F-13).
import { mean, stdDev, normalCDF, round } from './stats.js';
import { D2, C4, factor } from './constants.js';
import { equalSizes, modalSize } from './charts.js';

export type CapabilityStatus = 'capaz' | 'marginal' | 'no_capaz';
export type SigmaMethod = 'rbar_d2' | 'sbar_c4';

export interface Capability {
  xbar: number; sigma: number;
  cp: number; cpu: number; cpl: number; cpk: number;
  ppmUpper: number; ppmLower: number; ppmTotal: number;
  status: CapabilityStatus;
  n: number;
  tolerance: number; distToUsl: number; distToLsl: number; distToNominal: number | null;
  sigmaMethod?: SigmaMethod; n_subgroups?: number; subgroup_size?: number;
}

export function capabilityStatus(cpk: number): CapabilityStatus {
  if (cpk < 1.0) return 'no_capaz';
  if (cpk < 1.33) return 'marginal';
  return 'capaz';
}

/** Nominal: numérico o null. */
export function parseNominal(nominal: unknown): number | null {
  if (nominal == null) return null;
  const v = parseFloat(String(nominal));
  return isNaN(v) ? null : v;
}

/** F-12. Capacidad con σ global (sin subgrupos). Devuelve null si σ = 0. */
export function calculateCapability(values: readonly number[], usl: number, lsl: number, nominal?: unknown): Capability | null {
  const xbar = mean(values);
  const sigma = stdDev(values);
  if (sigma === 0) return null;

  const cp = (usl - lsl) / (6 * sigma);
  const cpu = (usl - xbar) / (3 * sigma);
  const cpl = (xbar - lsl) / (3 * sigma);
  const cpk = Math.min(cpu, cpl);

  const zUpper = (usl - xbar) / sigma;
  const zLower = (xbar - lsl) / sigma;
  const ppmUpper = normalCDF(-zUpper) * 1_000_000;
  const ppmLower = normalCDF(-zLower) * 1_000_000;
  const ppmTotal = ppmUpper + ppmLower;
  const nom = parseNominal(nominal);

  return {
    xbar: round(xbar, 4),
    sigma: round(sigma, 4),
    cp: round(cp, 3),
    cpu: round(cpu, 3),
    cpl: round(cpl, 3),
    cpk: round(cpk, 3),
    ppmUpper: round(ppmUpper, 2),
    ppmLower: round(ppmLower, 2),
    ppmTotal: round(ppmTotal, 2),
    status: capabilityStatus(cpk),
    n: values.length,
    tolerance: round(usl - lsl, 4),
    distToUsl: round(usl - xbar, 4),
    distToLsl: round(xbar - lsl, 4),
    distToNominal: nom != null ? round(Math.abs(xbar - nom), 4) : null
  };
}

/**
 * σ̂ dentro de subgrupos: S̄/c₄ para X̄-S, R̄/d₂ en cualquier otro caso.
 * DA-23: con tamaños distintos, promedio de Sᵢ/c₄(nᵢ) o Rᵢ/d₂(nᵢ), cada subgrupo con su propia constante.
 */
export function sigmaWithin(subgroups: readonly (readonly number[])[], chartType: string): number {
  if (!equalSizes(subgroups)) {
    return mean(subgroups.map(sg => chartType === 'xbar_s'
      ? stdDev(sg) / factor(C4, sg.length)
      : (Math.max(...sg) - Math.min(...sg)) / factor(D2, sg.length)));
  }
  const n = subgroups[0]!.length;
  if (chartType === 'xbar_s') {
    const sBar = mean(subgroups.map(sg => stdDev(sg)));
    return sBar / factor(C4, n);
  }
  const rBar = mean(subgroups.map(sg => Math.max(...sg) - Math.min(...sg)));
  return rBar / factor(D2, n);
}

/** F-13. Capacidad desde subgrupos: Cp/Cpk con σ̂w (corto plazo). */
export function calculateCapabilityFromSubgroups(
  subgroups: readonly (readonly number[])[], usl: number, lsl: number, nominal?: unknown, chartType = 'xbar_r'
): Capability | null {
  const n = modalSize(subgroups);
  const allValues = subgroups.flat();
  const xbar = mean(allValues);
  const sigmaW = sigmaWithin(subgroups, chartType);
  if (sigmaW === 0) return null;

  const cp = (usl - lsl) / (6 * sigmaW);
  const cpu = (usl - xbar) / (3 * sigmaW);
  const cpl = (xbar - lsl) / (3 * sigmaW);
  const cpk = Math.min(cpu, cpl);

  const zUpper = (usl - xbar) / sigmaW;
  const zLower = (xbar - lsl) / sigmaW;
  const ppmUpper = normalCDF(-zUpper) * 1_000_000;
  const ppmLower = normalCDF(-zLower) * 1_000_000;
  const ppmTotal = ppmUpper + ppmLower;
  const nom = parseNominal(nominal);

  return {
    xbar: round(xbar, 4),
    sigma: round(sigmaW, 4),
    sigmaMethod: chartType === 'xbar_s' ? 'sbar_c4' : 'rbar_d2',
    cp: round(cp, 3),
    cpu: round(cpu, 3),
    cpl: round(cpl, 3),
    cpk: round(cpk, 3),
    ppmUpper: round(ppmUpper, 2),
    ppmLower: round(ppmLower, 2),
    ppmTotal: round(ppmTotal, 2),
    status: capabilityStatus(cpk),
    n: allValues.length,
    n_subgroups: subgroups.length,
    subgroup_size: n,
    tolerance: round(usl - lsl, 4),
    distToUsl: round(usl - xbar, 4),
    distToLsl: round(xbar - lsl, 4),
    distToNominal: nom != null ? round(Math.abs(xbar - nom), 4) : null
  };
}

/** F-14. %PNC por colas (presentación), con σ y x̄ de la respuesta. */
export function nonconformingPercent(xbar: number, sigma: number, usl: number, lsl: number) {
  const zUsl = (usl - xbar) / sigma;
  const zLsl = (xbar - lsl) / sigma;
  const upper = normalCDF(-zUsl) * 100;
  const lower = normalCDF(-zLsl) * 100;
  return { zUsl, zLsl, upper, lower, total: upper + lower };
}

export type Centering = 'centered' | 'slight' | 'offset';
/** F-15. Clasificación de centrado respecto al nominal. */
export function centering(xbar: number, nominal: number, sigma: number): { kind: Centering; deviation: number } {
  const deviation = Math.abs(xbar - nominal);
  const kind: Centering = deviation <= 0.5 * sigma ? 'centered' : deviation <= 1.5 * sigma ? 'slight' : 'offset';
  return { kind, deviation };
}
