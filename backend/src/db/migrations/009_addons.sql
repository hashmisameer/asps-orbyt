-- Finer switches and paid add-ons.
--
-- 1. A screen can now have children: functions (buttons/tabs inside it) and its own reports.
--    A child is shown only while its screen is shown.
-- 2. Anything (module, screen, function, report, tool) can be Base (part of the licence) or an Add-on with a price.
-- 3. For each client, an add-on works only while its "paid till" date has not passed.
--    Nothing runs at night to switch it off: every request compares paid till with today, so it stops on time by itself.

-- ---------- Children of a screen ----------
ALTER TABLE features DROP CONSTRAINT features_kind_check;
ALTER TABLE features ADD CONSTRAINT features_kind_check CHECK (kind IN ('screen', 'report', 'tool', 'function'));
ALTER TABLE features ADD COLUMN parent_code TEXT REFERENCES features(code);   -- e.g. order.entry.copy -> order.entry
CREATE INDEX features_parent ON features (parent_code);

-- ---------- Base or Add-on, with a default price (set in Owner > Catalogue & prices) ----------
ALTER TABLE modules
  ADD COLUMN is_addon  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN price     NUMERIC(12, 2) CHECK (price >= 0),
  ADD COLUMN price_per TEXT NOT NULL DEFAULT 'month' CHECK (price_per IN ('month', 'year'));
ALTER TABLE features
  ADD COLUMN is_addon  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN price     NUMERIC(12, 2) CHECK (price >= 0),
  ADD COLUMN price_per TEXT NOT NULL DEFAULT 'month' CHECK (price_per IN ('month', 'year'));

-- ---------- Per client: paid till, and a price only when it differs from the catalogue (a discount) ----------
ALTER TABLE company_modules
  ADD COLUMN paid_till DATE,
  ADD COLUMN price     NUMERIC(12, 2) CHECK (price >= 0);
ALTER TABLE company_features
  ADD COLUMN paid_till DATE,
  ADD COLUMN price     NUMERIC(12, 2) CHECK (price >= 0);

-- ---------- Modules as in the flowchart ----------
UPDATE modules SET name = 'Accounts' WHERE code = 'finance';
INSERT INTO modules (code, name, sort_order, always_on) VALUES
  ('sampling', 'Sampling', 2, FALSE),
  ('jobwork',  'Job work', 7, FALSE),
  ('export',   'Export',   8, FALSE),
  ('reports',  'Reports',  10, FALSE);
UPDATE modules SET sort_order = CASE code
  WHEN 'masters' THEN 1 WHEN 'sampling' THEN 2 WHEN 'order' THEN 3 WHEN 'purchase' THEN 4 WHEN 'inventory' THEN 5
  WHEN 'production' THEN 6 WHEN 'jobwork' THEN 7 WHEN 'export' THEN 8 WHEN 'finance' THEN 9 WHEN 'reports' THEN 10
  WHEN 'toolbar' THEN 11 WHEN 'admin' THEN 12 END;
UPDATE modules SET is_addon = TRUE WHERE code IN ('sampling', 'production', 'jobwork', 'export', 'finance');

-- Every client gets a row for the new modules (switched off)
INSERT INTO company_modules (company_id, module_code, enabled)
SELECT c.id, m.code, FALSE FROM companies c CROSS JOIN modules m WHERE m.code IN ('sampling', 'jobwork', 'export', 'reports')
ON CONFLICT (company_id, module_code) DO NOTHING;

-- Clients that already use a module that is now an add-on keep it until their licence date
-- (or one year from today if they have no licence date). The owner can change the date afterwards.
UPDATE company_modules cm
   SET paid_till = COALESCE(c.licence_valid_till, CURRENT_DATE + 365)
  FROM companies c, modules m
 WHERE c.id = cm.company_id AND m.code = cm.module_code AND m.is_addon AND cm.enabled AND cm.paid_till IS NULL;
