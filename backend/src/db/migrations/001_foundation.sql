-- ORBYT foundation tables.
-- Every business table carries company_id so one ORBYT install can serve many companies,
-- and one company's data never mixes with another's.

CREATE TABLE companies (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,            -- short code, e.g. ASPS
  name         TEXT NOT NULL,                   -- shown in the top bar
  legal_name   TEXT,
  gstin        TEXT,
  logo_url     TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Units / branches of a company (Noida unit 1, warehouse, ...)
CREATE TABLE units (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- Financial years, e.g. 2026-27 (used in document numbers like ORD/26-27/...)
CREATE TABLE financial_years (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  label        TEXT NOT NULL,                   -- 2026-27
  short_label  TEXT NOT NULL,                   -- 26-27
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  is_current   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, label),
  CHECK (end_date > start_date)
);

-- Which modules a company has switched on (Masters, Order, Purchase, ...)
CREATE TABLE company_modules (
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  module_code  TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (company_id, module_code)
);

CREATE TABLE roles (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  name         TEXT NOT NULL,                   -- Admin, Merchandiser, Store keeper ...
  is_admin     BOOLEAN NOT NULL DEFAULT FALSE,  -- admins can see every screen
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE users (
  id               BIGSERIAL PRIMARY KEY,
  company_id       BIGINT NOT NULL REFERENCES companies(id),
  role_id          BIGINT NOT NULL REFERENCES roles(id),
  default_unit_id  BIGINT REFERENCES units(id),
  username         TEXT NOT NULL,
  email            TEXT,
  full_name        TEXT NOT NULL,
  designation      TEXT,
  password_hash    TEXT NOT NULL,               -- never the plain password
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts  INT NOT NULL DEFAULT 0,      -- account locks after 5 wrong tries
  locked_until     TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_company_username ON users (company_id, lower(username));
CREATE UNIQUE INDEX users_company_email ON users (company_id, lower(email)) WHERE email IS NOT NULL;

-- Who did what and when, for every important action
CREATE TABLE audit_log (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT REFERENCES companies(id),
  user_id      BIGINT REFERENCES users(id),
  action       TEXT NOT NULL,                   -- e.g. LOGIN, LOGIN_FAILED, CREATE, UPDATE
  entity       TEXT,                            -- e.g. order
  entity_id    TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_company_time ON audit_log (company_id, created_at DESC);
