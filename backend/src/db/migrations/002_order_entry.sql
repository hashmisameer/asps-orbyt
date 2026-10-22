-- Phase 2: Order entry.
-- Masters needed by the order screen (their own master screens come later),
-- a number series for order numbers, and the order tables.

-- ---------- Masters ----------
CREATE TABLE brands (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  initials    TEXT NOT NULL CHECK (initials ~ '^[A-Z0-9]{2,5}$'),  -- used in order no., e.g. NWA
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, initials)
);
CREATE UNIQUE INDEX brands_company_name ON brands (company_id, lower(name));

CREATE TABLE product_categories (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  parent_id   BIGINT REFERENCES product_categories(id),        -- empty = top level (Men), filled = sub-category (Shirts)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_categories_unique ON product_categories (company_id, COALESCE(parent_id, 0), lower(name));

CREATE TABLE styles (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  brand_id    BIGINT REFERENCES brands(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE colours (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX colours_company_name ON colours (company_id, lower(name));

CREATE TABLE size_ranges (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,                                     -- e.g. S – XXL
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX size_ranges_company_name ON size_ranges (company_id, lower(name));

CREATE TABLE size_range_sizes (
  id             BIGSERIAL PRIMARY KEY,
  size_range_id  BIGINT NOT NULL REFERENCES size_ranges(id) ON DELETE CASCADE,
  size_label     TEXT NOT NULL,                                  -- S, M, L ...
  sort_order     INT NOT NULL,
  UNIQUE (size_range_id, size_label)
);

-- ---------- Number series ----------
-- One running number per company + document type + financial year + key (brand initials for orders).
CREATE TABLE document_series (
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  doc_type     TEXT NOT NULL,                                    -- ORD
  fy_short     TEXT NOT NULL,                                    -- 26-27
  prefix_key   TEXT NOT NULL,                                    -- NWA
  last_number  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, doc_type, fy_short, prefix_key)
);

-- ---------- Orders ----------
CREATE TABLE orders (
  id                   BIGSERIAL PRIMARY KEY,
  company_id           BIGINT NOT NULL REFERENCES companies(id),
  unit_id              BIGINT REFERENCES units(id),
  brand_id             BIGINT NOT NULL REFERENCES brands(id),
  product_category_id  BIGINT NOT NULL REFERENCES product_categories(id),
  style_id             BIGINT NOT NULL REFERENCES styles(id),
  allowed_deviation    TEXT NOT NULL CHECK (allowed_deviation IN ('2', '5', 'open')),
  remarks              TEXT,
  status               TEXT NOT NULL DEFAULT 'saved',
  created_by           BIGINT REFERENCES users(id),
  updated_by           BIGINT REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_company_brand ON orders (company_id, brand_id);
CREATE INDEX orders_company_style ON orders (company_id, style_id);

CREATE TABLE order_lines (
  id               BIGSERIAL PRIMARY KEY,
  company_id       BIGINT NOT NULL REFERENCES companies(id),
  order_id         BIGINT NOT NULL REFERENCES orders(id),
  line_no          INT NOT NULL,
  order_no         TEXT NOT NULL,                                -- ORD/26-27/NWA/0001
  line_date        DATE NOT NULL,
  dispatch_mode    TEXT NOT NULL CHECK (dispatch_mode IN ('sea', 'air')),
  buyer_po_no      TEXT,                                         -- can be filled after save
  colour_id        BIGINT NOT NULL REFERENCES colours(id),
  size_range_id    BIGINT REFERENCES size_ranges(id),            -- can be picked after save
  total_qty        INT NOT NULL CHECK (total_qty > 0),
  ex_factory_date  DATE NOT NULL,
  fob_date         DATE NOT NULL,
  created_by       BIGINT REFERENCES users(id),
  updated_by       BIGINT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, order_no),
  UNIQUE (order_id, line_no),
  CHECK (ex_factory_date <= fob_date)
);
CREATE INDEX order_lines_order ON order_lines (order_id);

CREATE TABLE order_line_sizes (
  order_line_id  BIGINT NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  size_label     TEXT NOT NULL,
  qty            INT NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (order_line_id, size_label)
);
