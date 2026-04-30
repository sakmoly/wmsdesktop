-- One unload row per inbound session + unit type + unit id (supports POST duplicate → 409 and ON DUPLICATE from carton status).
-- Run manually if auto-create from the API fails (e.g. existing duplicate rows in tabInboundUnloadLine).

CREATE UNIQUE INDEX uq_unload_parent_type_unit
  ON tabInboundUnloadLine (parent_title, unit_type, unit_id);

-- Optional: mobile session attribution (API inserts when column exists)
-- ALTER TABLE tabInboundUnloadLine ADD COLUMN session_jti VARCHAR(36) NULL AFTER scanned_by;
