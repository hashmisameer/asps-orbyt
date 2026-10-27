-- Purchase order (PO): buy the materials of approved BOMs from a supplier.
--   HSN codes (Basic masters) give each item its GST %.
--   PO approval is a switch the owner turns on per client; then a PO above the client's limit waits for approval.

-- ---------- HSN / GST master (a tab in Basic masters) ----------
CREATE TABLE hsn_codes (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  code         TEXT NOT NULL CHECK (code ~ '^[0-9]{4,8}$'),
  description  TEXT,
  gst_rate     NUMERIC(5, 2) NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 100),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- ---------- PO approval limit per client (0 = every PO needs approval, when approval is on) ----------
ALTER TABLE companies ADD COLUMN po_approval_limit NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (po_approval_limit >= 0);

-- ---------- Purchase orders ----------
CREATE TABLE purchase_orders (
  id               BIGSERIAL PRIMARY KEY,
  company_id       BIGINT NOT NULL REFERENCES companies(id),
  unit_id          BIGINT REFERENCES units(id),                 -- ship to
  po_no            TEXT NOT NULL,                               -- PO/26-27/0001
  po_date          DATE NOT NULL,
  supplier_id      BIGINT NOT NULL REFERENCES parties(id),
  bill_address_id  BIGINT REFERENCES party_addresses(id) ON DELETE SET NULL,
  currency_id      BIGINT NOT NULL REFERENCES currencies(id),
  conversion_rate  NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (conversion_rate > 0),   -- 1 unit of the currency in rupees
  payment_term_id  BIGINT REFERENCES payment_terms(id),
  dispatch_mode    TEXT,                                        -- By sea, By air, By road, Courier, By hand
  delivery_terms   TEXT,                                        -- Ex-works, FOR, FOB, CIF, ...
  delivery_date    DATE,                                        -- default for the lines
  vendor_pi        TEXT,                                        -- supplier's proforma invoice no.
  remarks          TEXT,
  gst_type         TEXT NOT NULL CHECK (gst_type IN ('intra', 'inter', 'import')),   -- CGST+SGST / IGST / no GST (import)
  -- pending = waiting for approval, open = confirmed, rejected = sent back, cancelled
  status           TEXT NOT NULL CHECK (status IN ('pending', 'open', 'rejected', 'cancelled')),
  taxable_amount   NUMERIC(16, 2) NOT NULL DEFAULT 0,           -- in the PO currency
  tax_amount       NUMERIC(16, 2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(16, 2) NOT NULL DEFAULT 0,
  approved_by      BIGINT REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  reject_reason    TEXT,
  cancel_reason    TEXT,
  created_by       BIGINT REFERENCES users(id),
  updated_by       BIGINT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, po_no)
);
CREATE INDEX purchase_orders_supplier ON purchase_orders (company_id, supplier_id);

CREATE TABLE purchase_order_lines (
  id              BIGSERIAL PRIMARY KEY,
  po_id           BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sort_order      INT NOT NULL,
  order_line_id   BIGINT REFERENCES order_lines(id),            -- the order no. it is bought for; empty = general item
  item_id         BIGINT NOT NULL REFERENCES items(id),
  uom             TEXT NOT NULL,
  hsn             TEXT,
  qty             NUMERIC(16, 3) NOT NULL CHECK (qty > 0),      -- counts against the BOM balance
  moq_extra_qty   NUMERIC(16, 3) NOT NULL DEFAULT 0 CHECK (moq_extra_qty >= 0),   -- extra only because of the supplier's minimum
  rate            NUMERIC(14, 4) NOT NULL CHECK (rate >= 0),    -- in the PO currency
  discount_pct    NUMERIC(6, 3) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  gst_rate        NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  amount          NUMERIC(16, 2) NOT NULL,                      -- (qty + MOQ extra) x rate less discount
  tax_amount      NUMERIC(16, 2) NOT NULL,
  delivery_date   DATE,
  remarks         TEXT
);
CREATE INDEX purchase_order_lines_bom ON purchase_order_lines (order_line_id, item_id);

-- ---------- Screens and functions ----------
INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order, parent_code) VALUES
  ('purchase.po.approval', 'purchase', 'Functions', 'PO needs approval (above the client''s limit)', 'function', '{view}', 21, 'purchase.po'),
  ('purchase.po.delete',   'purchase', 'Functions', 'Delete PO',                                     'function', '{view}', 22, 'purchase.po')
ON CONFLICT (code) DO NOTHING;

-- Clients with Purchase get the PO screen; Delete comes with it. Approval stays off until the owner turns it on.
INSERT INTO company_features (company_id, feature_code)
SELECT cm.company_id, 'purchase.po' FROM company_modules cm WHERE cm.module_code = 'purchase' AND cm.enabled
ON CONFLICT DO NOTHING;
INSERT INTO company_features (company_id, feature_code)
SELECT cf.company_id, 'purchase.po.delete' FROM company_features cf WHERE cf.feature_code = 'purchase.po'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, feature_code, actions)
SELECT rp.role_id, 'purchase.po.delete', '{view}' FROM role_permissions rp
 WHERE rp.feature_code = 'purchase.po' AND 'edit' = ANY (rp.actions)
ON CONFLICT DO NOTHING;
