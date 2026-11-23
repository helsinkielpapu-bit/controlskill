// F-01. Constantes de cartas de control para n = 2…10 (DA-22: fuera de ese rango no se calcula).

export const D2: Readonly<Record<number, number>> = { 2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078 };
export const C4: Readonly<Record<number, number>> = { 2: 0.7979, 3: 0.8862, 4: 0.9213, 5: 0.9400, 6: 0.9515, 7: 0.9594, 8: 0.9650, 9: 0.9693, 10: 0.9727 };

export interface XbarRFactors { A2: number; D3: number; D4: number }
export interface XbarSFactors { A3: number; B3: number; B4: number }

export const XBAR_R: Readonly<Record<number, XbarRFactors>> = {
  2: { A2: 1.880, D3: 0, D4: 3.267 },
  3: { A2: 1.023, D3: 0, D4: 2.574 },
  4: { A2: 0.729, D3: 0, D4: 2.282 },
  5: { A2: 0.577, D3: 0, D4: 2.114 },
  6: { A2: 0.483, D3: 0, D4: 2.004 },
  7: { A2: 0.419, D3: 0.076, D4: 1.924 },
  8: { A2: 0.373, D3: 0.136, D4: 1.864 },
  9: { A2: 0.337, D3: 0.184, D4: 1.816 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777 }
};

export const XBAR_S: Readonly<Record<number, XbarSFactors>> = {
  2: { A3: 2.659, B3: 0, B4: 3.267 },
  3: { A3: 1.954, B3: 0, B4: 2.568 },
  4: { A3: 1.628, B3: 0, B4: 2.266 },
  5: { A3: 1.427, B3: 0, B4: 2.089 },
  6: { A3: 1.287, B3: 0.030, B4: 1.970 },
  7: { A3: 1.182, B3: 0.118, B4: 1.882 },
  8: { A3: 1.099, B3: 0.185, B4: 1.815 },
  9: { A3: 1.032, B3: 0.239, B4: 1.761 },
  10: { A3: 0.975, B3: 0.284, B4: 1.716 }
};

/** Busca la fila de n en una tabla de constantes (2 ≤ n ≤ 10). */
export function factor<T>(table: Readonly<Record<number, T>>, n: number): T {
  const row = table[n];
  // DA-22: nunca se usan constantes de otro tamaño. Los análisis validan antes 2 ≤ n ≤ 10 con un mensaje para el usuario.
  if (row === undefined) throw new RangeError(`No hay constantes de carta para n = ${n}; el tamaño de subgrupo debe estar entre 2 y 10.`);
  return row;
}

/** I-MR (F-23). */
export const IMR_E2 = 2.66;
export const IMR_D4 = 3.267;

export const CHART_TYPES = ['xbar_r', 'xbar_s', 'p', 'np', 'c', 'u'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const isChartType = (t: unknown): t is ChartType => (CHART_TYPES as readonly unknown[]).includes(t);
export const isVariableChart = (t: ChartType): t is 'xbar_r' | 'xbar_s' => t === 'xbar_r' || t === 'xbar_s';
