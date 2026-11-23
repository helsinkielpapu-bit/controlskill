-- ControlSkill — esquema inicial (documento maestro §4.1)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   VARCHAR(200) NOT NULL,
  email                  VARCHAR(200) NOT NULL UNIQUE,
  subscription_status    VARCHAR(30)  NOT NULL DEFAULT 'inactive'
                         CHECK (subscription_status IN ('inactive','active','past_due','canceled')),
  subscription_end_date  TIMESTAMPTZ,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           VARCHAR(150) NOT NULL,
  email          VARCHAR(200) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin','analyst')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE processes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  unit         VARCHAR(50),
  usl          NUMERIC,
  lsl          NUMERIC,
  nominal      NUMERIC,
  chart_type   VARCHAR(20) NOT NULL DEFAULT 'xbar_r'
               CHECK (chart_type IN ('xbar_r','xbar_s','p','np','c','u')),
  n_size       SMALLINT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE measurements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id   UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  value        NUMERIC NOT NULL,
  subgroup_id  INTEGER,
  phase        SMALLINT NOT NULL DEFAULT 1 CHECK (phase IN (1,2)),
  sample_size  NUMERIC,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  seq          BIGSERIAL
);

-- Conservadas sin uso (DA-13)
CREATE TABLE control_charts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id  UUID REFERENCES processes(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  chart_type  VARCHAR(20) NOT NULL,
  cl NUMERIC, ucl NUMERIC, lcl NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE spc_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id    UUID REFERENCES processes(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  chart_type    VARCHAR(20),
  rule          VARCHAR(20),
  severity      VARCHAR(20),
  sg_index      INTEGER,
  description   TEXT,
  acknowledged  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DA-17
CREATE TABLE performance_evaluations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_id   UUID NOT NULL UNIQUE REFERENCES processes(id) ON DELETE CASCADE,
  chart_type   VARCHAR(20) NOT NULL,
  data         JSONB NOT NULL,
  saved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE monitoring_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_id      UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  chart_type      VARCHAR(20) NOT NULL,
  chart_label     VARCHAR(100),
  mode            VARCHAR(20) NOT NULL CHECK (mode IN ('industrial','academic')),
  sg_size         SMALLINT,
  subgroup_count  INTEGER NOT NULL DEFAULT 0,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_company            ON users(company_id);
CREATE INDEX idx_processes_company        ON processes(company_id);
CREATE INDEX idx_measurements_process     ON measurements(process_id);
CREATE INDEX idx_measurements_company     ON measurements(company_id);
CREATE INDEX idx_measurements_recorded    ON measurements(recorded_at);
CREATE INDEX idx_measurements_phase       ON measurements(process_id, phase);
CREATE INDEX idx_measurements_subgroup    ON measurements(process_id, phase, subgroup_id);
CREATE INDEX idx_spc_events_process       ON spc_events(process_id, created_at DESC);
CREATE INDEX idx_monitoring_sessions_co   ON monitoring_sessions(company_id, saved_at DESC);
