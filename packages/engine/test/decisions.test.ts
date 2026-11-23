// Decisiones aprobadas (DA) que viven en el motor (documento maestro §1).
// Cada prueba demuestra el comportamiento nuevo y que lo demás queda igual.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../src/index.js';

const routes = JSON.parse(readFileSync(fileURLToPath(new URL('./golden/routes.json', import.meta.url)), 'utf8')) as any[];
const golden = (id: string) => routes.find(r => r.id === id)!;

describe('DA-01: /capability con simulate_n', () => {
  it('devuelve el n simulado', () => {
    const c = golden('cap-demo-noids');
    const r = E.analyzeCapability(c.input.process, c.input.rows, 5);
    expect(r.simulated).toBe(true);
    expect(r.simulate_n).toBe(5);
    expect(r.capability.n_subgroups).toBe(12);
    expect(r.capability.sigmaMethod).toBe('rbar_d2');
  });
  it('con 12 subgrupos de 5 secuenciales da el mismo resultado que con los ids reales', () => {
    const ids = golden('cap-demo-ids').output.body.capability;
    const sim = E.analyzeCapability(golden('cap-demo-noids').input.process, golden('cap-demo-noids').input.rows, 5).capability;
    expect(JSON.parse(JSON.stringify(sim))).toEqual(ids);
  });
  it('mantiene el mensaje de datos insuficientes', () => {
    expect(() => E.analyzeCapability({ usl: 1, lsl: 0 }, [{ value: 0.1 }, { value: 0.2 }, { value: 0.3 }], 5))
      .toThrow('Datos insuficientes: se necesitan al menos 10 mediciones para n=5 (hay 3).');
  });
});

describe('DA-16: regla «fuera de control» con límites por punto en p y u', () => {
  for (const id of ['cc-p-var', 'cc-u']) {
    it(`${id}: evalúa contra el límite de cada punto`, () => {
      const c = golden(id);
      const r = E.analyzeControlChart(c.input.process, c.input.rows, { type: c.input.query.type });
      const main = r.chartData[c.input.query.type] as E.AttributeSeries;
      const expected = main.points
        .map((p, i) => (p > main.pointLimits![i]!.ucl || p < main.pointLimits![i]!.lcl ? i : -1))
        .filter(i => i >= 0);
      const ooc = r.violations.filter(v => v.rule === 'ooc').map(v => v.index);
      expect(ooc).toEqual(expected);
      // Límites, puntos y reglas de tendencia y corrimiento: iguales a la referencia
      expect(JSON.parse(JSON.stringify(r.chartData))).toEqual(c.output.body.chartData);
      expect(r.violations.filter(v => v.rule !== 'ooc')).toEqual(c.output.body.violations.filter((v: any) => v.rule !== 'ooc'));
    });
  }
  it('con n fijo, límites por punto y promedio coinciden', () => {
    const c = golden('cc-p-fixed');
    const r = E.analyzeControlChart(c.input.process, c.input.rows, { type: 'p' });
    expect(JSON.parse(JSON.stringify(r.violations))).toEqual(c.output.body.violations);
  });
  it('un punto dentro del promedio pero fuera de su propio límite se señala', () => {
    // 9 lotes pequeños (n = 20, p = 0.20) y un lote grande (n = 400, p = 0.05):
    // p̄ = 0.0966; LCI propio del lote grande = 0.0523 > 0.05; LCI promedio = 0.0052 < 0.05.
    const subgroups = [
      ...Array.from({ length: 9 }, () => ({ value: 4, sample_size: 20 })),
      { value: 20, sample_size: 400 }
    ].map((r, i) => ({ ...r, subgroup_id: i + 1 }));
    const averageLimits = E.analyzeControlChart({}, subgroups, { type: 'p', perPointAttributeLimits: false });
    const fixed = E.analyzeControlChart({}, subgroups, { type: 'p' });
    expect(averageLimits.outOfControl).not.toContain(9);
    expect(fixed.outOfControl).toContain(9);
  });
});

describe('DA-04: muestreo manual con NAC = 0 y n > N', () => {
  it('NAC = 0 se evalúa como plan de cero defectos', () => {
    const r = E.evaluateSampling({ mode: 'manual', N: 1000, n: 50, c: 0, aql: 0.01, ltpd: 0.05 }) as E.SamplingResult;
    expect(r.c).toBe(0);
    expect(r.r).toBe(1);
    expect(r.paAql).toBeCloseTo(Math.pow(0.99, 50), 12);
  });
  it('si n supera N se trunca y se avisa', () => {
    const r = E.evaluateSampling({ mode: 'auto', N: 50, aql: 0.001, ltpd: 0.01, alpha: 0.01, beta: 0.01 }) as E.SamplingResult;
    expect(r.truncated).toBe(true);
    expect(r.n).toBe(50);
    expect(r.requiredN).toBeGreaterThan(50);
  });
  it('readNumber respeta el 0 y usa el valor por defecto en vacío', () => {
    expect(E.readNumber('0', 2, parseInt)).toBe(0);
    expect(E.readNumber('', 2, parseInt)).toBe(2);
    expect(E.readNumber('abc', 2, parseInt)).toBe(2);
  });
});

