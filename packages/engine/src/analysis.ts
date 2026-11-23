// Análisis de alto nivel: lógica de los endpoints /analysis
// (agrupación, prioridades, mensajes de error), sin dependencias de base de datos.
// Documento maestro F-16, F-20, F-24, F-29, F-30 y RF-401…RF-407, RF-902.
import { mean, stdDev } from './stats.js';
import { D2, C4, factor, isChartType, type ChartType } from './constants.js';
import { calculateCapability, calculateCapabilityFromSubgroups, sigmaWithin, type Capability } from './capability.js';
import {
  calculateXbarR, calculateXbarS, calculatePChart, calculateNPChart, calculateCChart, calculateUChart,
  equalSizes, modalSize, type AttributeSeries, type Series
} from './charts.js';
import { applySPCRules, outOfControlIndexes, type RuleOptions, type Violation } from './rules.js';
import { runStatisticalTests, type StatisticalTests } from './tests.js';
import { generateHistogramData, normalCurvePoints, clampBins, reportBins, type Histogram } from './histogram.js';

export interface ProcessSpec {
  usl?: number | string | null; lsl?: number | string | null; nominal?: number | string | null;
  chart_type?: string | null; n_size?: number | string | null;
}
export interface MeasurementRow { value: number | string; subgroup_id?: number | null; sample_size?: number | string | null }

/** Error de análisis con el código HTTP y su mensaje. */
export class AnalysisError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'AnalysisError'; }
}
const fail = (message: string): never => { throw new AnalysisError(400, message); };
const num = (v: number | string) => parseFloat(String(v));
const hasSpecs = (p: ProcessSpec) => p.usl != null && p.lsl != null;

/** Tamaño de subgrupo más frecuente entre 2 y 10, o 0 (informe). */
export function inferSubgroupSize(rows: readonly MeasurementRow[]): number {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.subgroup_id == null) continue;
    counts.set(r.subgroup_id, (counts.get(r.subgroup_id) ?? 0) + 1);
  }
  if (counts.size === 0) return 0;
  let mode = 0, maxFreq = 0;
  for (const [, cnt] of counts) if (cnt > maxFreq) { maxFreq = cnt; mode = cnt; }
  return mode >= 2 && mode <= 10 ? mode : 0;
}

/** DA-22: ningún subgrupo puede tener más de 10 mediciones (no hay constantes de carta para n > 10). */
function checkSubgroupSizes(groups: readonly { key: unknown; values: readonly number[] }[]): void {
  // Las mediciones sin número de subgrupo no forman un subgrupo real: no se validan aquí.
  const big = groups.find(g => g.key != null && g.key !== 'default' && g.values.length > 10);
  if (big) fail(`Cada subgrupo puede tener como máximo 10 mediciones; el subgrupo ${String(big.key)} tiene ${big.values.length}. Revisa los números de subgrupo de los datos.`);
}
const checkSimulatedN = (n: number) => { if (n < 2 || n > 10) fail('El tamaño de subgrupo simulado debe estar entre 2 y 10.'); };

function sequentialGroups(values: readonly number[], n: number): number[][] {
  const groups: number[][] = [];
  const count = Math.floor(values.length / n);
  for (let g = 0; g < count; g++) groups.push(values.slice(g * n, (g + 1) * n));
  return groups;
}

// ── /capability ────────────────────────────────────────────────────────────
export interface CapabilityAnalysis { capability: Capability; simulated: boolean; simulate_n: number | null; statisticalTests: StatisticalTests | null }

