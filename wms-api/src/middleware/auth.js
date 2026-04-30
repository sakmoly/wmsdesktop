// wms-api/src/middleware/auth.js
// JWT authentication + mobile session, device approval, and pending-device route whitelist.

import jwt from 'jsonwebtoken';
import { getConnection } from '../db/connection.js';
import { isMobileSessionActive, getDeviceStatus } from '../services/mobileSessionService.js';

function normalizeRequestPath(req) {
  const raw = req.originalUrl || req.url || '';
  return raw.split('?')[0] || '';
}

/**
 * Pending mobile devices may only call session + logout (settings-only mode on client).
 */
function isPendingDeviceAllowedRoute(method, path) {
  const m = (method || '').toUpperCase();
  const p = path || '';
  if (m === 'GET' && (p === '/api/auth/session' || p.endsWith('/api/auth/session'))) return true;
  if (m === 'POST' && (p === '/api/auth/logout' || p.endsWith('/api/auth/logout'))) return true;
  return false;
}

/**
 * Verifies Bearer JWT, then for mobile tokens (jti present) validates DB session and device rules.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication token required',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret-key-change-in-production'
    );
  } catch (error) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Invalid or expired token',
    });
  }

  req.user = decoded;

  // Desktop / legacy tokens: no server-side mobile session row
  if (!decoded.jti || decoded.typ !== 'mobile') {
    return next();
  }

  (async () => {
    const connection = await getConnection();
    try {
      const active = await isMobileSessionActive(connection, decoded.jti);
      if (!active) {
        return res.status(403).json({
          ok: false,
          error: {
            code: 'SESSION_REVOKED',
            message: 'Session ended. Log in again (you may have logged out or signed in on another device).',
          },
        });
      }

      const st = await getDeviceStatus(connection, decoded.device_id);
      if (st === 'disabled') {
        return res.status(403).json({
          ok: false,
          error: {
            code: 'DEVICE_DISABLED',
            message: 'This device has been disabled. Contact an administrator.',
          },
        });
      }

      if (st === 'pending' || st === null) {
        const path = normalizeRequestPath(req);
        if (!isPendingDeviceAllowedRoute(req.method, path)) {
          return res.status(403).json({
            ok: false,
            error: {
              code: 'DEVICE_PENDING_APPROVAL',
              message: 'This device is pending approval. Only account/session settings are available until an administrator approves it.',
            },
          });
        }
      }

      return next();
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: {
          code: 'AUTH_MIDDLEWARE_ERROR',
          message: 'Authentication check failed',
          details: process.env.NODE_ENV === 'development' ? e.message : undefined,
        },
      });
    } finally {
      connection.release();
    }
  })().catch((err) => next(err));
}
