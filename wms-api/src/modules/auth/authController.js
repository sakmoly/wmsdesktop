// wms-api/src/modules/auth/authController.js
// Authentication controller - Login endpoint

import { getConnection } from '../../db/connection.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  upsertDevicePending,
  getDeviceStatus,
  getActiveMobileSessionForUser,
  revokeAllSessionsForUser,
  insertMobileSession,
  revokeSessionByJti,
  isMobileSessionActive,
  approveDeviceById,
  disableDeviceById,
  deleteRegisteredDeviceById,
  isAdminUser,
  isSupervisorOrAdminUser,
  listActiveMobileSessions,
  adminReleaseMobileSessionByJti,
  adminReleaseMobileSessionsByUser,
  adminReleaseMobileSessionsByDevice,
} from '../../services/mobileSessionService.js';

/**
 * POST /api/auth/login
 * User login endpoint
 * 
 * Request Body (desktop):
 * { "user_code": "USER-172188", "password": "password123" }
 *
 * Mobile (optional): device_id, device_label, client_type: "mobile",
 * replace_other_mobile_session: true — after credential check, revokes other
 * devices' mobile sessions for this user then issues a new token.
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "access_token": "<jwt_token>",
 *     "expires_in": 604800,
 *     "user": {
 *       "user_code": "USER-172188",
 *       "name": "John Doe"
 *     }
 *   }
 * }
 */
