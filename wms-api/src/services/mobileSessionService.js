// wms-api/src/services/mobileSessionService.js
// Device registry, single concurrent mobile session per user, carton locks for transfer-in.

import { getConnection } from '../db/connection.js';
import { logger } from '../utils/logger.js';

let schemaEnsured = false;

export function isAutoApproveDevices() {
  const v = process.env.WMS_AUTO_APPROVE_DEVICES;
  return v === '1' || v === 'true' || v === 'yes';
}

export function isAdminUser(user) {
  if (!user) return false;
  const code = String(user.user_code || user.user_id || '').toLowerCase();
  if (code === 'sysadmin' || code === 'administrator') return true;
  const role = String(user.role || '').toLowerCase();
  return role.includes('admin') || role.includes('system');
}

/** Admin or supervisor — used for mobile session list / release (not device registry). */
export function isSupervisorOrAdminUser(user) {
  if (isAdminUser(user)) return true;
  const role = String(user?.role || '').toLowerCase();
  return role.includes('supervisor');
}

/**
 * Creates tables if missing (idempotent). Call once at server startup.
 */
export async function ensureMobileSessionSchema() {
  if (schemaEnsured) return;
  const connection = await getConnection();
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wms_registered_device (
        device_id VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        label VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP NULL,
        PRIMARY KEY (device_id),
        KEY idx_wms_reg_device_status (status)
      )
    `);
    // expires_at as DATETIME (not TIMESTAMP) — avoids ER_INVALID_DEFAULT on MySQL 5.7
    // when a second TIMESTAMP column has no valid implicit default under strict sql_mode.
    await connection.execute(`
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
      )
    `);
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wms_carton_lock (
        lock_key VARCHAR(512) NOT NULL,
        session_jti VARCHAR(36) NOT NULL,
        user_code VARCHAR(140) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (lock_key),
        KEY idx_wms_carton_lock_session (session_jti)
      )
    `);
    await connection.execute(`
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
      )
    `);
    schemaEnsured = true;
    logger.info('mobileSessionService: schema ensured (wms_registered_device, wms_mobile_session, wms_carton_lock, wms_mobile_session_release_audit)');
  } catch (e) {
    logger.error('mobileSessionService: ensureMobileSessionSchema failed', e);
    throw e;
  } finally {
    connection.release();
  }
}

/**
 * @returns {'pending'|'approved'|'disabled'|null} null if row missing (treated as pending after upsert)
 */
export async function getDeviceStatus(connection, deviceId) {
  const [rows] = await connection.execute(
    `SELECT status FROM wms_registered_device WHERE device_id = ? LIMIT 1`,
    [deviceId]
  );
  if (!rows.length) return null;
  return rows[0].status;
}

export async function upsertDevicePending(connection, deviceId, label = null) {
  await connection.execute(
    `INSERT INTO wms_registered_device (device_id, status, label)
     VALUES (?, 'pending', ?)
     ON DUPLICATE KEY UPDATE device_id = device_id`,
    [deviceId, label]
  );
  if (isAutoApproveDevices()) {
    await connection.execute(
      `UPDATE wms_registered_device SET status = 'approved', approved_at = CURRENT_TIMESTAMP
       WHERE device_id = ? AND status = 'pending'`,
      [deviceId]
    );
    return 'approved';
  }
  const [rows] = await connection.execute(
    `SELECT status FROM wms_registered_device WHERE device_id = ?`,
    [deviceId]
  );
  return rows[0]?.status || 'pending';
}

export async function approveDeviceById(connection, deviceId) {
  const [r] = await connection.execute(
    `UPDATE wms_registered_device SET status = 'approved', approved_at = CURRENT_TIMESTAMP
     WHERE device_id = ? AND status IN ('pending', 'disabled')`,
    [deviceId]
  );
  return r.affectedRows > 0;
}

export async function disableDeviceById(connection, deviceId) {
  await connection.execute(
    `UPDATE wms_registered_device SET status = 'disabled' WHERE device_id = ?`,
    [deviceId]
  );
  await revokeAllSessionsForDevice(connection, deviceId);
}

/** Remove device row; revokes sessions and carton locks for that device first. */
export async function deleteRegisteredDeviceById(connection, deviceId) {
  await revokeAllSessionsForDevice(connection, deviceId);
  const [r] = await connection.execute(
    `DELETE FROM wms_registered_device WHERE device_id = ?`,
    [deviceId]
  );
  return r.affectedRows > 0;
}

/**
 * Active mobile session for user (not revoked, not expired).
 * @returns {Promise<{ device_id: string }|null>}
 */
