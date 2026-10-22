-- Costing: what one garment costs (fabric, trims, packing, CMT, ...) for a style or an order line.
-- Also the small masters costing needs: buyers, seasons, currencies.

-- ---------- Masters ----------
CREATE TABLE buyers (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  code        TEXT NOT NULL,                      -- short code, e.g. NXT
  name        TEXT NOT NULL,                      -- e.g. Next Retail Ltd
  country     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX buyers_company_code ON buyers (company_id, lower(code));

CREATE TABLE seasons (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,                      -- e.g. Spring Summer, Autumn Winter
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX seasons_company_name ON seasons (company_id, lower(name));

CREATE TABLE currencies (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  code         TEXT NOT NULL,                     -- INR, USD, EUR
  name         TEXT NOT NULL,
  rate_to_inr  NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (rate_to_inr > 0),   -- suggested rate; each costing keeps its own
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX currencies_company_code ON currencies (company_id, upper(code));

-- Every company starts with the common currencies; rates can be changed on the Currency screen
INSERT INTO currencies (company_id, code, name, rate_to_inr)
SELECT c.id, v.code, v.name, v.rate
  FROM companies c
 CROSS JOIN (VALUES ('INR', 'Indian rupee', 1), ('USD', 'US dollar', 84), ('EUR', 'Euro', 91), ('GBP', 'British pound', 109)) AS v(code, name, rate);

-- ---------- Costing ----------
CREATE TABLE costings (
  id               BIGSERIAL PRIMARY KEY,
  company_id       BIGINT NOT NULL REFERENCES companies(id),
  costing_no       TEXT NOT NULL,                 -- CST/26-27/0001 (format can change later)
  revision         INT NOT NULL DEFAULT 1,        -- 1 on first save, +1 on every later save
  costing_date     DATE NOT NULL,                 -- date of the latest save
  costing_type     TEXT NOT NULL CHECK (costing_type IN ('initial', 'final', 'actual')),
  description      TEXT,
  buyer_id         BIGINT NOT NULL REFERENCES buyers(id),
  style_id         BIGINT NOT NULL REFERENCES styles(id),
  order_line_id    BIGINT REFERENCES order_lines(id),   -- empty = costing for the style before an order exists
  delivery_date    DATE,
  size_range_id    BIGINT REFERENCES size_ranges(id),
  order_qty        INT NOT NULL CHECK (order_qty > 0),
  ship_mode        TEXT NOT NULL CHECK (ship_mode IN ('sea', 'air')),
  season_id        BIGINT REFERENCES seasons(id),
  year             INT CHECK (year BETWEEN 2000 AND 2100),
  colour_id        BIGINT REFERENCES colours(id),
  currency_id      BIGINT NOT NULL REFERENCES currencies(id),   -- selling currency, e.g. USD
  conversion_rate  NUMERIC(14, 4) NOT NULL CHECK (conversion_rate > 0),  -- 1 unit of that currency in rupees
  base_amount      NUMERIC(16, 4) NOT NULL DEFAULT 0,  -- cost of one garment in rupees
  total_amount     NUMERIC(18, 2) NOT NULL DEFAULT 0,  -- base amount x order qty, in rupees
  remarks          TEXT,
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by       BIGINT REFERENCES users(id),
  updated_by       BIGINT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, costing_no)
);
-- Only one live Final costing per order line, and per style when there is no order line
CREATE UNIQUE INDEX costings_one_final_per_line ON costings (company_id, order_line_id)
  WHERE costing_type = 'final' AND NOT is_deleted AND order_line_id IS NOT NULL;
CREATE UNIQUE INDEX costings_one_final_per_style ON costings (company_id, style_id)
  WHERE costing_type = 'final' AND NOT is_deleted AND order_line_id IS NULL;

-- Grid lines. One table for all eight tabs; `section` says which tab.
-- Fabric uses every column; the other tabs use a subset (see the Costing screen).
CREATE TABLE costing_lines (
  id                BIGSERIAL PRIMARY KEY,
  costing_id        BIGINT NOT NULL REFERENCES costings(id) ON DELETE CASCADE,
  section           TEXT NOT NULL CHECK (section IN ('fabric', 'trims', 'packing', 'cmt', 'value_addition', 'expenses', 'management', 'other_receivable')),
  sort_order        INT NOT NULL,
  item_type         TEXT,
  item              TEXT,
  description       TEXT,
  uom               TEXT,
  item_nature       TEXT,
  exclude_material  BOOLEAN NOT NULL DEFAULT FALSE,     -- fabric: costed, but not ordered through BOM
  cut_width         NUMERIC(12, 3),
  consumption       NUMERIC(14, 4) NOT NULL DEFAULT 0,  -- per garment (fabric: cut avg)
  wastage_pct       NUMERIC(7, 3) NOT NULL DEFAULT 0,
  avg_qty           NUMERIC(14, 4) NOT NULL DEFAULT 0,  -- consumption + wastage
  greige_rate       NUMERIC(14, 4) NOT NULL DEFAULT 0,  -- fabric only
  process_rate      NUMERIC(14, 4) NOT NULL DEFAULT 0,  -- fabric only
  rate              NUMERIC(14, 4) NOT NULL DEFAULT 0,  -- price per unit in the buying currency
  currency_id       BIGINT REFERENCES currencies(id),
  exchange_rate     NUMERIC(14, 4) NOT NULL DEFAULT 1,
  amount            NUMERIC(16, 4) NOT NULL DEFAULT 0   -- cost per garment in rupees
);
CREATE INDEX costing_lines_costing ON costing_lines (costing_id, section, sort_order);

-- A copy of the costing at every save, so older revisions can be looked at later
CREATE TABLE costing_revisions (
  costing_id  BIGINT NOT NULL REFERENCES costings(id) ON DELETE CASCADE,
  revision    INT NOT NULL,
  saved_by    BIGINT REFERENCES users(id),
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot    JSONB NOT NULL,
  PRIMARY KEY (costing_id, revision)
);

-- ---------- Screens in the catalogue ----------
UPDATE features SET sort_order = sort_order + 2 WHERE module_code = 'masters' AND sort_order >= 10;
INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order) VALUES
  ('masters.buyer',  'masters', 'Order setup', 'Buyer',  'screen', '{view,create,edit,export}', 10),
  ('masters.season', 'masters', 'Order setup', 'Season', 'screen', '{view,create,edit,export}', 11);

-- Clients with the Masters module get the two new screens; the owner can untick them
INSERT INTO company_features (company_id, feature_code)
SELECT cm.company_id, f.code
  FROM company_modules cm
  JOIN features f ON f.code IN ('masters.buyer', 'masters.season')
 WHERE cm.module_code = 'masters' AND cm.enabled
ON CONFLICT DO NOTHING;
