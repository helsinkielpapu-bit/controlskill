// Pruebas contra los valores de referencia (documento maestro §8).
// test/golden/ contiene las entradas y salidas de referencia esperadas para cada caso.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../src/index.js';

const golden = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./golden/${name}.json`, import.meta.url)), 'utf8'));
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

interface RouteCase {
  id: string; route: string;
  input: { process: Record<string, unknown> | null; rows: E.MeasurementRow[]; query: Record<string, string>; body: Record<string, unknown> };
  output: { status: number; body: Record<string, unknown> };
}

/** Ejecuta el motor con la entrada de cada caso de referencia y devuelve {status, body}. */
function runNew(c: RouteCase): { status: number; body: unknown } {
  const proc = { id: 'p1', name: 'Proceso', unit: null, nominal: null, chart_type: 'xbar_r', n_size: null, ...(c.input.process ?? {}) } as E.ProcessSpec & E.ReportProcess;
  const { rows, query, body } = c.input;
  const simN = query.simulate_n ? parseInt(query.simulate_n) : null;
  try {
    switch (c.route) {
      case 'GET /capability': return { status: 200, body: { process: proc, ...E.analyzeCapability(proc, rows, simN) } };
      case 'GET /control-chart': return {
        status: 200, body: {
          process: proc, ...E.analyzeControlChart(proc, rows, {
            type: query.type ?? 'xbar_r', simulateN: simN, perPointAttributeLimits: false,
            rules: { detectOutOfControl: (query.rule_ooc ?? '1') !== '0', detectTrend: (query.rule_trend ?? '1') !== '0', detectShift: (query.rule_shift ?? '1') !== '0' }
          })
        }
      };
      case 'GET /histogram': return { status: 200, body: { process: proc, ...E.analyzeHistogram(rows, query.bins ?? 10) } };
      case 'GET /tests': return { status: 200, body: { process: proc, ...E.analyzeTests(rows) } };
      case 'POST /validate': return { status: 200, body: E.validateValues(body.values, body.subgroup_size) };
      case 'GET /report': return { status: 200, body: E.buildReport(proc, rows) };
    }
  } catch (e) {
    if (e instanceof E.AnalysisError) return { status: e.status, body: { error: e.message } };
    throw e;
  }
  throw new Error(`Ruta sin adaptador: ${c.route}`);
}

describe('rutas de análisis: iguales a la referencia', () => {
  // DA-23 reemplaza el cálculo con subgrupos de tamaños distintos; esos casos se prueban en decisions.test.ts.
  const replaced = new Set(['cap-unequal', 'cc-unequal-xbar_r', 'cc-unequal-xbar_s']);
  const cases: RouteCase[] = (golden('routes') as RouteCase[]).filter(c => !replaced.has(c.id));
  it.each(cases.map(c => [c.id, c] as const))('%s', (_id, c) => {
    const got = plain(runNew(c));
    // El objeto process lo arma la API (base de datos); no forma parte del motor.
    // dispersionViolations y dispersionOutOfControl son campos añadidos (DA-24) y se prueban en decisions.test.ts.
    const strip = (b: unknown) => {
      if (!b || typeof b !== 'object') return b;
      const { dispersionViolations: _d, dispersionOutOfControl: _o, ...rest } = b as Record<string, unknown>;
      if ('process' in rest && c.route !== 'GET /report') { const { process: _p, ...noProc } = rest; return noProc; }
      return rest;
    };
    expect({ status: got.status, body: strip(got.body) }).toEqual({ status: c.output.status, body: strip(c.output.body) });
  });
});

describe('funciones estadísticas', () => {
  const s = golden('stats');
  it('Φ(z)', () => { for (const [z, v] of s.normalCDF) expect(E.normalCDF(z)).toBe(v); });
  it('media y desviación', () => {
    for (const [a, v] of s.mean) expect(E.mean(a)).toBe(v);
    for (const [a, v] of s.stdDev) expect(E.stdDev(a)).toBe(v);
  });
  const sp = golden('special');
  it('lnΓ, P(a,x), I_x(a,b), p de χ² y de F', () => {
    for (const [x, v] of sp.gammaLn) expect(E.gammaLn(x)).toBe(v);
    for (const [a, x, v] of sp.gammaRegP) expect(E.gammaRegP(a, x)).toBe(v);
    for (const [x, a, b, v] of sp.betaRegI) expect(E.betaRegI(x, a, b)).toBe(v);
    for (const [c, df, v] of sp.chiSqP) expect(E.chiSqP(c, df)).toBe(v);
    for (const [f, a, b, v] of sp.fP) expect(E.fP(f, a, b)).toBe(v);
  });
  it('Φ⁻¹ (Q-Q)', () => { for (const [p, v] of golden('norminv')) expect(E.normInv(p)).toBe(v); });
});

describe('reglas e I-MR', () => {
  it.each((golden('rules') as { id: string }[]).map(r => [r.id, r] as const))('reglas %s', (_id, r: any) => {
    expect(plain(E.applySPCRules(r.points, r.cl, r.ucl, r.lcl))).toEqual(r.spc);
    expect(plain(E.applySPCRules(r.points, r.cl, r.ucl, r.lcl, { detectTrend: false }))).toEqual(r.spcNoTrend);
    expect(plain(E.applyNelsonRules(r.points, r.cl, r.ucl, r.lcl))).toEqual(r.nelson);
  });
  it('I-MR', () => { for (const c of golden('imr')) expect(plain(E.calculateIMR(c.values))).toEqual(c.result); });
});

describe('funciones de las páginas', () => {
  // JSON guarda NaN como null: se compara la forma serializada.
  it('parseDecimal', () => { for (const [s, v] of golden('parse')) expect(plain(E.parseDecimal(s))).toEqual(v); });
  it('prueba de rachas', () => { for (const c of golden('runs')) expect(plain(E.runsTest(c.values))).toEqual(c.result); });

  const smp = golden('sampling');
  it('Pa binomial', () => { for (const [n, c, p, v] of smp.pa) expect(E.acceptanceProbability(n, c, p)).toBe(v); });
  it('AOQ', () => { for (const [n, c, N, p, v] of smp.aoq) expect(E.aoq(n, c, N, p)).toBe(v); });
  it.each(smp.designs.map((d: any, i: number) => [i, d]))('diseño de plan %i', (_i, d: any) => {
    const { aql, alpha, ltpd, beta, N } = d.input;
    expect(plain(E.designPlan(aql, alpha, ltpd, beta))).toEqual(d.plan);
    if (d.metrics) {
      const r = E.evaluateSampling({ mode: 'auto', N, aql, ltpd, alpha, beta }) as E.SamplingResult;
      expect({ n: r.n, aoql: r.aoql, atiAql: r.atiAql, paAql: r.paAql, paLtpd: r.paLtpd }).toEqual(d.metrics);
    }
    for (const c of d.candidates) {
      const n = E.findConsumerN(c.c, ltpd, beta);
      expect(n).toBe(c.n);
      if (n) {
        expect(E.computeAOQL(n, c.c, N)).toBe(c.aoql);
        expect(E.ati(n, c.c, N, aql)).toBe(c.ati);
      }
    }
  });

  const perf = golden('performance');
  // Desempeño: Φ con z > 0 (DA-15).
  // Solo difieren en z = 0 (≈1e-9), por eso aquí se compara con tolerancia.
  it('α y β', () => {
    for (const [k, v] of perf.alpha) expect(E.calcAlpha(k)).toBeCloseTo(v, 12);
    for (const c of perf.beta) {
      const i = c.input;
      expect(E.calcBeta({ k: i.k, delta: i.delta, n: i.n, chartType: i.type, ucl: i.ucl, lcl: i.lcl, cl: i.cl })).toBeCloseTo(c.beta, 12);
    }
  });
  it('inferir n', () => { for (const c of perf.inferN) expect(E.inferNFromChart(c.input.type, c.input.main, c.input.second)).toBe(c.n); });
  it('carga muestral', () => {
    for (const c of perf.cm) {
      const i = c.input;
      const r = E.sampleLoadPlans({ k: 3, delta: i.delta, n: i.n, chartType: 'xbar_r' }, i.n, i.t, i.cmDelta, i.pnc, i.prod);
      const close = (a: any, b: any) => { for (const k of Object.keys(b)) expect(a[k]).toBeCloseTo(b[k], 9); };
      close(r.current, c.result.current); close(r.plan1, c.result.plan1); close(r.plan2, c.result.plan2);
      expect(r.targetCM).toBeCloseTo(c.result.targetCM, 12);
      expect(r.pctInc).toBe(c.result.pctInc);
      if (c.result.best) close(r.best, c.result.best); else expect(r.best).toBeNull();
    }
  });
});