export async function getActiveMobileSessionForUser(connection, userCode) {
  const [rows] = await connection.execute(
    `SELECT device_id FROM wms_mobile_session
     WHERE user_code = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [userCode]
  );
  return rows.length ? rows[0] : null;
}

export async function revokeAllSessionsForUser(connection, userCode) {
  const [jtis] = await connection.execute(
    `SELECT jti FROM wms_mobile_session WHERE user_code = ? AND revoked_at IS NULL`,
    [userCode]
  );
  for (const row of jtis) {
    await releaseCartonLocksForSession(connection, row.jti);
  }
  await connection.execute(
    `UPDATE wms_mobile_session SET revoked_at = UTC_TIMESTAMP()
     WHERE user_code = ? AND revoked_at IS NULL`,
    [userCode]
  );
}

export async function revokeAllSessionsForDevice(connection, deviceId) {
  const [jtis] = await connection.execute(
    `SELECT jti FROM wms_mobile_session WHERE device_id = ? AND revoked_at IS NULL`,
    [deviceId]
  );
  for (const row of jtis) {
    await releaseCartonLocksForSession(connection, row.jti);
  }
  await connection.execute(
    `UPDATE wms_mobile_session SET revoked_at = UTC_TIMESTAMP()
     WHERE device_id = ? AND revoked_at IS NULL`,
    [deviceId]
  );
}

/**
 * @param {{ jti: string, userCode: string, deviceId: string, expUnix?: number, expiresAt?: Date }} row
 * Prefer expUnix (JWT exp) so DB uses FROM_UNIXTIME (UTC-consistent with UTC_TIMESTAMP()).
 */
export async function insertMobileSession(connection, { jti, userCode, deviceId, expUnix, expiresAt }) {
  if (expUnix != null) {
    await connection.execute(
      `INSERT INTO wms_mobile_session (jti, user_code, device_id, expires_at)
       VALUES (?, ?, ?, FROM_UNIXTIME(?))`,
      [jti, userCode, deviceId, expUnix]
    );
  } else {
    await connection.execute(
      `INSERT INTO wms_mobile_session (jti, user_code, device_id, expires_at)
       VALUES (?, ?, ?, ?)`,
      [jti, userCode, deviceId, expiresAt]
    );
  }
}

export async function revokeSessionByJti(connection, jti) {
  await connection.execute(
    `UPDATE wms_mobile_session SET revoked_at = UTC_TIMESTAMP() WHERE jti = ? AND revoked_at IS NULL`,
    [jti]
  );
  await releaseCartonLocksForSession(connection, jti);
}

export async function isMobileSessionActive(connection, jti) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM wms_mobile_session
     WHERE jti = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [jti]
  );
  return rows.length > 0;
}

/** @returns {Promise<{ ok: true } | { ok: false, code: string, message: string, locked_by?: object }>} */
export async function assertOrAcquireCartonLock(connection, lockKey, sessionJti, userCode) {
  const [existing] = await connection.execute(
    `SELECT session_jti, user_code FROM wms_carton_lock WHERE lock_key = ? LIMIT 1`,
    [lockKey]
  );
  if (!existing.length) {
    await connection.execute(
      `INSERT INTO wms_carton_lock (lock_key, session_jti, user_code) VALUES (?, ?, ?)`,
      [lockKey, sessionJti, userCode]
    );
    return { ok: true };
  }
  const row = existing[0];
  if (row.session_jti === sessionJti) {
    return { ok: true };
  }
  return {
    ok: false,
    code: 'CARTON_LOCKED',
    message: 'This carton is being received by another active session.',
    locked_by: { session_jti: row.session_jti, user_code: row.user_code },
  };
}

export async function releaseCartonLockIfOwned(connection, lockKey, sessionJti) {
  await connection.execute(
    `DELETE FROM wms_carton_lock WHERE lock_key = ? AND session_jti = ?`,
    [lockKey, sessionJti]
  );
}

export async function releaseCartonLocksForTransferIn(connection, sessionJti, transferInTitle) {
  if (!sessionJti) return;
  const prefix = `ti:${transferInTitle}:`;
  await connection.execute(
    `DELETE FROM wms_carton_lock WHERE session_jti = ? AND lock_key LIKE ?`,
    [sessionJti, `${prefix}%`]
  );
}

export async function releaseCartonLocksForSession(connection, sessionJti) {
  if (!sessionJti) return;
  await connection.execute(`DELETE FROM wms_carton_lock WHERE session_jti = ?`, [sessionJti]);
}

/**
 * Active mobile sessions (not revoked, not expired) with lock counts.
 * @returns {Promise<Array<{ jti: string, user_code: string, device_id: string, created_at: Date, expires_at: Date, active_locks: number }>>}
 */
export async function listActiveMobileSessions(connection) {
  const [rows] = await connection.execute(
    `SELECT s.jti, s.user_code, s.device_id, s.created_at, s.expires_at,
       (SELECT COUNT(*) FROM wms_carton_lock l WHERE l.session_jti = s.jti) AS active_locks
     FROM wms_mobile_session s
     WHERE s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
     ORDER BY s.created_at DESC`
  );
  return rows;
}

async function insertReleaseAudit(connection, row) {
  await connection.execute(
    `INSERT INTO wms_mobile_session_release_audit
      (released_by_user_code, scope, target_jti, target_user_code, target_device_id, reason, sessions_revoked, locks_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.releasedBy,
      row.scope,
      row.targetJti || null,
      row.targetUserCode || null,
      row.targetDeviceId || null,
      row.reason,
      row.sessionsRevoked,
      row.locksDeleted,
    ]
  );
}

