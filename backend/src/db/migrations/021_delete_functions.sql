-- "Delete" in the ⚙ Action menu of each screen, switched on/off per client by the owner (like Delete costing).
-- A record can be deleted only when nothing uses it; otherwise it can be archived (Active off).
INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order, parent_code) VALUES
  ('masters.party.delete',            'masters', 'Functions', 'Delete party',            'function', '{view}', 152, 'masters.party'),
  ('masters.brand.delete',            'masters', 'Functions', 'Delete brand',            'function', '{view}', 161, 'masters.brand'),
  ('masters.item.delete',             'masters', 'Functions', 'Delete item',             'function', '{view}', 171, 'masters.item'),
  ('masters.item_group.delete',       'masters', 'Functions', 'Delete summary item',     'function', '{view}', 181, 'masters.item_group'),
  ('masters.product_category.delete', 'order',   'Functions', 'Delete style',            'function', '{view}',  91, 'masters.product_category'),
  ('order.entry.delete',              'order',   'Functions', 'Delete order no.',        'function', '{view}', 104, 'order.entry'),
  ('order.bom.delete',                'order',   'Functions', 'Delete draft BOM',        'function', '{view}', 124, 'order.bom');

-- Clients that have the screen get its Delete (the owner can switch it off)
INSERT INTO company_features (company_id, feature_code)
SELECT cf.company_id, f.code
  FROM features f JOIN company_features cf ON cf.feature_code = f.parent_code
 WHERE f.code IN ('masters.party.delete', 'masters.brand.delete', 'masters.item.delete', 'masters.item_group.delete',
                  'masters.product_category.delete', 'order.entry.delete', 'order.bom.delete')
ON CONFLICT DO NOTHING;

-- Roles that can edit the screen may delete on it (admins can do everything anyway)
INSERT INTO role_permissions (role_id, feature_code, actions)
SELECT rp.role_id, f.code, '{view}'
  FROM features f JOIN role_permissions rp ON rp.feature_code = f.parent_code AND 'edit' = ANY (rp.actions)
 WHERE f.code IN ('masters.party.delete', 'masters.brand.delete', 'masters.item.delete', 'masters.item_group.delete',
                  'masters.product_category.delete', 'order.entry.delete', 'order.bom.delete')
ON CONFLICT DO NOTHING;
