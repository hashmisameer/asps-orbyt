-- BOM (bill of materials) per order line, grouped by the process the material is issued to:
-- Cutting (fabric, lining, pocketing ...), Stitching (buttons, labels, zips ...), Finishing (cartons, poly bags, hangers ...).
-- Every item carries its issue process, fixed when the item is created, so it can never land in the wrong section.

-- ---------- Issue processes (a list, so more can be added later: Embroidery, Washing ...) ----------
CREATE TABLE issue_processes (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  code        TEXT NOT NULL,                     -- cutting, stitching, finishing
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, code)
);
INSERT INTO issue_processes (company_id, code, name, sort_order)
SELECT c.id, v.code, v.name, v.sort
  FROM companies c
 CROSS JOIN (VALUES ('cutting', 'Cutting', 1), ('stitching', 'Stitching', 2), ('finishing', 'Finishing', 3)) AS v(code, name, sort);

-- Summary item sets the usual process; a detail item may override it
ALTER TABLE item_groups ADD COLUMN process_id BIGINT REFERENCES issue_processes(id);
ALTER TABLE items ADD COLUMN process_id BIGINT REFERENCES issue_processes(id);

-- Starting point for items that already exist: fabric -> cutting, trims -> stitching, packing -> finishing
UPDATE item_groups g SET process_id = p.id
  FROM issue_processes p
 WHERE p.company_id = g.company_id
   AND p.code = CASE g.item_type WHEN 'fabric' THEN 'cutting' WHEN 'trims' THEN 'stitching' ELSE 'finishing' END;

-- ---------- BOM ----------
CREATE TABLE boms (
  id             BIGSERIAL PRIMARY KEY,
  company_id     BIGINT NOT NULL REFERENCES companies(id),
  order_line_id  BIGINT NOT NULL REFERENCES order_lines(id),
  costing_id     BIGINT REFERENCES costings(id),          -- Final costing the items were taken from
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  remarks        TEXT,
  approved_by    BIGINT REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  created_by     BIGINT REFERENCES users(id),
  updated_by     BIGINT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, order_line_id)                       -- one BOM per order line
);

CREATE TABLE bom_lines (
  id             BIGSERIAL PRIMARY KEY,
  bom_id         BIGINT NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  process_id     BIGINT NOT NULL REFERENCES issue_processes(id),   -- always the item's own process
  item_id        BIGINT NOT NULL REFERENCES items(id),
  sort_order     INT NOT NULL,
  uom            TEXT NOT NULL,
  consumption    NUMERIC(14, 4) NOT NULL CHECK (consumption > 0),  -- per garment
  excess_pct     NUMERIC(7, 3) NOT NULL DEFAULT 0 CHECK (excess_pct >= 0),
  total_avg      NUMERIC(14, 4) NOT NULL,                          -- consumption + excess
  order_qty      INT NOT NULL,                                     -- pieces, from the order line
  required_qty   NUMERIC(16, 3) NOT NULL,                          -- total avg x order qty, rounded up
  costing_rate   NUMERIC(14, 4),                                   -- rupees, from the Final costing
  budgeted_rate  NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (budgeted_rate >= 0),
  supplier       TEXT,                                             -- free text until the Party master exists
  lead_days      INT CHECK (lead_days >= 0),
  from_buyer     BOOLEAN NOT NULL DEFAULT FALSE,                   -- buyer supplies this material
  UNIQUE (bom_id, item_id)
);
CREATE INDEX bom_lines_bom ON bom_lines (bom_id, process_id, sort_order);
