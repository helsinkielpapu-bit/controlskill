// Reglas de detección (documento maestro F-30, F-31, F-32).
import type { PointLimit } from './charts.js';

export type RuleId = 'ooc' | 'trend' | 'shift';
export type Severity = 'critical' | 'warning';
export interface Violation { index: number; rule: RuleId; description: string; severity: Severity }
export interface RuleOptions { detectOutOfControl?: boolean; detectTrend?: boolean; detectShift?: boolean }

/**
 * F-30. Tres reglas industriales configurables.
 * `pointLimits` (DA-16): si se entrega, la regla «fuera de control» usa el límite de cada punto
 * en lugar de los límites globales. Tendencia y corrimiento usan siempre la línea central.
 */
export function applySPCRules(
  points: readonly number[], cl: number, ucl: number, lcl: number,
  options: RuleOptions = {}, pointLimits?: readonly PointLimit[]
): Violation[] {
  const { detectOutOfControl = true, detectTrend = true, detectShift = true } = options;
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const add = (index: number, rule: RuleId, description: string, severity: Severity) => {
    const key = `${index}-${rule}`;
    if (!seen.has(key)) { seen.add(key); violations.push({ index, rule, description, severity }); }
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const up = pointLimits?.[i]?.ucl ?? ucl;
    const lo = pointLimits?.[i]?.lcl ?? lcl;
    if (detectOutOfControl && (p > up || p < lo)) {
      add(i, 'ooc', `Punto ${i + 1} fuera de los límites de control estadístico`, 'critical');
    }
    if (detectTrend && i >= 5) {
      const w = points.slice(i - 5, i + 1);
      let asc = true, dec = true;
      for (let j = 1; j < w.length; j++) {
        if (w[j]! <= w[j - 1]!) asc = false;
        if (w[j]! >= w[j - 1]!) dec = false;
      }
      if (asc || dec) {
        add(i, 'trend', `Tendencia de 6 puntos consecutivos ${asc ? 'ascendente' : 'descendente'} (obs. ${i - 4}–${i + 1})`, 'warning');
      }
    }
    if (detectShift && i >= 7) {
      const w = points.slice(i - 7, i + 1);
      const above = w.every(v => v > cl);
      const below = w.every(v => v < cl);
      if (above || below) {
        add(i, 'shift', `8 puntos consecutivos ${above ? 'sobre' : 'bajo'} la línea central (obs. ${i - 6}–${i + 1})`, 'warning');
      }
    }
  }
  return violations;
}

export const outOfControlIndexes = (violations: readonly Violation[]) => [...new Set(violations.map(v => v.index))];

export interface NelsonViolation { index: number; rule: 1 | 2 | 3 | 4; description: string }

/** F-31. Reglas de Nelson 1–4 (DA-13: en el motor, no expuestas en la interfaz). */
export function applyNelsonRules(points: readonly number[], cl: number, ucl: number, lcl: number): NelsonViolation[] {
  const violations: NelsonViolation[] = [];
  const seen = new Set<string>();
  const add = (index: number, rule: NelsonViolation['rule'], description: string) => {
    const key = `${index}-${rule}`;
    if (!seen.has(key)) { seen.add(key); violations.push({ index, rule, description }); }
  };
  for (let i = 0; i < points.length; i++) {
    if (points[i]! > ucl || points[i]! < lcl) add(i, 1, 'Punto fuera de ±3σ (límites de control)');
    if (i >= 8) {
      const w = points.slice(i - 8, i + 1);
      if (w.every(p => p > cl) || w.every(p => p < cl)) add(i, 2, '9 puntos consecutivos del mismo lado de la línea central');
    }
    if (i >= 5) {
      const w = points.slice(i - 5, i + 1);
      let asc = true, desc = true;
      for (let j = 1; j < w.length; j++) {
        if (w[j]! <= w[j - 1]!) asc = false;
        if (w[j]! >= w[j - 1]!) desc = false;
      }
      if (asc || desc) add(i, 3, '6 puntos consecutivos en tendencia monótona');
    }
    if (i >= 13) {
      const w = points.slice(i - 13, i + 1);
      let alt = true;
      for (let j = 1; j < w.length; j++) {
        const cur = w[j]! - w[j - 1]!;
        const prev = j > 1 ? w[j - 1]! - w[j - 2]! : -cur;
        if (cur * prev >= 0) { alt = false; break; }
      }
      if (alt) add(i, 4, '14 puntos alternando hacia arriba y hacia abajo');
    }
  }
  return violations;
}
