-- Audit log for supervisor/admin "Release mobile session" actions (WMS API).
-- Applied automatically via ensureMobileSessionSchema on server startup; run manually if needed.

CREATE TABLE IF NOT EXISTS wms_mobile_session_release_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_by_user_code VARCHAR(140) NOT NULL,
  scope VARCHAR(20) NOT NULL,
  target_jti VARCHAR(36) NULL,
  target_user_code VARCHAR(140) NULL,
  target_device_id VARCHAR(64) NULL,
  reason VARCHAR(2000) NOT NULL,
  sessions_revoked INT NOT NULL DEFAULT 0,
  locks_deleted INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_wms_mob_sess_rel_created (created_at),
  KEY idx_wms_mob_sess_rel_by (released_by_user_code)
);
