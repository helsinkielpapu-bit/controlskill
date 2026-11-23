-- DA-27: límites de Fase I congelados por proceso y tipo de carta.
-- La Fase II se evalúa siempre contra estos límites hasta que alguien los recalcule de forma explícita.
CREATE TABLE phase1_limits (
  process_id   UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chart_type   VARCHAR(20) NOT NULL,
  data         JSONB NOT NULL,        -- resultado completo de la carta de Fase I al congelar
  fingerprint  TEXT NOT NULL,         -- huella de las mediciones de Fase I usadas (detecta cambios posteriores)
  frozen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (process_id, chart_type)
);
