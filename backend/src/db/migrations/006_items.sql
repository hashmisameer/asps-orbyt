-- Items: Item type (fabric / trims / packing) -> Summary item (group) -> Detail item.
-- Costing lines can point at a summary item or a detail item.

CREATE TABLE item_groups (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  item_type   TEXT NOT NULL CHECK (item_type IN ('fabric', 'trims', 'packing')),
  name        TEXT NOT NULL,                       -- summary item, e.g. EXPORT PURCHASE FABRIC
  uom         TEXT,                                -- usual unit, e.g. MTR
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX item_groups_company_name ON item_groups (company_id, item_type, lower(name));

CREATE TABLE items (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  group_id     BIGINT NOT NULL REFERENCES item_groups(id),
  code         TEXT,                               -- optional item code
  name         TEXT NOT NULL,                      -- detail item, e.g. AS/ALGARVE/NAVY
  uom          TEXT NOT NULL,
  item_nature  TEXT,                               -- Main, Contrast, Lining, ...
  hsn          TEXT,
  width        NUMERIC(10, 2),                     -- fabric width
  gsm          NUMERIC(10, 2),
  composition  TEXT,                               -- e.g. 100% cotton
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX items_company_name ON items (company_id, lower(name));
CREATE UNIQUE INDEX items_company_code ON items (company_id, lower(code)) WHERE code IS NOT NULL;
CREATE INDEX items_group ON items (group_id);

-- Costing lines remember which summary/detail item they came from (the name is kept too)
ALTER TABLE costing_lines
  ADD COLUMN item_id BIGINT REFERENCES items(id),
  ADD COLUMN item_group_id BIGINT REFERENCES item_groups(id);

-- Menu names: "Item group" holds summary items, "Item master" holds detail items
UPDATE features SET name = 'Item group (summary items)' WHERE code = 'masters.item_group';
UPDATE features SET name = 'Item master (detail items)' WHERE code = 'masters.item';
