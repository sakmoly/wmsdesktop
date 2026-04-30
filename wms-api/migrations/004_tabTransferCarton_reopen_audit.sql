-- Optional audit columns for POST /api/transfer-cartons/reopen
-- (API works without these; controller sets them only if present.)
-- Run once per environment; ignore errors if columns already exist.

ALTER TABLE tabTransferCarton
  ADD COLUMN reopened_by VARCHAR(140) NULL COMMENT 'User who unsealed the TC',
  ADD COLUMN reopened_on DATETIME NULL COMMENT 'When the TC was reopened',
  ADD COLUMN reopen_reason TEXT NULL COMMENT 'Why the TC was reopened';