/** F-16. Capacidad con su orden de prioridad. DA-01: `simulate_n` se devuelve correctamente. */
export function analyzeCapability(proc: ProcessSpec, rows: readonly MeasurementRow[], simulateN?: number | null): CapabilityAnalysis {
  if (rows.length < 2) fail('Se necesitan al menos 2 mediciones.');
  if (!hasSpecs(proc)) fail('El proceso requiere USL y LSL definidos.');
  const usl = num(proc.usl!), lsl = num(proc.lsl!);
  const values = rows.map(r => num(r.value));
  const chartType = proc.chart_type || 'xbar_r';
  let capability: Capability | null;
  let simulated = false;
  let testRows: readonly MeasurementRow[];

  if (simulateN) {
    const n = simulateN;
    checkSimulatedN(n);
    const groups = sequentialGroups(values, n);
    if (groups.length < 2) fail(`Datos insuficientes: se necesitan al menos ${n * 2} mediciones para n=${n} (hay ${values.length}).`);
    capability = calculateCapabilityFromSubgroups(groups, usl, lsl, proc.nominal, chartType);
    testRows = values.slice(0, groups.length * n).map((v, i) => ({ value: v, subgroup_id: Math.floor(i / n) + 1 }));
    simulated = true;
  } else if (rows.some(r => r.subgroup_id != null)) {
    const map = new Map<unknown, number[]>();
    rows.forEach(r => { if (!map.has(r.subgroup_id)) map.set(r.subgroup_id, []); map.get(r.subgroup_id)!.push(num(r.value)); });
    const groups = [...map.values()].filter(g => g.length >= 2);
    if (groups.length < 2) fail('Se necesitan al menos 2 subgrupos con ≥ 2 mediciones.');
    checkSubgroupSizes([...map.entries()].map(([key, values]) => ({ key, values })));
    capability = calculateCapabilityFromSubgroups(groups, usl, lsl, proc.nominal, chartType);
    testRows = rows;
  } else {
    capability = calculateCapability(values, usl, lsl, proc.nominal);
    testRows = rows;
  }
  if (!capability) fail('No se pudo calcular la capacidad (σ = 0).');
  const statisticalTests = testRows.length >= 7 ? runStatisticalTests(testRows) : null;
  return { capability: capability!, simulated, simulate_n: simulated ? simulateN! : null, statisticalTests };
}

// ── /control-chart ─────────────────────────────────────────────────────────
export interface ControlChartOptions {
  type?: string; simulateN?: number | null; rules?: RuleOptions;
  /** DA-16: en p y u la regla «fuera de control» usa el límite de cada punto. Por defecto true. */
  perPointAttributeLimits?: boolean;
}
export type ChartData = Record<string, Series | AttributeSeries>;
export interface ControlChartAnalysis {
  chartData: ChartData; violations: Violation[]; outOfControl: number[]; type: ChartType; labels: string[];
  variableN: boolean; simulated: boolean; simulate_n: number | null; effectiveN: number | null; sigmaWithin: number | null;
  /** DA-24: señales de la carta R o S (vacío en cartas por atributos). */
  dispersionViolations: Violation[]; dispersionOutOfControl: number[];
}

export const MAIN_KEY: Record<ChartType, string> = { xbar_r: 'xbar', xbar_s: 'xbar', p: 'p', np: 'np', c: 'c', u: 'u' };

