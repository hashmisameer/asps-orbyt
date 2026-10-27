-- Basic masters: Colour, Size range, UOM, Season and Currency on one screen (masters.basic).
-- The five separate screens and the Style screen leave the menu.
-- The data tables stay as they are; only UOM gets its own table (before, UOM was free text).

-- ---------- The new screen ----------
INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order)
VALUES ('masters.basic', 'masters', 'Order setup', 'Basic masters', 'screen', '{view,create,edit,export}', 7);

-- Clients that had any of the five screens get Basic masters
INSERT INTO company_features (company_id, feature_code, paid_till)
SELECT company_id, 'masters.basic', MAX(paid_till)
  FROM company_features
 WHERE feature_code IN ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency')
 GROUP BY company_id
ON CONFLICT DO NOTHING;

-- Roles keep what they could do on any of the five screens
INSERT INTO role_permissions (role_id, feature_code, actions)
SELECT role_id, 'masters.basic', array_agg(DISTINCT a ORDER BY a)
  FROM role_permissions, unnest(actions) AS a
 WHERE feature_code IN ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency')
   AND a IN ('view', 'create', 'edit', 'export')
 GROUP BY role_id
ON CONFLICT DO NOTHING;

-- ---------- Retire the old screens (and Style) ----------
-- Functions or add-ons hanging under them go first
DELETE FROM role_permissions WHERE feature_code IN (SELECT code FROM features WHERE parent_code IN
  ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency', 'masters.style'));
DELETE FROM company_features WHERE feature_code IN (SELECT code FROM features WHERE parent_code IN
  ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency', 'masters.style'));
DELETE FROM features WHERE parent_code IN
  ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency', 'masters.style');

DELETE FROM role_permissions WHERE feature_code IN
  ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency', 'masters.style');
DELETE FROM company_features WHERE feature_code IN
  ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency', 'masters.style');
DELETE FROM features WHERE code IN
  ('masters.colour', 'masters.size_range', 'masters.uom', 'masters.season', 'masters.currency', 'masters.style');

-- ---------- UOM table ----------
CREATE TABLE uoms (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES companies(id),
  code            TEXT NOT NULL,                     -- MTR, PCS, KG
  name            TEXT NOT NULL,                     -- Metre, Pieces, Kilogram
  allow_decimals  BOOLEAN NOT NULL DEFAULT TRUE,     -- FALSE: whole numbers only (e.g. PCS)
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uoms_company_code ON uoms (company_id, upper(code));

-- Every company starts with the common units
INSERT INTO uoms (company_id, code, name, allow_decimals)
SELECT c.id, u.code, u.name, u.dec
  FROM companies c
 CROSS JOIN (VALUES ('MTR', 'Metre', TRUE), ('KG', 'Kilogram', TRUE), ('PCS', 'Pieces', FALSE), ('YDS', 'Yard', TRUE),
                    ('ROLL', 'Roll', FALSE), ('DZN', 'Dozen', FALSE), ('SET', 'Set', FALSE), ('CONE', 'Cone', FALSE)) AS u(code, name, dec);

-- …plus any unit already typed on items and summary items
INSERT INTO uoms (company_id, code, name)
SELECT DISTINCT x.company_id, upper(x.uom), upper(x.uom)
  FROM (SELECT company_id, uom FROM items UNION SELECT company_id, uom FROM item_groups) x
 WHERE x.uom IS NOT NULL AND trim(x.uom) <> ''
ON CONFLICT DO NOTHING;