describe('DA-15: una sola Φ', () => {
  it('rachas y desempeño usan la misma Φ que el backend', () => {
    expect(E.normalCDF(0)).toBe(E.normalCDF(-0));
    expect(E.calcAlpha(3)).toBeCloseTo(0.0027, 4);
  });
});

describe('DA-22: subgrupos de más de 10 mediciones', () => {
  const rows = (sizes: number[]) => sizes.flatMap((n, g) => Array.from({ length: n }, (_, i) => ({ value: 10 + ((i * 7 + g * 3) % 5) * 0.1, subgroup_id: g + 1 })));
  const proc = { usl: 11, lsl: 9, chart_type: 'xbar_r' };
  it('se rechazan con un mensaje claro, en carta, capacidad e informe', () => {
    const msg = 'Cada subgrupo puede tener como máximo 10 mediciones; el subgrupo 2 tiene 11. Revisa los números de subgrupo de los datos.';
    expect(() => E.analyzeControlChart(proc, rows([5, 11, 5]), { type: 'xbar_r' })).toThrow(msg);
    expect(() => E.analyzeCapability(proc, rows([5, 11, 5]))).toThrow(msg);
    expect(() => E.buildReport({ ...proc, id: 'p', name: 'P', unit: null, nominal: null, n_size: null }, rows([5, 11, 5]))).toThrow(msg);
  });
  it('n simulado fuera de 2…10 se rechaza y nunca se usan constantes de otro tamaño', () => {
    expect(() => E.analyzeCapability(proc, rows([5, 5, 5, 5, 5]), 12)).toThrow('El tamaño de subgrupo simulado debe estar entre 2 y 10.');
    expect(() => E.factor(E.D2, 11)).toThrow(RangeError);
    expect(E.factor(E.D2, 10)).toBe(3.078);
  });
  it('subgrupos de hasta 10 siguen funcionando', () => {
    expect(E.analyzeControlChart(proc, rows([10, 10, 10]), { type: 'xbar_r' }).effectiveN).toBe(10);
  });
});

describe('DA-23: subgrupos de tamaños distintos', () => {
  const c = golden('cap-unequal').input;
  const groups = [...c.rows.reduce((m: Map<number, number[]>, r: any) => m.set(r.subgroup_id, [...(m.get(r.subgroup_id) ?? []), r.value]), new Map()).values()] as number[][];
  const sizes = groups.map(g => g.length);
  it('el caso de prueba tiene tamaños distintos (4 y 5)', () => { expect(new Set(sizes)).toEqual(new Set([4, 5])); });
  it('σ̂ = promedio de Rᵢ/d₂(nᵢ), cada subgrupo con su propia constante', () => {
    const sigma = groups.reduce((s, g) => s + (Math.max(...g) - Math.min(...g)) / E.D2[g.length]!, 0) / groups.length;
    expect(E.sigmaWithin(groups, 'xbar_r')).toBeCloseTo(sigma, 12);
    const sigmaS = groups.reduce((s, g) => s + E.stdDev(g) / E.C4[g.length]!, 0) / groups.length;
    expect(E.sigmaWithin(groups, 'xbar_s')).toBeCloseTo(sigmaS, 12);
    expect(E.analyzeCapability({ ...c.process, chart_type: 'xbar_r' }, c.rows).capability.sigma).toBe(E.round(sigma, 4));
  });
  it('límites por punto con el nᵢ de cada subgrupo y X̿ ponderada', () => {
    const r = E.analyzeControlChart({ chart_type: 'xbar_r' }, c.rows, { type: 'xbar_r' });
    const x = r.chartData.xbar!;
    const total = groups.reduce((s, g) => s + g.length, 0);
    const xbb = groups.reduce((s, g) => s + g.reduce((a, b) => a + b, 0), 0) / total;
    const sigma = E.sigmaWithin(groups, 'xbar_r');
    expect(x.cl).toBe(E.round(xbb, 4));
    groups.forEach((g, i) => {
      expect(x.pointLimits![i]).toEqual({ ucl: E.round(xbb + 3 * sigma / Math.sqrt(g.length), 4), lcl: E.round(xbb - 3 * sigma / Math.sqrt(g.length), 4), n: g.length });
      const d2 = E.D2[g.length]!, f = E.XBAR_R[g.length]!;
      expect(r.chartData.r!.pointLimits![i]).toEqual({ ucl: E.round(f.D4 * d2 * sigma, 4), lcl: E.round(f.D3 * d2 * sigma, 4), n: g.length });
    });
    expect(r.variableN).toBe(true);
    expect(r.effectiveN).toBe(5); // tamaño más frecuente
  });
  it('un punto fuera de su propio límite se señala aunque esté dentro del promedio', () => {
    const base = [[10, 10.2, 9.8, 10.1, 9.9], [10, 10.2, 9.8, 10.1, 9.9], [10, 10.2, 9.8, 10.1, 9.9], [10.1, 10.3, 9.9, 10.0, 10.0]];
    const small = [10.45, 10.5]; // n = 2: límites más anchos que los de n = 5
    const rows = [...base, small].flatMap((g, i) => g.map(v => ({ value: v, subgroup_id: i + 1 })));
    const r = E.analyzeControlChart({ chart_type: 'xbar_r' }, rows, { type: 'xbar_r', rules: { detectTrend: false, detectShift: false } });
    const pl = r.chartData.xbar!.pointLimits!;
    expect(pl[4]!.ucl).toBeGreaterThan(pl[0]!.ucl);
    const insideOwn = r.chartData.xbar!.points[4]! <= pl[4]!.ucl;
    expect(r.outOfControl.includes(4)).toBe(!insideOwn);
  });
  it('con tamaños iguales el cálculo no cambia (sin límites por punto)', () => {
    const d = golden('cc-demo-xbar_r');
    const r = E.analyzeControlChart({ chart_type: 'xbar_r' }, d.input.rows, { type: 'xbar_r' });
    expect(r.chartData.xbar!.pointLimits).toBeUndefined();
    expect(r.chartData.xbar!.ucl).toBe(d.output.body.chartData.xbar.ucl);
  });
});

