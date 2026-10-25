-- Brand master: brand code (used in the order no., e.g. ORD/26-27/NWA/0001), brand name, the buyer it belongs to,
-- currency, export flag. The screen moves from the Item group to the Party group of the Masters menu.
ALTER TABLE brands
  ADD COLUMN buyer_id    BIGINT REFERENCES parties(id),      -- Party master, type Buyer or Both (asked for on every save)
  ADD COLUMN currency_id BIGINT REFERENCES currencies(id),
  ADD COLUMN is_export   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN created_by  BIGINT REFERENCES users(id),
  ADD COLUMN updated_by  BIGINT REFERENCES users(id),
  ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE features SET sort_order = 0 WHERE code = 'masters.party';
UPDATE features SET group_name = 'Party', name = 'Brand master', sort_order = 1 WHERE code = 'masters.brand';

-- Clients that have Party master get Brand master too (brands are needed for order numbers)
INSERT INTO company_features (company_id, feature_code)
SELECT company_id, 'masters.brand' FROM company_features WHERE feature_code = 'masters.party'
ON CONFLICT DO NOTHING;
