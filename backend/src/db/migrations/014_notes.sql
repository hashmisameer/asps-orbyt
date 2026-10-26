-- Notes people write on a record (the "Log note" box of the chatter on the right of a document).
-- Shown together with the record's changes from the audit log.
CREATE TABLE notes (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  entity      TEXT NOT NULL,                     -- order, costing, bom, parties, brands (same names as the audit log)
  entity_id   BIGINT NOT NULL,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notes_record ON notes (company_id, entity, entity_id, created_at DESC);