/**
 * Admin/supervisor: revoke one session by JTI and delete its carton locks. Transaction + audit.
 */
export async function adminReleaseMobileSessionByJti(connection, jti, releasedBy, reason) {
  const j = String(jti || '').trim();
  if (!j) throw new Error('jti is required');
  await connection.beginTransaction();
  try {
    const [del] = await connection.execute(`DELETE FROM wms_carton_lock WHERE session_jti = ?`, [j]);
    const locksDeleted = del.affectedRows || 0;
    const [up] = await connection.execute(
      `UPDATE wms_mobile_session SET revoked_at = UTC_TIMESTAMP() WHERE jti = ? AND revoked_at IS NULL`,
      [j]
    );
    const sessionsRevoked = up.affectedRows || 0;
    await insertReleaseAudit(connection, {
      releasedBy,
      scope: 'jti',
      targetJti: j,
      targetUserCode: null,
      targetDeviceId: null,
      reason,
      sessionsRevoked,
      locksDeleted,
    });
    await connection.commit();
    return { sessionsRevoked, locksDeleted };
  } catch (e) {
    await connection.rollback();
    throw e;
  }
}

export async function adminReleaseMobileSessionsByUser(connection, userCode, releasedBy, reason) {
  const u = String(userCode || '').trim();
  if (!u) throw new Error('user_code is required');
  await connection.beginTransaction();
  try {
    const [del] = await connection.execute(
      `DELETE l FROM wms_carton_lock l
       INNER JOIN wms_mobile_session s ON s.jti = l.session_jti
       WHERE s.user_code = ? AND s.revoked_at IS NULL`,
      [u]
    );
    const locksDeleted = del.affectedRows || 0;
    const [up] = await connection.execute(
      `UPDATE wms_mobile_session SET revoked_at = UTC_TIMESTAMP() WHERE user_code = ? AND revoked_at IS NULL`,
      [u]
    );
    const sessionsRevoked = up.affectedRows || 0;
    await insertReleaseAudit(connection, {
      releasedBy,
      scope: 'user',
      targetJti: null,
      targetUserCode: u,
      targetDeviceId: null,
      reason,
      sessionsRevoked,
      locksDeleted,
    });
    await connection.commit();
    return { sessionsRevoked, locksDeleted };
  } catch (e) {
    await connection.rollback();
    throw e;
  }
}

export async function adminReleaseMobileSessionsByDevice(connection, deviceId, releasedBy, reason) {
  const d = String(deviceId || '').trim();
  if (!d) throw new Error('device_id is required');
  await connection.beginTransaction();
  try {
    const [del] = await connection.execute(
      `DELETE l FROM wms_carton_lock l
       INNER JOIN wms_mobile_session s ON s.jti = l.session_jti
       WHERE s.device_id = ? AND s.revoked_at IS NULL`,
      [d]
    );
    const locksDeleted = del.affectedRows || 0;
    const [up] = await connection.execute(
      `UPDATE wms_mobile_session SET revoked_at = UTC_TIMESTAMP() WHERE device_id = ? AND revoked_at IS NULL`,
      [d]
    );
    const sessionsRevoked = up.affectedRows || 0;
    await insertReleaseAudit(connection, {
      releasedBy,
      scope: 'device',
      targetJti: null,
      targetUserCode: null,
      targetDeviceId: d,
      reason,
      sessionsRevoked,
      locksDeleted,
    });
    await connection.commit();
    return { sessionsRevoked, locksDeleted };
  } catch (e) {
    await connection.rollback();
    throw e;
  }
}

export function transferInCartonLockKey(title, cartonId) {
  return `ti:${title}:${cartonId}`;
}
