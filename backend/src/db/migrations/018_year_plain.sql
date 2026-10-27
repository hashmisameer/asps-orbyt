-- Year master: plain years like "2026" (was "2026-27").
ALTER TABLE years DROP CONSTRAINT years_name_check;
UPDATE years SET name = left(name, 4) WHERE name ~ '^[0-9]{4}-[0-9]{2}$';
ALTER TABLE years ADD CONSTRAINT years_name_check CHECK (name ~ '^[0-9]{4}$');
