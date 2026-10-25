-- Party code and short code were the same idea: keep only the party code.
-- Old buyers got PTY-0001 ... as code and kept their short code (HM, NXT ...); their short code becomes the party code
-- (unless another party of the same client already uses that code).
UPDATE parties p SET code = upper(p.short_code)
 WHERE p.short_code IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM parties o WHERE o.company_id = p.company_id AND o.id <> p.id
                     AND (lower(o.code) = lower(p.short_code) OR lower(o.short_code) = lower(p.short_code) AND o.id < p.id));

DROP INDEX parties_short_code;
ALTER TABLE parties DROP COLUMN short_code;
-- Codes are unique whatever the letter case (HM and hm are the same code)
CREATE UNIQUE INDEX parties_code_ci ON parties (company_id, lower(code));