function groupAttributeRows(rows: readonly MeasurementRow[]) {
  const map = new Map<unknown, MeasurementRow[]>();
  rows.forEach(r => { const k = r.subgroup_id ?? 'default'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
  return [...map.entries()];
}
const sumValues = (rs: readonly MeasurementRow[]) => rs.reduce((s, r) => s + num(r.value), 0);
const sumSizes = (rs: readonly MeasurementRow[]) => rs.reduce((s, r) => s + (r.sample_size ? num(r.sample_size) : 1), 0);

/** RF-401…RF-404. Carta de control de Fase I con la lógica completa del endpoint. */
export function analyzeControlChart(proc: ProcessSpec, rows: readonly MeasurementRow[], opts: ControlChartOptions = {}): ControlChartAnalysis {
  const type = (opts.type ?? 'xbar_r') as string;
  if (!isChartType(type)) fail('Tipo de carta inválido. Use: xbar_r, xbar_s, p, np, c, u.');
  const t = type as ChartType;
  if (rows.length < 2) fail('Se necesitan al menos 2 mediciones.');

  let chartData!: ChartData;
  let simulated = false, variableN = false;
  let effectiveN: number | null = null;
  let sgValues: number[][] | null = null;
  const labels: string[] = [];

  if (t === 'xbar_r' || t === 'xbar_s') {
    const n = opts.simulateN ?? 0;
    if (n >= 2 && n <= 10) {
      const all = rows.map(r => num(r.value));
      const groups = sequentialGroups(all, n);
      if (groups.length < 2) fail(`Insuficiente: se necesitan al menos ${n * 2} mediciones para n=${n} (hay ${all.length}).`);
      groups.forEach((_, g) => labels.push(`SG ${g + 1}`));
      chartData = t === 'xbar_r' ? calculateXbarR(groups) : calculateXbarS(groups);
      sgValues = groups; simulated = true; effectiveN = n;
    } else {
      const map = new Map<unknown, number[]>();
      rows.forEach(r => { const k = r.subgroup_id != null ? r.subgroup_id : 'default'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(num(r.value)); });
      const groups = [...map.entries()].filter(([, g]) => g.length >= 2).map(([key, values]) => ({ key, values }));
      if (groups.length < 2) fail('Se necesitan al menos 2 subgrupos con ≥ 2 mediciones.');
      checkSubgroupSizes(groups);
      groups.forEach(g => labels.push(`SG ${String(g.key)}`));
      sgValues = groups.map(g => g.values);
      chartData = t === 'xbar_r' ? calculateXbarR(sgValues) : calculateXbarS(sgValues);
      variableN = !equalSizes(sgValues);
      effectiveN = modalSize(sgValues);
    }
  } else if (t === 'p' || t === 'u') {
    const groups = groupAttributeRows(rows).map(([k, rs]) => { labels.push(`SG ${String(k)}`); return { total: sumValues(rs), n: sumSizes(rs) }; });
    if (groups.length < 2) fail(`Se necesitan al menos 2 subgrupos para la carta ${t}.`);
    chartData = t === 'p'
      ? calculatePChart(groups.map(g => ({ defectives: g.total, n: g.n })))
      : calculateUChart(groups.map(g => ({ count: g.total, n: g.n })));
    variableN = (chartData[t] as AttributeSeries).variableN;
    effectiveN = Math.round(groups.reduce((s, g) => s + g.n, 0) / groups.length);
  } else if (t === 'np') {
    let nFixed = parseInt(String(proc.n_size ?? '')) || 0;
    if (nFixed < 2) {
      const sizes = rows.filter(r => r.sample_size != null).map(r => num(r.sample_size!));
      const unique = [...new Set(sizes)];
      if (unique.length === 1 && unique[0]! >= 2) nFixed = unique[0]!;
      else if (unique.length > 1) fail(`La carta np requiere n fijo, pero las mediciones tienen tamaños distintos (${unique.join(', ')}). Verifica los datos guardados.`);
    }
    if (nFixed < 2) fail('No se pudo determinar el tamaño de muestra n. Configura n_size en el proceso o guarda datos con n fijo desde la entrada de datos.');
    const groups = groupAttributeRows(rows).map(([k, rs]) => { labels.push(`SG ${String(k)}`); return { defectives: sumValues(rs) }; });
    if (groups.length < 2) fail('Se necesitan al menos 2 subgrupos para la carta np.');
    chartData = calculateNPChart(groups, nFixed);
    effectiveN = nFixed;
  } else {
    const groups = groupAttributeRows(rows).map(([k, rs]) => { labels.push(`SG ${String(k)}`); return { count: sumValues(rs) }; });
    if (groups.length < 2) fail('Se necesitan al menos 2 subgrupos para la carta c.');
    chartData = calculateCChart(groups);
  }

  const main = chartData[MAIN_KEY[t]] as AttributeSeries;
  // Límites por punto: p y u (DA-16, activable) y X̄ con subgrupos de tamaños distintos (DA-23).
  const perPoint = t === 'p' || t === 'u' ? ((opts.perPointAttributeLimits ?? true) ? main.pointLimits : undefined) : main.pointLimits;
  const ruleOptions = {
    detectOutOfControl: opts.rules?.detectOutOfControl ?? true,
    detectTrend: opts.rules?.detectTrend ?? true,
    detectShift: opts.rules?.detectShift ?? true
  };
  const violations = applySPCRules(main.points, main.cl, main.ucl, main.lcl, ruleOptions, perPoint);

  // DA-24: la carta de dispersión (R o S) se evalúa con las mismas reglas, por encima del LCS y por debajo del LCI.
  const sec = (chartData.r ?? chartData.s) as Series | undefined;
  const secName = chartData.r ? 'Rangos (R)' : 'Desviación estándar (S)';
  const dispersionViolations = sec
    ? applySPCRules(sec.points, sec.cl, sec.ucl, sec.lcl, ruleOptions, sec.pointLimits).map(v => ({ ...v, description: `${secName}: ${v.description}` }))
    : [];

  let sigmaWithinValue: number | null = null;
  if (sgValues && hasSpecs(proc)) {
    sigmaWithinValue = calculateCapabilityFromSubgroups(sgValues, num(proc.usl!), num(proc.lsl!), proc.nominal, t)?.sigma ?? null;
  } else if (sgValues) {
    sigmaWithinValue = parseFloat(sigmaWithin(sgValues, t).toFixed(4));
  }

  return {
    chartData, violations, outOfControl: outOfControlIndexes(violations), type: t, labels,
    variableN, simulated, simulate_n: simulated ? opts.simulateN! : null, effectiveN, sigmaWithin: sigmaWithinValue,
    dispersionViolations, dispersionOutOfControl: outOfControlIndexes(dispersionViolations)
  };
}

// ── /histogram ─────────────────────────────────────────────────────────────
export function analyzeHistogram(rows: readonly MeasurementRow[], bins?: number | string) {
  if (rows.length < 3) fail('Se necesitan al menos 3 mediciones.');
  const values = rows.map(r => num(r.value));
  const histogram = generateHistogramData(values, clampBins(bins));
  const xbar = mean(values), sigma = stdDev(values);
  const normalCurve = normalCurvePoints(xbar, sigma, Math.min(...values) - sigma, Math.max(...values) + sigma, 100);
  return { histogram, normalCurve, xbar, sigma, n: values.length };
}

// ── /tests y /validate ─────────────────────────────────────────────────────
export function analyzeTests(rows: readonly MeasurementRow[]): StatisticalTests {
  if (rows.length < 7) fail(`Se necesitan al menos 7 mediciones para las pruebas estadísticas (hay ${rows.length}).`);
  return runStatisticalTests(rows);
}

export function validateValues(values: unknown, subgroupSize?: unknown): StatisticalTests {
  if (!Array.isArray(values)) fail('values debe ser un arreglo.');
  const arr = values as unknown[];
  if (arr.length < 7) fail('Se necesitan al menos 7 valores para las pruebas estadísticas.');
  if (arr.length > 2000) fail('Máximo 2000 valores por solicitud.');
  const nums = arr.map(v => parseFloat(v as string)).filter(v => !isNaN(v) && isFinite(v));
  if (nums.length < 7) fail('Se necesitan al menos 7 valores numéricos válidos.');
  const parsed = parseInt(String(subgroupSize));
  const n = subgroupSize && parsed >= 2 ? Math.min(parsed, 10) : 0;
  return runStatisticalTests(nums.map((v, i) => ({ value: v, subgroup_id: n ? Math.floor(i / n) + 1 : null })));
}

// ── /report ────────────────────────────────────────────────────────────────
export interface ReportProcess { id: string; name: string; usl: unknown; lsl: unknown; nominal: unknown; unit: unknown; chart_type?: unknown; n_size?: unknown }
export interface ReportData {
  process: { id: string; name: string; usl: unknown; lsl: unknown; nominal: unknown; unit: unknown; chartType: unknown; nSize: unknown };
  dataSummary: { n: number; mean: number | null; stdDev: number | null; min: number | null; max: number | null; range: number | null };
  controlChart?: ChartData & { outOfControl: number[]; violations: Violation[]; oocCount: number; totalSubgroups: number; summary: { ucl: number; cl: number; lcl: number; mean: number; oocRate: string } };
  capability?: Capability;
  statisticalTests?: StatisticalTests;
  histogram?: Histogram;
}

/** RF-902. Datos del informe con la lógica del endpoint (las cartas de atributos no se incluyen). */
export function buildReport(proc: ReportProcess, rows: readonly MeasurementRow[]): ReportData {
  const values = rows.map(r => num(r.value));
  const has = values.length > 0;
  const result: ReportData = {
    process: { id: proc.id, name: proc.name, usl: proc.usl, lsl: proc.lsl, nominal: proc.nominal, unit: proc.unit, chartType: proc.chart_type, nSize: proc.n_size },
    dataSummary: {
      n: values.length,
      mean: has ? mean(values) : null,
      stdDev: null,
      min: has ? Math.min(...values) : null,
      max: has ? Math.max(...values) : null,
      range: has ? Math.max(...values) - Math.min(...values) : null
    }
  };
  if (values.length < 2) return result;

  const type = (proc.chart_type as string) || 'xbar_r';
  let sgValues: number[][] | null = null;
  let chartData: ChartData | null = null;
  if (type === 'xbar_r' || type === 'xbar_s') {
    if (rows.some(r => r.subgroup_id != null)) {
      const map = new Map<unknown, number[]>();
      rows.forEach(r => { if (!map.has(r.subgroup_id)) map.set(r.subgroup_id, []); map.get(r.subgroup_id)!.push(num(r.value)); });
      checkSubgroupSizes([...map.entries()].map(([key, values]) => ({ key, values })));
      const groups = [...map.values()].filter(g => g.length >= 2);
      if (groups.length >= 2) { sgValues = groups; chartData = type === 'xbar_r' ? calculateXbarR(groups) : calculateXbarS(groups); }
    }
    if (!sgValues) {
      const n = proc.n_size ? parseInt(String(proc.n_size)) : inferSubgroupSize(rows);
      if (n >= 2 && n <= 10) {
        const groups = sequentialGroups(values, n);
        if (groups.length >= 2) { sgValues = groups; chartData = type === 'xbar_r' ? calculateXbarR(groups) : calculateXbarS(groups); }
      }
    }
    if (sgValues && sgValues.length >= 2) result.dataSummary.stdDev = parseFloat(sigmaWithin(sgValues, type).toFixed(4));
  }
  if (result.dataSummary.stdDev == null) result.dataSummary.stdDev = parseFloat(stdDev(values).toFixed(4));

  if (chartData) {
    const main = chartData[type === 'xbar_r' || type === 'xbar_s' ? 'xbar' : type];
    if (main) {
      const violations = applySPCRules(main.points, main.cl, main.ucl, main.lcl, { detectOutOfControl: true, detectTrend: true, detectShift: true }, main.pointLimits);
      const outOfControl = outOfControlIndexes(violations);
      result.controlChart = Object.assign(chartData, {
        outOfControl, violations, oocCount: outOfControl.length, totalSubgroups: main.points.length,
        summary: { ucl: main.ucl, cl: main.cl, lcl: main.lcl, mean: mean(main.points), oocRate: (outOfControl.length / main.points.length * 100).toFixed(1) }
      }) as ReportData['controlChart'];
    }
  }

  if (proc.usl != null && proc.lsl != null) {
    const capability = sgValues && sgValues.length >= 2
      ? calculateCapabilityFromSubgroups(sgValues, num(proc.usl as string), num(proc.lsl as string), proc.nominal, type)
      : calculateCapability(values, num(proc.usl as string), num(proc.lsl as string), proc.nominal);
    if (capability) { result.capability = capability; result.dataSummary.stdDev = capability.sigma; }
  }
  if (values.length >= 7) result.statisticalTests = runStatisticalTests(rows);
  if (values.length >= 3) result.histogram = generateHistogramData(values, reportBins(values.length));
  return result;
}
