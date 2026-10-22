-- Access control: what ORBYT (the owner) gives each client, and what each role may do.
--
--   Owner (super admin)  -> switches modules and features on/off per company (company_modules, company_features)
--   Client admin         -> gives roles permission on those features (role_permissions)
--   Users                -> see only what their role allows
--
-- A feature is one screen or report, e.g. 'order.entry'. New screens are added to `features`
-- by later migrations, and then show up in the owner's checkbox list.

-- ---------- Client company details kept by the owner ----------
ALTER TABLE companies
  ADD COLUMN address_line        TEXT,
  ADD COLUMN city                TEXT,
  ADD COLUMN state               TEXT,
  ADD COLUMN pin                 TEXT,
  ADD COLUMN country             TEXT DEFAULT 'India',
  ADD COLUMN contact_name        TEXT,
  ADD COLUMN contact_designation TEXT,
  ADD COLUMN contact_mobile      TEXT,
  ADD COLUMN contact_email       TEXT,
  ADD COLUMN licence_valid_till  DATE,               -- after this date the ERP is view-only
  ADD COLUMN max_users           INT NOT NULL DEFAULT 10 CHECK (max_users > 0),
  ADD COLUMN status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'));

-- ---------- Catalogue of modules and features (the same for every client) ----------
CREATE TABLE modules (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL,
  always_on   BOOLEAN NOT NULL DEFAULT FALSE      -- Admin is always on so the client can manage users
);

CREATE TABLE features (
  code         TEXT PRIMARY KEY,                  -- e.g. order.entry
  module_code  TEXT NOT NULL REFERENCES modules(code),
  group_name   TEXT NOT NULL,                     -- heading in the menu, e.g. Transactions
  name         TEXT NOT NULL,                     -- e.g. Order entry
  kind         TEXT NOT NULL CHECK (kind IN ('screen', 'report')),
  actions      TEXT[] NOT NULL,                   -- which of view/create/edit/approve/export apply
  sort_order   INT NOT NULL,
  CHECK (actions <@ ARRAY['view', 'create', 'edit', 'approve', 'export']::TEXT[] AND 'view' = ANY (actions))
);

INSERT INTO modules (code, name, sort_order, always_on) VALUES
  ('masters', 'Masters', 1, FALSE),
  ('order', 'Order', 2, FALSE),
  ('purchase', 'Purchase', 3, FALSE),
  ('inventory', 'Inventory', 4, FALSE),
  ('production', 'Production', 5, FALSE),
  ('finance', 'Finance', 6, FALSE),
  ('admin', 'Admin', 7, TRUE);

INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order) VALUES
  ('masters.party',            'masters', 'Party',         'Party master',          'screen', '{view,create,edit,export}', 1),
  ('masters.item',             'masters', 'Item',          'Item master',           'screen', '{view,create,edit,export}', 2),
  ('masters.item_group',       'masters', 'Item',          'Item group',            'screen', '{view,create,edit,export}', 3),
  ('masters.product_category', 'masters', 'Item',          'Product category',      'screen', '{view,create,edit,export}', 4),
  ('masters.uom',              'masters', 'Item',          'Unit of measure (UOM)', 'screen', '{view,create,edit,export}', 5),
  ('masters.brand',            'masters', 'Item',          'Brand',                 'screen', '{view,create,edit,export}', 6),
  ('masters.style',            'masters', 'Order setup',   'Style',                 'screen', '{view,create,edit,export}', 7),
  ('masters.size_range',       'masters', 'Order setup',   'Size range',            'screen', '{view,create,edit,export}', 8),
  ('masters.colour',           'masters', 'Order setup',   'Colour',                'screen', '{view,create,edit,export}', 9),
  ('masters.company_units',    'masters', 'Location',      'Company and units',     'screen', '{view,create,edit,export}', 10),
  ('masters.warehouse',        'masters', 'Location',      'Warehouse / location',  'screen', '{view,create,edit,export}', 11),
  ('masters.tax_hsn',          'masters', 'Tax and terms', 'Tax / HSN',             'screen', '{view,create,edit,export}', 12),
  ('masters.payment_terms',    'masters', 'Tax and terms', 'Payment terms',         'screen', '{view,create,edit,export}', 13),
  ('masters.delivery_terms',   'masters', 'Tax and terms', 'Delivery terms',        'screen', '{view,create,edit,export}', 14),
  ('masters.currency',         'masters', 'Tax and terms', 'Currency',              'screen', '{view,create,edit,export}', 15),

  ('order.entry',              'order', 'Transactions', 'Order entry',     'screen', '{view,create,edit,approve,export}', 1),
  ('order.register',           'order', 'Reports',      'Order register',  'report', '{view,export}', 2),
  ('order.pending',            'order', 'Reports',      'Pending orders',  'report', '{view,export}', 3),

  ('purchase.indent',          'purchase', 'Transactions', 'Indent',            'screen', '{view,create,edit,approve,export}', 1),
  ('purchase.po',              'purchase', 'Transactions', 'Purchase order',    'screen', '{view,create,edit,approve,export}', 2),
  ('purchase.grn',             'purchase', 'Transactions', 'GRN',               'screen', '{view,create,edit,approve,export}', 3),
  ('purchase.return',          'purchase', 'Transactions', 'Purchase return',   'screen', '{view,create,edit,approve,export}', 4),
  ('purchase.register',        'purchase', 'Reports',      'Purchase register', 'report', '{view,export}', 5),
  ('purchase.pending_po',      'purchase', 'Reports',      'Pending PO report', 'report', '{view,export}', 6),

  ('inventory.issue',          'inventory', 'Transactions', 'Material issue',  'screen', '{view,create,edit,approve,export}', 1),
  ('inventory.return',         'inventory', 'Transactions', 'Material return', 'screen', '{view,create,edit,approve,export}', 2),
  ('inventory.transfer',       'inventory', 'Transactions', 'Stock transfer',  'screen', '{view,create,edit,approve,export}', 3),
  ('inventory.stock_ledger',   'inventory', 'Reports',      'Stock ledger',    'report', '{view,export}', 4),
  ('inventory.stock_summary',  'inventory', 'Reports',      'Stock summary',   'report', '{view,export}', 5),

  ('production.entry',         'production', 'Transactions', 'Production entry', 'screen', '{view,create,edit,approve,export}', 1),

  ('finance.purchase_bill',    'finance', 'Transactions', 'Purchase bill', 'screen', '{view,create,edit,approve,export}', 1),
  ('finance.payment',          'finance', 'Transactions', 'Payment',       'screen', '{view,create,edit,approve,export}', 2),
  ('finance.receipt',          'finance', 'Transactions', 'Receipt',       'screen', '{view,create,edit,approve,export}', 3),
  ('finance.ledger',           'finance', 'Reports',      'Ledger',        'report', '{view,export}', 4),
  ('finance.gst_register',     'finance', 'Reports',      'GST register',  'report', '{view,export}', 5),

  ('admin.users',              'admin', 'Users and access', 'Users',                 'screen', '{view,create,edit}', 1),
  ('admin.roles',              'admin', 'Users and access', 'Roles and permissions', 'screen', '{view,create,edit}', 2),
  ('admin.company_settings',   'admin', 'Settings',         'Company settings',      'screen', '{view,edit}', 3),
  ('admin.number_series',      'admin', 'Settings',         'Number series',         'screen', '{view,edit}', 4);

-- ---------- What the owner has given each company ----------
-- company_modules (from 001) says which modules are on; company_features says which screens/reports inside them.
CREATE TABLE company_features (
  company_id    BIGINT NOT NULL REFERENCES companies(id),
  feature_code  TEXT NOT NULL REFERENCES features(code),
  PRIMARY KEY (company_id, feature_code)
);

-- The old 'reports' module code has no screens; reports now live inside each module.
DELETE FROM company_modules WHERE module_code NOT IN (SELECT code FROM modules);
ALTER TABLE company_modules ADD CONSTRAINT company_modules_module_fk FOREIGN KEY (module_code) REFERENCES modules(code);

-- Existing companies keep everything they had: every feature of every module that is on.
INSERT INTO company_features (company_id, feature_code)
SELECT cm.company_id, f.code
  FROM company_modules cm
  JOIN features f ON f.module_code = cm.module_code
 WHERE cm.enabled
ON CONFLICT DO NOTHING;

-- ---------- What each role may do (set by the client admin) ----------
-- Admin roles (roles.is_admin) can do everything the company has, so they need no rows here.
CREATE TABLE role_permissions (
  role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  feature_code  TEXT NOT NULL REFERENCES features(code),
  actions       TEXT[] NOT NULL,                  -- subset of the feature's actions
  PRIMARY KEY (role_id, feature_code),
  CHECK (actions <@ ARRAY['view', 'create', 'edit', 'approve', 'export']::TEXT[])
);

ALTER TABLE roles ADD COLUMN description TEXT;

-- ---------- ORBYT owner logins (super admin) ----------
-- Kept apart from client users: they belong to no company and never appear in a client's user list.
CREATE TABLE platform_admins (
  id               BIGSERIAL PRIMARY KEY,
  username         TEXT NOT NULL,
  full_name        TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts  INT NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_admins_username ON platform_admins (lower(username));

-- Owner actions are logged too (which client, what changed)
ALTER TABLE audit_log ADD COLUMN platform_admin_id BIGINT REFERENCES platform_admins(id);
