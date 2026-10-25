-- Functions (buttons) and reports inside the screens built so far, so the owner can switch each one on or off per client.
-- A child is shown only while its screen is shown. Hidden = the button is not on the screen and the server refuses it.

INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order, parent_code) VALUES
  -- Order entry
  ('order.entry.copy_line',    'order', 'Functions', 'Copy previous line (dates, mode, colour)', 'function', '{view}', 101, 'order.entry'),
  ('order.entry.import_excel', 'order', 'Functions', 'Import lines from Excel',                  'function', '{view}', 102, 'order.entry'),
  ('order.entry.audit',        'order', 'Functions', 'Audit trail',                              'function', '{view}', 103, 'order.entry'),
  ('order.entry.print',        'order', 'Reports',   'Order sheet print',                        'report',   '{view}', 104, 'order.entry'),
  -- Costing
  ('order.costing.revisions',  'order', 'Functions', 'Revisions history',                        'function', '{view}', 111, 'order.costing'),
  ('order.costing.delete',     'order', 'Functions', 'Delete costing',                           'function', '{view}', 112, 'order.costing'),
  ('order.costing.print',      'order', 'Reports',   'Costing sheet print',                      'report',   '{view}', 113, 'order.costing'),
  -- BOM
  ('order.bom.from_costing',   'order', 'Functions', 'Pull from costing',                        'function', '{view}', 121, 'order.bom'),
  ('order.bom.approve',        'order', 'Functions', 'Approve / Reopen',                         'function', '{view}', 122, 'order.bom'),
  ('order.bom.print',          'order', 'Reports',   'BOM print',                                'report',   '{view}', 123, 'order.bom');

-- Clients that already have the screen keep all its functions and reports (nothing disappears today)
INSERT INTO company_features (company_id, feature_code)
SELECT cf.company_id, f.code
  FROM features f JOIN company_features cf ON cf.feature_code = f.parent_code
 WHERE f.code IN ('order.entry.copy_line', 'order.entry.import_excel', 'order.entry.audit', 'order.entry.print',
                  'order.costing.revisions', 'order.costing.delete', 'order.costing.print',
                  'order.bom.from_costing', 'order.bom.approve', 'order.bom.print')
ON CONFLICT DO NOTHING;

-- Roles that can open the screen can use its functions and reports too (admin roles get everything anyway)
INSERT INTO role_permissions (role_id, feature_code, actions)
SELECT rp.role_id, f.code, '{view}'
  FROM features f JOIN role_permissions rp ON rp.feature_code = f.parent_code AND 'view' = ANY (rp.actions)
 WHERE f.parent_code IN ('order.entry', 'order.costing', 'order.bom')
ON CONFLICT DO NOTHING;
