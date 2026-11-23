// Contratos compartidos entre la API y la web: esquemas de validación y tipos.
// Los mensajes son los literales del documento maestro §5.
import { z } from 'zod';

export const CHART_TYPES = ['xbar_r', 'xbar_s', 'p', 'np', 'c', 'u'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const CHART_LABELS: Record<ChartType, string> = {
  xbar_r: 'X̄-R', xbar_s: 'X̄-S', p: 'Carta p', np: 'Carta np', c: 'Carta c', u: 'Carta u'
};

const text = (max: number) => z.string().trim().max(max);

/** Número opcional: null o vacío → null; el 0 es válido (DA-02). */
const optionalNumber = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  z.union([z.null(), z.coerce.number().refine(n => Number.isFinite(n))])
);

export const registerSchema = z.object({
  company_name: z.string({ error: 'Todos los campos son obligatorios.' }).trim().min(1, 'Todos los campos son obligatorios.').max(200),
  name: z.string({ error: 'Todos los campos son obligatorios.' }).trim().min(1, 'Todos los campos son obligatorios.').max(150),
  email: z.string({ error: 'Todos los campos son obligatorios.' }).trim().min(1, 'Todos los campos son obligatorios.').max(200),
  password: z.string({ error: 'Todos los campos son obligatorios.' }).min(1, 'Todos los campos son obligatorios.')
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
});
export const loginSchema = z.object({
  email: z.string({ error: 'Email y contraseña son requeridos.' }).trim().min(1, 'Email y contraseña son requeridos.'),
  password: z.string({ error: 'Email y contraseña son requeridos.' }).min(1, 'Email y contraseña son requeridos.')
});
export const inviteSchema = z.object({
  name: z.string({ error: 'Nombre, email y contraseña son obligatorios.' }).trim().min(1, 'Nombre, email y contraseña son obligatorios.'),
  email: z.string({ error: 'Nombre, email y contraseña son obligatorios.' }).trim().min(1, 'Nombre, email y contraseña son obligatorios.'),
  password: z.string({ error: 'Nombre, email y contraseña son obligatorios.' }).min(1, 'Nombre, email y contraseña son obligatorios.')
    .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  role: z.enum(['admin', 'analyst'], { error: 'Rol inválido. Use: admin | analyst.' }).default('analyst')
});

/** Campos de proceso (RF-102, DA-02, DA-05). */
export const processFields = z.object({
  name: z.string({ error: 'El nombre del proceso es obligatorio.' }).trim().min(1, 'El nombre del proceso es obligatorio.').max(200),
  description: text(5000).nullish().transform(v => v || null),
  unit: text(50).nullish().transform(v => v || null),
  usl: optionalNumber,
  lsl: optionalNumber,
  nominal: optionalNumber,
  chart_type: z.enum(CHART_TYPES),
  n_size: z.preprocess(v => (v === '' || v === undefined ? null : v), z.union([z.null(), z.coerce.number().int('n debe ser un entero.')]))
});
/** Alta: nombre obligatorio; el resto opcional con sus valores por defecto. */
export const processCreateSchema = processFields.partial().required({ name: true });
/** Edición parcial (DA-02): lo que no se envía conserva su valor. */
export const processPatchSchema = processFields.partial();
export type ProcessInput = z.input<typeof processCreateSchema>;
export type ProcessValues = z.output<typeof processFields>;

/** Reglas que dependen de varios campos; se evalúan sobre el proceso ya combinado. */
export function processRuleError(p: Pick<ProcessValues, 'usl' | 'lsl' | 'chart_type' | 'n_size'>): string | null {
  if (p.usl != null && p.lsl != null && p.lsl >= p.usl) return 'LSI debe ser menor que LSE.';
  if (p.n_size != null) {
    const variable = p.chart_type === 'xbar_r' || p.chart_type === 'xbar_s';
    if (variable && (p.n_size < 2 || p.n_size > 10)) return 'n debe ser un entero entre 2 y 10.';
    if (!variable && p.n_size < 2) return 'n debe ser un entero ≥ 2.';
  }
  return null;
}

export const measurementSchema = z.object({
  process_id: z.string().uuid(),
  value: z.unknown(),
  subgroup_id: z.unknown().optional(),
  phase: z.unknown().optional(),
  sample_size: z.unknown().optional(),
  recorded_at: z.unknown().optional()
});

export interface Process {
  id: string; name: string; description: string | null; unit: string | null;
  usl: number | null; lsl: number | null; nominal: number | null;
  chart_type: ChartType; n_size: number | null; created_at: string;
  created_by_name: string | null; measurement_count?: number;
}
export interface Measurement {
  id: string; value: number; subgroup_id: number | null; phase: 1 | 2; sample_size: number | null;
  recorded_at: string; recorded_by_name: string | null;
}
export interface SessionUser { id: string; name: string; email: string; role: 'admin' | 'analyst' }
export interface SessionCompany { id: string; name: string; subscription_status: string; subscription_end_date?: string | null }
