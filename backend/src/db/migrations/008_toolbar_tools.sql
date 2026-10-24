-- Top bar tools (Favourites, Approvals, T&A calendar, Reports, Notifications, Help) become features too,
-- so the owner can switch each one on or off per client. A tool the client does not have is not shown at all.
-- They never appear in the menu; they only decide which icons the top bar shows.

ALTER TABLE features DROP CONSTRAINT features_kind_check;
ALTER TABLE features ADD CONSTRAINT features_kind_check CHECK (kind IN ('screen', 'report', 'tool'));

INSERT INTO modules (code, name, sort_order, always_on) VALUES ('toolbar', 'Top bar tools', 8, FALSE);

INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order) VALUES
  ('tool.favourites',    'toolbar', 'Quick links', 'Favourites',    'tool', '{view}', 1),
  ('tool.approvals',     'toolbar', 'Quick links', 'Approvals',     'tool', '{view}', 2),
  ('tool.calendar',      'toolbar', 'Quick links', 'T&A calendar',  'tool', '{view}', 3),
  ('tool.reports',       'toolbar', 'Quick links', 'Reports',       'tool', '{view}', 4),
  ('tool.notifications', 'toolbar', 'Top right',   'Notifications', 'tool', '{view}', 5),
  ('tool.help',          'toolbar', 'Top right',   'Help',          'tool', '{view}', 6);

-- Clients that already exist keep every icon they see today; the owner can untick them afterwards
INSERT INTO company_modules (company_id, module_code, enabled)
SELECT id, 'toolbar', TRUE FROM companies
ON CONFLICT (company_id, module_code) DO UPDATE SET enabled = TRUE;

INSERT INTO company_features (company_id, feature_code)
SELECT c.id, f.code FROM companies c CROSS JOIN features f WHERE f.module_code = 'toolbar'
ON CONFLICT DO NOTHING;
