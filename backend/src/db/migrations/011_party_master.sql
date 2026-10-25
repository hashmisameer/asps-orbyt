-- Party master (buyers and suppliers in one place) with billing and shipping addresses,
-- plus the Country -> State -> City lists the addresses pick from.
-- The old Buyer master is merged in: every buyer becomes a party of type Buyer, and costings point to the party.

-- ---------- Places ----------
-- Countries and Indian states are the same for everyone. A client can add a state (outside India) or a city;
-- those rows carry the client's company_id and only that client sees them.
CREATE TABLE countries (
  id    BIGSERIAL PRIMARY KEY,
  code  CHAR(2) NOT NULL UNIQUE,                 -- IN, GB, US ...
  name  TEXT NOT NULL UNIQUE
);
INSERT INTO countries (code, name) VALUES
  ('AE', 'United Arab Emirates'),
  ('AF', 'Afghanistan'),
  ('AR', 'Argentina'),
  ('AT', 'Austria'),
  ('AU', 'Australia'),
  ('BD', 'Bangladesh'),
  ('BE', 'Belgium'),
  ('BG', 'Bulgaria'),
  ('BH', 'Bahrain'),
  ('BR', 'Brazil'),
  ('BT', 'Bhutan'),
  ('CA', 'Canada'),
  ('CH', 'Switzerland'),
  ('CL', 'Chile'),
  ('CN', 'China'),
  ('CO', 'Colombia'),
  ('CZ', 'Czech Republic'),
  ('DE', 'Germany'),
  ('DK', 'Denmark'),
  ('EG', 'Egypt'),
  ('ES', 'Spain'),
  ('ET', 'Ethiopia'),
  ('FI', 'Finland'),
  ('FR', 'France'),
  ('GB', 'United Kingdom'),
  ('GR', 'Greece'),
  ('HK', 'Hong Kong'),
  ('HU', 'Hungary'),
  ('ID', 'Indonesia'),
  ('IE', 'Ireland'),
  ('IL', 'Israel'),
  ('IN', 'India'),
  ('IQ', 'Iraq'),
  ('IR', 'Iran'),
  ('IS', 'Iceland'),
  ('IT', 'Italy'),
  ('JO', 'Jordan'),
  ('JP', 'Japan'),
  ('KE', 'Kenya'),
  ('KH', 'Cambodia'),
  ('KR', 'South Korea'),
  ('KW', 'Kuwait'),
  ('LK', 'Sri Lanka'),
  ('LT', 'Lithuania'),
  ('LU', 'Luxembourg'),
  ('MA', 'Morocco'),
  ('MM', 'Myanmar'),
  ('MU', 'Mauritius'),
  ('MV', 'Maldives'),
  ('MX', 'Mexico'),
  ('MY', 'Malaysia'),
  ('NG', 'Nigeria'),
  ('NL', 'Netherlands'),
  ('NO', 'Norway'),
  ('NP', 'Nepal'),
  ('NZ', 'New Zealand'),
  ('OM', 'Oman'),
  ('PE', 'Peru'),
  ('PH', 'Philippines'),
  ('PK', 'Pakistan'),
  ('PL', 'Poland'),
  ('PT', 'Portugal'),
  ('QA', 'Qatar'),
  ('RO', 'Romania'),
  ('RU', 'Russia'),
  ('SA', 'Saudi Arabia'),
  ('SE', 'Sweden'),
  ('SG', 'Singapore'),
  ('SI', 'Slovenia'),
  ('SK', 'Slovakia'),
  ('TH', 'Thailand'),
  ('TN', 'Tunisia'),
  ('TR', 'Turkey'),
  ('TW', 'Taiwan'),
  ('TZ', 'Tanzania'),
  ('UA', 'Ukraine'),
  ('US', 'United States'),
  ('UY', 'Uruguay'),
  ('VN', 'Vietnam'),
  ('ZA', 'South Africa');

