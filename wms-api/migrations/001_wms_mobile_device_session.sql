-- Mobile device registry, single mobile session per user, and transfer-in carton locks.
-- Run against your WMS MySQL database (same DB as tabUser).

CREATE TABLE IF NOT EXISTS wms_registered_device (
  device_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  label VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  PRIMARY KEY (device_id),
  KEY idx_wms_reg_device_status (status)
);

CREATE TABLE IF NOT EXISTS wms_mobile_session (
  jti VARCHAR(36) NOT NULL,
  user_code VARCHAR(140) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  revoked_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (jti),
  KEY idx_wms_mobile_sess_user (user_code, revoked_at),
  KEY idx_wms_mobile_sess_device (device_id)
);

CREATE TABLE IF NOT EXISTS wms_carton_lock (
  lock_key VARCHAR(512) NOT NULL,
  session_jti VARCHAR(36) NOT NULL,
  user_code VARCHAR(140) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lock_key),
  KEY idx_wms_carton_lock_session (session_jti)
);

-- Approve a device (run manually or use POST /api/auth/admin/devices/:deviceId/approve)
-- UPDATE wms_registered_device SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE device_id = 'YOUR-DEVICE-UUID';