export const login = async (req, res) => {
  // Log incoming request details - FORCE LOGGING
  const timestamp = new Date().toISOString();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || 'unknown';
  
  // FORCE LOGGING - Write to both console and a file to ensure visibility
  const logMessage = `\n\n========== LOGIN FUNCTION CALLED (VERSION 2.0) ==========\n[${timestamp}] ===== LOGIN REQUEST =====\n[${timestamp}] IP: ${clientIP}\n[${timestamp}] User-Agent: ${userAgent}\n[${timestamp}] Method: ${req.method}\n[${timestamp}] URL: ${req.originalUrl || req.url}\n`;
  
  // Write to console (all methods)
  console.error(logMessage);
  console.log(logMessage);
  process.stderr.write(logMessage);
  process.stdout.write(logMessage);
  
  const {
    user_code,
    password,
    device_id,
    device_label,
    client_type,
    replace_other_mobile_session,
  } = req.body;

  const replaceOtherMobileSession =
    replace_other_mobile_session === true ||
    replace_other_mobile_session === 1 ||
    String(replace_other_mobile_session || '').toLowerCase() === 'true';
  
  console.error(`[${timestamp}] Body parsed - user_code: ${user_code}, password: ${password ? '***' : 'MISSING'}`);
  console.log(`[${timestamp}] Body parsed - user_code: ${user_code}, password: ${password ? '***' : 'MISSING'}`);

  // Validate input
  if (!user_code || !password) {
    console.log(`[${timestamp}] ❌ VALIDATION ERROR: Missing user_code or password`);
    console.log(`[${timestamp}] Request body:`, { user_code: user_code || 'MISSING', password: password ? '***' : 'MISSING' });
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'user_code and password are required'
      }
    });
  }

  console.log(`[${timestamp}] ✅ Validation passed. Attempting login for user: ${user_code}`);

  let connection;
  try {
    console.log(`[${timestamp}] 🔌 Attempting database connection...`);
    connection = await getConnection();
    console.log(`[${timestamp}] ✅ Database connection established`);
  } catch (dbError) {
    console.error(`[${timestamp}] ❌ DATABASE CONNECTION ERROR:`, dbError);
    console.error(`[${timestamp}] Error Code:`, dbError.code);
    console.error(`[${timestamp}] Error Message:`, dbError.message);
    console.error(`[${timestamp}] Error Stack:`, dbError.stack);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to connect to database',
        details: process.env.NODE_ENV === 'development' ? dbError.message : null
      }
    });
  }

  try {
    // Query user from database
    // Note: In production, you should hash passwords and compare hashes
    // For now, we'll check if user exists and password matches
    console.log(`[${timestamp}] 🔍 Querying database for user: ${user_code}`);
    const [users] = await connection.execute(
      `SELECT user_code, name, password_hash, role, active 
       FROM tabUser 
       WHERE user_code = ? AND active = 1`,
      [user_code]
    );

    console.log(`[${timestamp}] 📊 Database query result: Found ${users.length} user(s)`);
    if (users.length > 0) {
      console.log(`[${timestamp}] User found:`, {
        user_code: users[0].user_code,
        name: users[0].name,
        role: users[0].role,
        active: users[0].active,
        has_password_hash: !!users[0].password_hash
      });
    }

    if (!users || users.length === 0) {
      console.log(`[${timestamp}] ❌ USER NOT FOUND or INACTIVE: ${user_code}`);
      return res.status(401).json({
        ok: false,
        success: false,
        error: {
          code: 'AUTH_INVALID',
          message: 'Invalid credentials',
          debug: {
            user_code: user_code,
            users_found: 0,
            reason: 'User not found or inactive'
          }
        }
      });
    }

    const user = users[0];

    // Password verification
    // If password_hash exists, verify against hash
    // Otherwise, for development, allow plain text comparison
    let passwordValid = false;
    
    if (user.password_hash) {
      // Check if password_hash is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
      if (user.password_hash.startsWith('$2')) {
        // TODO: Use bcrypt.compare() for production
        // For now, if it's a bcrypt hash, we'll need bcrypt library
        // Temporary: accept if password matches a simple hash
        const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
        passwordValid = user.password_hash === sha256Hash;
        console.log(`[${timestamp}] 🔐 Bcrypt hash comparison: ${passwordValid ? '✅ Match' : '❌ No match'}`);
      } else {
        // Simple hash comparison (SHA256) or plain text for development
        const plainTextMatch = user.password_hash === password;
        const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
        const hashMatch = user.password_hash === sha256Hash;
        passwordValid = plainTextMatch || hashMatch;
        
        console.log(`[${timestamp}] 🔐 Password validation details:`);
        console.log(`[${timestamp}]   - Password received: "${password}" (length: ${password.length})`);
        console.log(`[${timestamp}]   - Stored hash: ${user.password_hash.substring(0, 20)}...`);
        console.log(`[${timestamp}]   - Computed SHA256: ${sha256Hash.substring(0, 20)}...`);
        console.log(`[${timestamp}]   - Plain text match: ${plainTextMatch ? '✅' : '❌'}`);
        console.log(`[${timestamp}]   - Hash match: ${hashMatch ? '✅' : '❌'}`);
        console.log(`[${timestamp}]   - Final result: ${passwordValid ? '✅ VALID' : '❌ INVALID'}`);
      }
    } else {
      // Development mode: if no password_hash, accept any password
      // This allows testing without setting up password hashes
      // WARNING: Remove this in production!
      if (process.env.NODE_ENV === 'development') {
        passwordValid = true;
      } else {
        passwordValid = false;
      }
    }

    if (!passwordValid) {
      console.log(`[${timestamp}] ❌ PASSWORD VALIDATION FAILED for user: ${user_code}`);
      
      // DEBUG: Include debug info in response (remove in production)
      const debugInfo = {
        password_received: password ? `"${password}" (length: ${password.length})` : 'MISSING',
        password_hash_exists: !!user.password_hash,
        password_hash_length: user.password_hash ? user.password_hash.length : 0,
        password_hash_preview: user.password_hash ? `${user.password_hash.substring(0, 20)}...` : 'NULL',
        computed_hash: user.password_hash ? crypto.createHash('sha256').update(password || '').digest('hex').substring(0, 20) + '...' : 'N/A',
        hash_match: user.password_hash ? (user.password_hash === crypto.createHash('sha256').update(password || '').digest('hex')) : false,
        plain_text_match: user.password_hash ? (user.password_hash === password) : false
      };
      
      // Include debug info in multiple places to ensure it shows up
      return res.status(401).json({
        ok: false,
        success: false, // Desktop app expects this
        error: {
          code: 'AUTH_INVALID',
          message: `Invalid credentials - DEBUG: hash_match=${debugInfo.hash_match}, plain_match=${debugInfo.plain_text_match}, pwd_len=${password?.length || 0}`,
          debug: debugInfo, // Always include debug info for now
          details: debugInfo // Also in details field (desktop app might look here)
        },
        debug: debugInfo // Also at root level
      });
    }

    console.log(`[${timestamp}] ✅ Password validated successfully`);

    const jwtSecret = process.env.JWT_SECRET || 'default-secret-key-change-in-production';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    const rawDevice = device_id != null ? String(device_id).trim() : '';
    const ct = client_type != null ? String(client_type).trim().toLowerCase() : '';
    const isMobileClient =
      ct === 'mobile' || (rawDevice.length > 0 && ct !== 'desktop');

    if (ct === 'mobile' && !rawDevice) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'client_type mobile requires device_id (app-generated UUID)',
        },
      });
    }

    let token;
    let expiresInSeconds;
    let responseClientType = 'desktop';
    let deviceStatusOut = null;

    if (isMobileClient && rawDevice) {
      responseClientType = 'mobile';
      const active = await getActiveMobileSessionForUser(connection, user.user_code);
      if (active && active.device_id !== rawDevice) {
        if (!replaceOtherMobileSession) {
          return res.status(409).json({
            ok: false,
            success: false,
            error: {
              code: 'AUTH_SESSION_EXISTS',
              message:
                'This user is already logged in on another mobile device. Log out there first, or retry login with replace_other_mobile_session: true to use this device.',
              active_device_id: active.device_id,
            },
          });
        }
        console.log(
          `[${timestamp}] 🔁 replace_other_mobile_session: revoking other mobile session(s) for ${user.user_code} (was device ${active.device_id})`
        );
      }

      await revokeAllSessionsForUser(connection, user.user_code);

      deviceStatusOut = await upsertDevicePending(connection, rawDevice, device_label || null);
      const st = await getDeviceStatus(connection, rawDevice);
      if (st === 'disabled') {
        return res.status(403).json({
          ok: false,
          success: false,
          error: {
            code: 'DEVICE_DISABLED',
            message: 'This device is disabled. Contact an administrator.',
          },
        });
      }

      const jti = randomUUID();
      const payload = {
        user_code: user.user_code,
        user_id: user.user_code,
        role: user.role || 'operator',
        typ: 'mobile',
        device_id: rawDevice,
        jti,
      };

      token = jwt.sign(payload, jwtSecret, { expiresIn });
      const decoded = jwt.decode(token);
      expiresInSeconds =
        typeof decoded?.exp === 'number' && typeof decoded?.iat === 'number'
          ? decoded.exp - decoded.iat
          : 604800;

      await insertMobileSession(connection, {
        jti,
        userCode: user.user_code,
        deviceId: rawDevice,
        expUnix: decoded.exp,
      });
    } else {
      token = jwt.sign(
        {
          user_code: user.user_code,
          user_id: user.user_code,
          role: user.role || 'operator',
        },
        jwtSecret,
        { expiresIn }
      );
      expiresInSeconds =
        expiresIn === '7d' ? 604800 : expiresIn === '1d' ? 86400 : expiresIn === '1h' ? 3600 : 604800;
    }

    console.log(`[${timestamp}] ✅ LOGIN SUCCESS for user: ${user_code} (${responseClientType})`);

    res.json({
      ok: true,
      success: true,
      data: {
        access_token: token,
        expires_in: expiresInSeconds,
        client_type: responseClientType,
        device_status: deviceStatusOut,
        user: {
          user_code: user.user_code,
          name: user.name || user.user_code,
        },
      },
    });
    
    console.log(`[${timestamp}] ===== LOGIN REQUEST COMPLETE =====\n`);

  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`\n[${errorTimestamp}] ❌❌❌ LOGIN ERROR ❌❌❌`);
    console.error(`[${errorTimestamp}] Error Type:`, error.constructor.name);
    console.error(`[${errorTimestamp}] Error Code:`, error.code);
    console.error(`[${errorTimestamp}] Error Message:`, error.message);
    console.error(`[${errorTimestamp}] Error Stack:`, error.stack);
    console.error(`[${errorTimestamp}] Full Error Object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Login failed due to server error',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
    
    console.error(`[${errorTimestamp}] ===== LOGIN ERROR COMPLETE =====\n`);
  } finally {
    if (connection) {
      connection.release();
      console.log(`[${timestamp}] 🔌 Database connection released`);
    }
  }
};

/**
 * POST /api/auth/logout — revokes mobile server session and releases carton locks for that session.
 * Desktop tokens (no jti) return success without server-side state.
 */
export const logout = async (req, res) => {
  if (!req.user?.jti || req.user.typ !== 'mobile') {
    return res.json({
      ok: true,
      success: true,
      message: 'No mobile session to revoke.',
    });
  }

  const connection = await getConnection();
  try {
    await revokeSessionByJti(connection, req.user.jti);
    return res.json({ ok: true, success: true });
  } catch (error) {
    console.error('logout error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Logout failed',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/auth/session — for mobile settings / pending UI; returns device and session flags.
 */
export const getSession = async (req, res) => {
  const connection = await getConnection();
  try {
    const isMobile = req.user?.typ === 'mobile' && req.user?.jti;
    let device_status = null;
    if (req.user?.device_id) {
      device_status = await getDeviceStatus(connection, req.user.device_id);
    }
    let session_active = true;
    if (isMobile) {
      session_active = await isMobileSessionActive(connection, req.user.jti);
    }

    return res.json({
      ok: true,
      data: {
        user_code: req.user.user_code || req.user.user_id,
        client_type: isMobile ? 'mobile' : 'desktop',
        device_id: req.user.device_id || null,
        device_status,
        session_active,
      },
    });
  } catch (error) {
    console.error('getSession error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to read session',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/auth/admin/devices/:deviceId/approve — approves a pending device (admin users only).
 */
export const approveDevice = async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Administrator role required' },
    });
  }
  const { deviceId } = req.params;
  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'deviceId is required' },
    });
  }

  const connection = await getConnection();
  try {
    const updated = await approveDeviceById(connection, deviceId);
    return res.json({
      ok: true,
      data: { device_id: deviceId, approved: updated },
    });
  } catch (error) {
    console.error('approveDevice error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to approve device',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/auth/admin/devices/:deviceId/disable — disable device and revoke its sessions (admin only).
 */
export const disableDevice = async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Administrator role required' },
    });
  }
  const { deviceId } = req.params;
  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'deviceId is required' },
    });
  }

  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT status FROM wms_registered_device WHERE device_id = ? LIMIT 1`,
      [deviceId]
    );
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Unknown device_id' },
      });
    }
    if (rows[0].status === 'disabled') {
      return res.json({
        ok: true,
        data: { device_id: deviceId, disabled: false, message: 'Device was already disabled' },
      });
    }

    await disableDeviceById(connection, deviceId);
    return res.json({
      ok: true,
      data: { device_id: deviceId, disabled: true },
    });
  } catch (error) {
    console.error('disableDevice error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to disable device',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * DELETE /api/auth/admin/devices/:deviceId — remove registry row; revokes sessions (admin only).
 */
export const deleteDevice = async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Administrator role required' },
    });
  }
  const { deviceId } = req.params;
  if (!deviceId) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'deviceId is required' },
    });
  }

  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT device_id FROM wms_registered_device WHERE device_id = ? LIMIT 1`,
      [deviceId]
    );
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Unknown device_id' },
      });
    }

    const deleted = await deleteRegisteredDeviceById(connection, deviceId);
    return res.json({
      ok: true,
      data: { device_id: deviceId, deleted },
    });
  } catch (error) {
    console.error('deleteDevice error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete device',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/auth/admin/devices?status=pending|approved|disabled|all — list registered devices (admin only).
 */
export const listRegisteredDevices = async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Administrator role required' },
    });
  }

  const raw = String(req.query.status || 'all').toLowerCase();
  const allowed = new Set(['pending', 'approved', 'disabled', 'all']);
  const status = allowed.has(raw) ? raw : 'all';

  const connection = await getConnection();
  try {
    let sql =
      'SELECT device_id, status, label, created_at, approved_at FROM wms_registered_device';
    const params = [];
    if (status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(sql, params);
    return res.json({ ok: true, data: { devices: rows } });
  } catch (error) {
    console.error('listRegisteredDevices error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list devices',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/auth/admin/mobile-sessions — active mobile sessions (supervisor or admin).
 */
export const listActiveMobileSessionsForAdmin = async (req, res) => {
  if (!isSupervisorOrAdminUser(req.user)) {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Administrator or supervisor role required' },
    });
  }

  const connection = await getConnection();
  try {
    const sessions = await listActiveMobileSessions(connection);
    return res.json({ ok: true, data: { sessions } });
  } catch (error) {
    console.error('listActiveMobileSessionsForAdmin error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list mobile sessions',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/auth/admin/mobile-sessions/release
 * Body: { scope: "jti"|"user"|"device", reason: string, jti?, user_code?, device_id? }
 */
export const releaseMobileSessionForAdmin = async (req, res) => {
  if (!isSupervisorOrAdminUser(req.user)) {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Administrator or supervisor role required' },
    });
  }

  const releasedBy = String(req.user?.user_code || req.user?.user_id || 'unknown').trim() || 'unknown';
  const { scope, jti, user_code, device_id, reason } = req.body || {};
  const scopeNorm = String(scope || '').toLowerCase().trim();
  const reasonTrim = String(reason || '').trim();
  if (!reasonTrim || reasonTrim.length < 3) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'reason is required (at least 3 characters)' },
    });
  }
  if (reasonTrim.length > 2000) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'reason must be 2000 characters or less' },
    });
  }

  const connection = await getConnection();
  try {
    let result;
    if (scopeNorm === 'jti') {
      const j = String(jti || '').trim();
      if (!j) {
        return res.status(400).json({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'jti is required when scope is jti' },
        });
      }
      result = await adminReleaseMobileSessionByJti(connection, j, releasedBy, reasonTrim);
    } else if (scopeNorm === 'user') {
      const u = String(user_code || '').trim();
      if (!u) {
        return res.status(400).json({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'user_code is required when scope is user' },
        });
      }
      result = await adminReleaseMobileSessionsByUser(connection, u, releasedBy, reasonTrim);
    } else if (scopeNorm === 'device') {
      const d = String(device_id || '').trim();
      if (!d) {
        return res.status(400).json({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'device_id is required when scope is device' },
        });
      }
      result = await adminReleaseMobileSessionsByDevice(connection, d, releasedBy, reasonTrim);
    } else {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'scope must be jti, user, or device' },
      });
    }

    return res.json({
      ok: true,
      data: {
        scope: scopeNorm,
        sessions_revoked: result.sessionsRevoked,
        locks_deleted: result.locksDeleted,
      },
    });
  } catch (error) {
    console.error('releaseMobileSessionForAdmin error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to release mobile session(s)',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/auth/change-password
 * Change user password
 * 
 * Request Body:
 * {
 *   "user_code": "USER-172188",
 *   "current_password": "oldpassword",  // Optional if admin changing for another user
 *   "new_password": "newpassword123"
 * }
 */
export const changePassword = async (req, res) => {
  const { user_code, current_password, new_password } = req.body;

  // Validate input
  if (!user_code || !new_password) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'user_code and new_password are required'
      }
    });
  }

  if (new_password.length < 6) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password must be at least 6 characters long'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Get user from database
    const [users] = await connection.execute(
      `SELECT user_code, password_hash, active 
       FROM tabUser 
       WHERE user_code = ?`,
      [user_code]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const user = users[0];

    if (!user.active) {
      return res.status(403).json({
        ok: false,
        error: {
          code: 'USER_INACTIVE',
          message: 'User account is inactive'
        }
      });
    }

    // If current_password is provided, verify it
    if (current_password) {
      let passwordValid = false;
      
      if (user.password_hash) {
        const sha256Hash = crypto.createHash('sha256').update(current_password).digest('hex');
        passwordValid = user.password_hash === current_password || 
                       user.password_hash === sha256Hash;
      } else {
        // Development mode: if no password_hash, accept any password
        passwordValid = process.env.NODE_ENV === 'development';
      }

      if (!passwordValid) {
        return res.status(401).json({
          ok: false,
          error: {
            code: 'AUTH_INVALID',
            message: 'Current password is incorrect'
          }
        });
      }
    }

    // Hash the new password
    const newPasswordHash = crypto.createHash('sha256').update(new_password).digest('hex');

    // Update password in database
    const [result] = await connection.execute(
      `UPDATE tabUser 
       SET password_hash = ?, 
           updated_at = CURRENT_TIMESTAMP
       WHERE user_code = ?`,
      [newPasswordHash, user_code]
    );

    if (result.affectedRows > 0) {
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } else {
      res.status(500).json({
        ok: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update password'
        }
      });
    }

  } catch (error) {
    console.error('Change password error:', error);
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to change password',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

