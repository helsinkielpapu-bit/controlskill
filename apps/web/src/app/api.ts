// Cliente HTTP: misma origen (proxy de Vite) y cookie de sesión httpOnly.
import type { Process, Measurement, SessionUser, SessionCompany, ChartType, ProcessInput } from '@controlskill/contracts';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...rest, headers, credentials: 'same-origin', body: json !== undefined ? JSON.stringify(json) : rest.body });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor. Verifica que la API esté en ejecución (npm run dev:api).');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/me')) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `Error HTTP ${res.status}`, data);
  return data as T;
}

const q = (o: Record<string, string | number | boolean | null | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString();

export const endpoints = {
  me: () => api<{ user: SessionUser; company: SessionCompany }>('/auth/me'),
  login: (email: string, password: string) => api<{ user: SessionUser; company: SessionCompany }>('/auth/login', { method: 'POST', json: { email, password } }),
  register: (body: { company_name: string; name: string; email: string; password: string }) => api<{ user: SessionUser; company: SessionCompany }>('/auth/register', { method: 'POST', json: body }),
  logout: () => api('/auth/logout', { method: 'POST', json: {} }),

  processes: () => api<Process[]>('/processes'),
  process: (id: string) => api<Process>(`/processes/${id}`),
  createProcess: (b: ProcessInput) => api<Process>('/processes', { method: 'POST', json: b }),
  updateProcess: (id: string, b: Partial<ProcessInput>) => api<Process>(`/processes/${id}`, { method: 'PATCH', json: b }),
  deleteProcess: (id: string) => api(`/processes/${id}`, { method: 'DELETE' }),

  measurements: (process_id: string, opts: { limit?: number; offset?: number; phase?: '1' | '2' | 'all' } = {}) =>
    api<{ data: Measurement[]; total: number; subgroups: number }>(`/measurements?${q({ process_id, limit: opts.limit ?? 500, offset: opts.offset ?? 0, phase: opts.phase ?? '1' })}`),
  nextSubgroup: (process_id: string, phase: 1 | 2) => api<{ next: number }>(`/measurements/next-subgroup?${q({ process_id, phase })}`),
  addMeasurements: (items: Record<string, unknown>[]) => api<{ inserted: number; data: Measurement[] }>('/measurements', { method: 'POST', json: items }),
  deleteMeasurement: (id: string) => api(`/measurements/${id}`, { method: 'DELETE' }),
  deleteMeasurements: (ids: string[]) => api<{ deleted: number; failed: number }>('/measurements/delete', { method: 'POST', json: { ids } }),
  deletePhaseTwo: (process_id: string) => api<{ deleted: number }>(`/measurements?${q({ process_id, phase: 2 })}`, { method: 'DELETE' }),

  capability: (process_id: string) => api<any>(`/analysis/capability?${q({ process_id })}`),
  controlChart: (process_id: string, type: ChartType | string, simulate_n?: number | null, rules?: { ooc: boolean; trend: boolean; shift: boolean }) =>
    api<any>(`/analysis/control-chart?${q({ process_id, type, simulate_n, rule_ooc: rules ? (rules.ooc ? 1 : 0) : null, rule_trend: rules ? (rules.trend ? 1 : 0) : null, rule_shift: rules ? (rules.shift ? 1 : 0) : null })}`),
  /** DA-27: límites de Fase I congelados (frozen = null si aún no existen) y su recálculo explícito. */
  phase1Limits: (process_id: string, type: ChartType | string) => api<{ frozen: any | null }>(`/analysis/phase1-limits?${q({ process_id, type })}`),
  freezePhase1Limits: (process_id: string, type: ChartType | string) => api<{ frozen: any }>('/analysis/phase1-limits', { method: 'POST', json: { process_id, type } }),
  histogram: (process_id: string, bins = 10) => api<any>(`/analysis/histogram?${q({ process_id, bins })}`),
  tests: (process_id: string) => api<any>(`/analysis/tests?${q({ process_id })}`),
  dashboard: () => api<any[]>('/analysis/dashboard-summary'),
  report: (process_id: string) => api<any>(`/analysis/report?${q({ process_id })}`),

  users: () => api<any[]>('/users'),
  invite: (b: Record<string, string>) => api('/users/invite', { method: 'POST', json: b }),
  deleteUser: (id: string) => api(`/users/${id}`, { method: 'DELETE' }),
  billingStatus: () => api<{ subscription_status: string; subscription_end_date: string | null }>('/billing/status'),
  activateDev: () => api<{ message: string }>('/billing/activate-dev', { method: 'POST', json: {} }),

  evaluation: (pid: string) => api<any>(`/performance/${pid}`),
  saveEvaluation: (pid: string, chart_type: string, data: Record<string, unknown>) => api<any>(`/performance/${pid}`, { method: 'PUT', json: { chart_type, data } }),
  sessions: () => api<any[]>('/monitoring/sessions'),
  saveSession: (b: Record<string, unknown>) => api<any>('/monitoring/sessions', { method: 'POST', json: b }),
  deleteSession: (id: string) => api(`/monitoring/sessions/${id}`, { method: 'DELETE' })
};