CREATE TABLE states (
  id          BIGSERIAL PRIMARY KEY,
  country_id  BIGINT NOT NULL REFERENCES countries(id),
  company_id  BIGINT REFERENCES companies(id),   -- NULL = built in
  gst_code    CHAR(2),                           -- Indian states: first 2 digits of a GSTIN (09 = Uttar Pradesh)
  name        TEXT NOT NULL
);
CREATE UNIQUE INDEX states_name ON states (country_id, COALESCE(company_id, 0), lower(name));
CREATE UNIQUE INDEX states_gst ON states (gst_code) WHERE gst_code IS NOT NULL;
INSERT INTO states (country_id, gst_code, name)
SELECT c.id, v.gst, v.name FROM countries c CROSS JOIN (VALUES
  ('01', 'Jammu and Kashmir'),
  ('02', 'Himachal Pradesh'),
  ('03', 'Punjab'),
  ('04', 'Chandigarh'),
  ('05', 'Uttarakhand'),
  ('06', 'Haryana'),
  ('07', 'Delhi'),
  ('08', 'Rajasthan'),
  ('09', 'Uttar Pradesh'),
  ('10', 'Bihar'),
  ('11', 'Sikkim'),
  ('12', 'Arunachal Pradesh'),
  ('13', 'Nagaland'),
  ('14', 'Manipur'),
  ('15', 'Mizoram'),
  ('16', 'Tripura'),
  ('17', 'Meghalaya'),
  ('18', 'Assam'),
  ('19', 'West Bengal'),
  ('20', 'Jharkhand'),
  ('21', 'Odisha'),
  ('22', 'Chhattisgarh'),
  ('23', 'Madhya Pradesh'),
  ('24', 'Gujarat'),
  ('26', 'Dadra and Nagar Haveli and Daman and Diu'),
  ('27', 'Maharashtra'),
  ('29', 'Karnataka'),
  ('30', 'Goa'),
  ('31', 'Lakshadweep'),
  ('32', 'Kerala'),
  ('33', 'Tamil Nadu'),
  ('34', 'Puducherry'),
  ('35', 'Andaman and Nicobar Islands'),
  ('36', 'Telangana'),
  ('37', 'Andhra Pradesh'),
  ('38', 'Ladakh')) AS v(gst, name)
 WHERE c.code = 'IN';

CREATE TABLE cities (
  id          BIGSERIAL PRIMARY KEY,
  country_id  BIGINT NOT NULL REFERENCES countries(id),
  state_id    BIGINT REFERENCES states(id),      -- may be empty for countries without a state list
  company_id  BIGINT REFERENCES companies(id),   -- NULL = built in
  name        TEXT NOT NULL
);
CREATE UNIQUE INDEX cities_name ON cities (country_id, COALESCE(state_id, 0), COALESCE(company_id, 0), lower(name));
INSERT INTO cities (country_id, state_id, name)
SELECT s.country_id, s.id, v.name FROM states s JOIN (VALUES
  ('09', 'Noida'),
  ('09', 'Greater Noida'),
  ('09', 'Ghaziabad'),
  ('09', 'Kanpur'),
  ('09', 'Agra'),
  ('09', 'Lucknow'),
  ('07', 'New Delhi'),
  ('07', 'Delhi'),
  ('06', 'Gurugram'),
  ('06', 'Faridabad'),
  ('06', 'Panipat'),
  ('03', 'Ludhiana'),
  ('03', 'Jalandhar'),
  ('08', 'Jaipur'),
  ('08', 'Jodhpur'),
  ('27', 'Mumbai'),
  ('27', 'Thane'),
  ('27', 'Bhiwandi'),
  ('27', 'Pune'),
  ('24', 'Ahmedabad'),
  ('24', 'Surat'),
  ('29', 'Bengaluru'),
  ('33', 'Chennai'),
  ('33', 'Tiruppur'),
  ('33', 'Coimbatore'),
  ('33', 'Karur'),
  ('33', 'Erode'),
  ('32', 'Kochi'),
  ('19', 'Kolkata'),
  ('36', 'Hyderabad'),
  ('37', 'Visakhapatnam'),
  ('23', 'Indore'),
  ('30', 'Panaji')) AS v(gst, name) ON v.gst = s.gst_code;