describe('DA-24: carta de dispersión con las mismas reglas', () => {
  // n = 7: el LCI de R es D3·R̄ > 0, así que un rango muy pequeño queda por debajo
  const mk = (spread: number, g: number) => Array.from({ length: 7 }, (_, i) => ({ value: 50 + (i - 3) * spread, subgroup_id: g }));
  it('marca rangos por debajo del LCI y por encima del LCS, con su nombre', () => {
    const rows = [...Array.from({ length: 8 }, (_, g) => mk(0.5, g + 1)).flat(), ...mk(0.01, 9), ...mk(2, 10)];
    const r = E.analyzeControlChart({ chart_type: 'xbar_r' }, rows, { type: 'xbar_r', rules: { detectTrend: false, detectShift: false } });
    const R = r.chartData.r!;
    expect(R.lcl).toBeGreaterThan(0);
    expect(R.points[8]!).toBeLessThan(R.lcl);
    expect(R.points[9]!).toBeGreaterThan(R.ucl);
    expect(r.dispersionOutOfControl).toEqual([8, 9]);
    expect(r.dispersionViolations[0]!.description).toBe('Rangos (R): Punto 9 fuera de los límites de control estadístico');
  });
  it('en X̄-S se rotula como desviación estándar y las cartas por atributos no tienen dispersión', () => {
    const rows = [...Array.from({ length: 8 }, (_, g) => mk(0.5, g + 1)).flat(), ...mk(3, 9)];
    const s = E.analyzeControlChart({ chart_type: 'xbar_s' }, rows, { type: 'xbar_s' });
    expect(s.dispersionViolations.some(v => v.description.startsWith('Desviación estándar (S): '))).toBe(true);
    const p = golden('cc-p-var').input;
    expect(E.analyzeControlChart({}, p.rows, { type: 'p' }).dispersionViolations).toEqual([]);
  });
});

