-- Year master in Basic masters: years like "2026-27" (April 2026 – March 2027), made by the user.
-- Priority 1 shows first in every Year dropdown, then 2, 3 …; years without a priority come after, newest first.
-- Costing's Year now points to this master (year_id) instead of a plain number.

CREATE TABLE years (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL CHECK (name ~ '^[0-9]{4}-[0-9]{2}$'),   -- 2026-27
  priority    INT CHECK (priority > 0),                             -- 1 = top of the dropdown; empty = after the numbered ones
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX years_company_name ON years (company_id, name);

-- Start with the company's current financial year (priority 1) …
INSERT INTO years (company_id, name, priority)
SELECT company_id, label, 1 FROM financial_years WHERE is_current AND label ~ '^[0-9]{4}-[0-9]{2}$'
ON CONFLICT DO NOTHING;

-- … and every year already used on a costing (2026 -> 2026-27)
INSERT INTO years (company_id, name)
SELECT DISTINCT company_id, year || '-' || lpad(((year + 1) % 100)::text, 2, '0')
  FROM costings WHERE year IS NOT NULL
ON CONFLICT DO NOTHING;

-- Costing points to the year master
ALTER TABLE costings ADD COLUMN year_id BIGINT REFERENCES years(id);
UPDATE costings c SET year_id = y.id
  FROM years y
 WHERE c.year IS NOT NULL AND y.company_id = c.company_id
   AND y.name = c.year || '-' || lpad(((c.year + 1) % 100)::text, 2, '0');

-- Saved revisions keep showing their year
UPDATE costing_revisions r SET snapshot = r.snapshot || jsonb_build_object('yearId', c.year_id)
  FROM costings c
 WHERE c.id = r.costing_id AND c.year_id IS NOT NULL
   AND (r.snapshot->>'year') IS NOT NULL AND (r.snapshot->>'year') <> ''
   AND (r.snapshot->>'year')::text = c.year::text;

-- The old number column is no longer filled
ALTER TABLE costings ALTER COLUMN year DROP NOT NULL;
COMMENT ON COLUMN costings.year IS 'Old plain year (before migration 016). Use year_id.';
