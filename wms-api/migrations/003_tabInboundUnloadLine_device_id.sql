-- Optional handset id for who unloaded (mobile should send device_id on unload-line / update-status).
ALTER TABLE tabInboundUnloadLine
  ADD COLUMN device_id VARCHAR(200) NULL COMMENT 'Handset / scanner id for unload' AFTER scanned_by;
