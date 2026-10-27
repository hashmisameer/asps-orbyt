-- Party master, more details: PAN, payment terms, credit limit, Apply GST, Hold payment (+ reason),
-- contact persons (several per party) and distance on each address.
-- Payment terms become a list in Basic masters (the separate "Payment terms" screen leaves the menu).

-- ---------- Payment terms (Basic masters) ----------
CREATE TABLE payment_terms (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,                       -- Within 60 days
  days        INT CHECK (days >= 0),               -- 60 (empty for things like "Against documents")
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_terms_company_name ON payment_terms (company_id, lower(name));

INSERT INTO payment_terms (company_id, name, days)
SELECT c.id, t.name, t.days
  FROM companies c
 CROSS JOIN (VALUES ('Advance', 0), ('Within 30 days', 30), ('Within 45 days', 45), ('Within 60 days', 60), ('Within 90 days', 90)) AS t(name, days);

-- The old "coming soon" Payment terms screen goes; it lives in Basic masters now
DELETE FROM role_permissions WHERE feature_code = 'masters.payment_terms';
DELETE FROM company_features WHERE feature_code = 'masters.payment_terms';
DELETE FROM features WHERE parent_code = 'masters.payment_terms';
DELETE FROM features WHERE code = 'masters.payment_terms';

-- ---------- Party ----------
ALTER TABLE parties
  ADD COLUMN pan             TEXT,
  ADD COLUMN payment_term_id BIGINT REFERENCES payment_terms(id),
  ADD COLUMN credit_limit    NUMERIC(14, 2) CHECK (credit_limit >= 0),
  ADD COLUMN apply_gst       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN hold_payment    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN hold_reason     TEXT;

ALTER TABLE party_addresses ADD COLUMN distance_km INT CHECK (distance_km >= 0);

-- Several contact persons per party (merchant, accounts, …)
CREATE TABLE party_contacts (
  id           BIGSERIAL PRIMARY KEY,
  party_id     BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  sort_order   INT NOT NULL,
  name         TEXT NOT NULL,
  designation  TEXT,
  phone        TEXT,
  email        TEXT
);
CREATE INDEX party_contacts_party ON party_contacts (party_id, sort_order);