describe('DA-25: muestreo sin holgura sobre los riesgos pedidos', () => {
  it('la tabla de candidatos ya no lista planes que superan el α pedido', () => {
    // n = 686, c = 13 tiene α real = 1,056 % > 1 %: antes se mostraba como «cumple»
    const rows = E.candidatePlans(1000, 0.01, 0.01, 0.03, 0.05);
    expect(rows.find(r => r.c === 13 && r.n === 686)).toBeUndefined();
    for (const r of rows) { expect(r.alphaR).toBeLessThanOrEqual(0.01); expect(r.betaR).toBeLessThanOrEqual(0.05); }
  });
  it('el plan automático cumple ambos riesgos y lo indica', () => {
    const r = E.evaluateSampling({ mode: 'auto', N: 5000, aql: 0.01, ltpd: 0.05, alpha: 0.05, beta: 0.1 });
    if (!r.feasible) throw new Error('debía ser factible');
    expect(r.meetsRisks).toBe(true);
    expect(r.alphaReal).toBeLessThanOrEqual(0.05);
    expect(r.betaReal).toBeLessThanOrEqual(0.1);
  });
  it('si el n requerido supera el lote, se recorta a N y se informa si deja de cumplir', () => {
    const r = E.evaluateSampling({ mode: 'auto', N: 200, aql: 0.01, ltpd: 0.03, alpha: 0.05, beta: 0.1 });
    if (!r.feasible) throw new Error('debía ser factible');
    expect(r.truncated).toBe(true);
    expect(r.n).toBe(200);
    expect(r.meetsRisks).toBe(E.meets(r.alphaReal, 0.05) && E.meets(r.betaReal, 0.1));
    expect(r.meetsRisks).toBe(false);
  });
  it('en modo manual no se juzga contra un riesgo pedido', () => {
    const r = E.evaluateSampling({ mode: 'manual', N: 1000, aql: 0.01, ltpd: 0.05, n: 80, c: 2 });
    if (!r.feasible) throw new Error('debía ser factible');
    expect(r.meetsRisks).toBeNull();
  });
});

describe('DA-26: α exacta en cartas por atributos', () => {
  // Probabilidades calculadas aquí de forma independiente (recurrencia), sin el código del motor
  const poissonCdf = (k: number, m: number) => { let p = Math.exp(-m), s = p; for (let x = 1; x <= k; x++) { p *= m / x; s += p; } return s; };
  const binomCdf = (k: number, n: number, q: number) => { let p = Math.pow(1 - q, n), s = p; for (let x = 1; x <= k; x++) { p *= (n - x + 1) / x * q / (1 - q); s += p; } return s; };
  it('carta c: 1 − P(X ≤ ⌊LCS⌋) con X ~ Poisson(c̄) (LCI = 0)', () => {
    const cbar = 4, ucl = cbar + 3 * Math.sqrt(cbar);
    const a = E.falseAlarmProbability({ k: 3, delta: 0, n: 1, chartType: 'c', cl: cbar, ucl, lcl: 0 });
    expect(a).toBeCloseTo(1 - poissonCdf(10, 4), 12);
    expect(a).not.toBeCloseTo(E.calcAlpha(3), 4); // la aproximación normal daba 0,0027
  });
  it('carta p: conteos X = p̂·n con X ~ Binomial(n, p̄)', () => {
    const n = 50, pbar = 0.05, s = Math.sqrt(pbar * (1 - pbar) / n);
    const a = E.falseAlarmProbability({ k: 3, delta: 0, n, chartType: 'p', cl: pbar, ucl: pbar + 3 * s, lcl: 0 });
    expect(a).toBeCloseTo(1 - binomCdf(Math.floor(n * (pbar + 3 * s)), n, pbar), 12);
  });
  it('carta np y u usan la misma lógica con su escala', () => {
    const n = 100, npbar = 5, p = npbar / n, s = Math.sqrt(npbar * (1 - p));
    expect(E.falseAlarmProbability({ k: 3, delta: 0, n, chartType: 'np', cl: npbar, ucl: npbar + 3 * s, lcl: Math.max(0, npbar - 3 * s) }))
      .toBeCloseTo(1 - binomCdf(Math.floor(npbar + 3 * s), n, p), 12);
    const ubar = 2, un = 10, us = Math.sqrt(ubar / un);
    expect(E.falseAlarmProbability({ k: 3, delta: 0, n: un, chartType: 'u', cl: ubar, ucl: ubar + 3 * us, lcl: Math.max(0, ubar - 3 * us) }))
      .toBeCloseTo(1 - (poissonCdf(Math.floor((ubar + 3 * us) * un), ubar * un) - poissonCdf(Math.ceil((ubar - 3 * us) * un) - 1, ubar * un)), 12);
  });
  it('cartas por variables sin cambio y ARL₀ = 1/α en las métricas', () => {
    expect(E.falseAlarmProbability({ k: 3, delta: 1, n: 5, chartType: 'xbar_r' })).toBe(E.calcAlpha(3));
    const m = E.performanceMetrics({ k: 3, delta: 1, n: 1, chartType: 'c', cl: 4, ucl: 10, lcl: 0 }, 4, 0.01, 100);
    expect(m.alpha).toBeCloseTo(1 - poissonCdf(10, 4), 12);
    expect(m.arl0).toBeCloseTo(1 / m.alpha, 9);
  });
});
