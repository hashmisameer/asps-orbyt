-- Order module: add Costing and BOM (bill of materials) screens.
-- Screens are only listed here; they open as "soon" until they are built.

-- Make room: reports move below the new screens
UPDATE features SET sort_order = 4 WHERE code = 'order.register';
UPDATE features SET sort_order = 5 WHERE code = 'order.pending';

INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order) VALUES
  ('order.costing', 'order', 'Transactions', 'Costing',                 'screen', '{view,create,edit,approve,export}', 2),
  ('order.bom',     'order', 'Transactions', 'BOM (bill of materials)', 'screen', '{view,create,edit,approve,export}', 3);

-- Clients that already have the Order module get the new screens too; the owner can untick them.
INSERT INTO company_features (company_id, feature_code)
SELECT cm.company_id, f.code
  FROM company_modules cm
  JOIN features f ON f.code IN ('order.costing', 'order.bom')
 WHERE cm.module_code = 'order' AND cm.enabled
ON CONFLICT DO NOTHING;