-- ---------- Parties ----------
CREATE TABLE parties (
  id                    BIGSERIAL PRIMARY KEY,
  company_id            BIGINT NOT NULL REFERENCES companies(id),
  code                  TEXT NOT NULL,                     -- PTY-0001, given on save
  name                  TEXT NOT NULL,
  short_code            TEXT,                              -- e.g. HM
  party_type            TEXT NOT NULL CHECK (party_type IN ('buyer', 'supplier', 'both')),
  gst_code              TEXT,
  currency_id           BIGINT NOT NULL REFERENCES currencies(id),
  is_export             BOOLEAN NOT NULL DEFAULT FALSE,
  general_type_mapping  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            BIGINT REFERENCES users(id),
  updated_by            BIGINT REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE UNIQUE INDEX parties_name ON parties (company_id, lower(name));
CREATE UNIQUE INDEX parties_short_code ON parties (company_id, lower(short_code)) WHERE short_code IS NOT NULL;

CREATE TABLE party_addresses (
  id              BIGSERIAL PRIMARY KEY,
  party_id        BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  sort_order      INT NOT NULL,
  address_type    TEXT NOT NULL CHECK (address_type IN ('billing', 'shipping')),
  name            TEXT NOT NULL,                   -- party name as printed on this address
  address1        TEXT NOT NULL,
  address2        TEXT,
  address3        TEXT,
  country_id      BIGINT NOT NULL REFERENCES countries(id),
  state_id        BIGINT REFERENCES states(id),
  city_id         BIGINT REFERENCES cities(id),
  pincode         TEXT,
  phone           TEXT,
  email           TEXT,
  contact_person  TEXT,
  gst_code        TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE  -- the address other screens pick first for billing / shipping
);
CREATE INDEX party_addresses_party ON party_addresses (party_id, sort_order);
-- Only one default billing and one default shipping address per party
CREATE UNIQUE INDEX party_addresses_default ON party_addresses (party_id, address_type) WHERE is_default;

-- ---------- Old buyers become parties of type Buyer ----------
ALTER TABLE parties ADD COLUMN old_buyer_id BIGINT;
INSERT INTO parties (company_id, code, name, short_code, party_type, currency_id, is_export, is_active, old_buyer_id)
SELECT b.company_id,
       'PTY-' || lpad((row_number() OVER (PARTITION BY b.company_id ORDER BY b.id))::text, 4, '0'),
       -- two buyers with the same name keep their short code in the name, so names stay unique
       CASE WHEN count(*) OVER (PARTITION BY b.company_id, lower(b.name)) > 1 THEN b.name || ' (' || b.code || ')' ELSE b.name END,
       b.code, 'buyer',
       COALESCE(CASE WHEN COALESCE(b.country, 'India') <> 'India'
                     THEN (SELECT id FROM currencies WHERE company_id = b.company_id AND code = 'USD') END,
                (SELECT id FROM currencies WHERE company_id = b.company_id AND code = 'INR')),
       COALESCE(b.country, 'India') <> 'India', b.is_active, b.id
  FROM buyers b;
INSERT INTO document_series (company_id, doc_type, fy_short, prefix_key, last_number)
SELECT company_id, 'PTY', '-', '', COUNT(*) FROM parties GROUP BY company_id;

ALTER TABLE costings DROP CONSTRAINT costings_buyer_id_fkey;
UPDATE costings c SET buyer_id = p.id FROM parties p WHERE p.old_buyer_id = c.buyer_id AND p.company_id = c.company_id;
ALTER TABLE costings ADD CONSTRAINT costings_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES parties(id);
ALTER TABLE parties DROP COLUMN old_buyer_id;
DROP TABLE buyers;

-- The Buyer screen is replaced by Party master
DELETE FROM role_permissions WHERE feature_code = 'masters.buyer';
DELETE FROM company_features WHERE feature_code = 'masters.buyer';
DELETE FROM features WHERE code = 'masters.buyer';

-- Clients that had the Buyer screen get Party master (if they did not have it yet)
INSERT INTO company_features (company_id, feature_code)
SELECT DISTINCT cm.company_id, 'masters.party' FROM company_modules cm
 WHERE cm.module_code = 'masters' AND cm.enabled
ON CONFLICT DO NOTHING;

-- Function inside Party master (owner can switch it off per client)
INSERT INTO features (code, module_code, group_name, name, kind, actions, sort_order, parent_code)
VALUES ('masters.party.import_excel', 'masters', 'Functions', 'Import parties from Excel', 'function', '{view}', 151, 'masters.party');
INSERT INTO company_features (company_id, feature_code)
SELECT company_id, 'masters.party.import_excel' FROM company_features WHERE feature_code = 'masters.party'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, feature_code, actions)
SELECT role_id, 'masters.party.import_excel', '{view}' FROM role_permissions WHERE feature_code = 'masters.party' AND 'view' = ANY (actions)
ON CONFLICT DO NOTHING;
