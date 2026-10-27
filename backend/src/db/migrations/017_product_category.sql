-- Product category screen (the style master, as in BlueKaktus "Order / Product Category"):
-- one style with its Product group and Product class, Season, Year and a few optional details.
-- Product group and Product class are lists kept in Basic masters.

CREATE TABLE product_groups (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,                       -- TROUSER, SHIRT, TOP
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_groups_company_name ON product_groups (company_id, lower(name));

CREATE TABLE product_classes (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,                       -- MEN'S TROUSER
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_classes_company_name ON product_classes (company_id, lower(name));

-- Style details (code = Style no., name = Style description)
ALTER TABLE styles
  ADD COLUMN product_group_id BIGINT REFERENCES product_groups(id),
  ADD COLUMN product_class_id BIGINT REFERENCES product_classes(id),
  ADD COLUMN season_id        BIGINT REFERENCES seasons(id),
  ADD COLUMN year_id          BIGINT REFERENCES years(id),
  ADD COLUMN size_range_id    BIGINT REFERENCES size_ranges(id),
  ADD COLUMN uom_id           BIGINT REFERENCES uoms(id),
  ADD COLUMN hsn              TEXT;

-- The Product category screen now lives in the Order module, as in BlueKaktus
UPDATE features SET module_code = 'order', group_name = 'Transactions', sort_order = 0 WHERE code = 'masters.product_category';
-- Clients with the Order module get it (it was a "coming soon" master before)
INSERT INTO company_features (company_id, feature_code)
SELECT cm.company_id, 'masters.product_category' FROM company_modules cm
 WHERE cm.module_code = 'order' AND cm.enabled
ON CONFLICT DO NOTHING;
