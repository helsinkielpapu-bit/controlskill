// Histograma y curva normal (documento maestro F-50, F-51, F-54).
import { round } from './stats.js';

export interface Histogram {
  labels: string[]; midpoints: number[]; frequencies: number[];
  binWidth: number; min: number; max: number;
}

/** F-50. */
export function generateHistogramData(values: readonly number[], bins = 10): Histogram {
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const w = range / bins;
  const labels: string[] = [];
  const midpoints: number[] = [];
  const frequencies = Array<number>(bins).fill(0);
  for (let i = 0; i < bins; i++) {
    const lo = minV + i * w;
    const hi = lo + w;
    labels.push(`${lo.toFixed(3)}`);
    midpoints.push(round((lo + hi) / 2, 4));
    frequencies[i] = values.filter(v => (i === bins - 1 ? v >= lo && v <= hi : v >= lo && v < hi)).length;
  }
  return { labels, midpoints, frequencies, binWidth: round(w, 4), min: minV, max: maxV };
}

/** F-51. Puntos de la curva normal (densidad). */
export function normalCurvePoints(xbar: number, sigma: number, min: number, max: number, steps = 100): { x: number; y: number }[] {
  const step = (max - min) / steps;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = min + i * step;
    const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - xbar) / sigma) ** 2);
    points.push({ x: round(x, 4), y: round(y, 6) });
  }
  return points;
}

/** F-51. Número de intervalos solicitado, acotado a [5, 30]. */
export const clampBins = (bins: number | string | undefined) => Math.min(Math.max(parseInt(String(bins ?? 10)), 5), 30);

/** F-54. Intervalos del informe: round(√N) acotado a [5, 30]. */
export const reportBins = (n: number) => Math.min(Math.max(Math.round(Math.sqrt(n)), 5), 30);
