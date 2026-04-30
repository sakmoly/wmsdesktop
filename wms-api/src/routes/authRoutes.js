// wms-api/src/routes/authRoutes.js
// Authentication routes

import express from 'express';
import {
  login,
  changePassword,
  logout,
  getSession,
  approveDevice,
  disableDevice,
  deleteDevice,
  listRegisteredDevices,
  listActiveMobileSessionsForAdmin,
  releaseMobileSessionForAdmin,
} from '../modules/auth/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login - User login
router.post('/login', login);

// GET /api/auth/session - Mobile / client session info (requires authentication)
router.get('/session', authenticateToken, getSession);

// POST /api/auth/logout - End mobile session and release carton locks
router.post('/logout', authenticateToken, logout);

// GET /api/auth/admin/devices - List registered devices (admin only)
router.get('/admin/devices', authenticateToken, listRegisteredDevices);

// POST /api/auth/admin/devices/:deviceId/approve - Approve pending device (admin only)
router.post('/admin/devices/:deviceId/approve', authenticateToken, approveDevice);

// POST /api/auth/admin/devices/:deviceId/disable - Disable device and revoke sessions (admin only)
router.post('/admin/devices/:deviceId/disable', authenticateToken, disableDevice);

// DELETE /api/auth/admin/devices/:deviceId - Remove device from registry (admin only)
router.delete('/admin/devices/:deviceId', authenticateToken, deleteDevice);

// GET /api/auth/admin/mobile-sessions - Active mobile sessions + lock counts (admin or supervisor)
router.get('/admin/mobile-sessions', authenticateToken, listActiveMobileSessionsForAdmin);

// POST /api/auth/admin/mobile-sessions/release - Revoke session(s), delete carton locks, audit (admin or supervisor)
router.post('/admin/mobile-sessions/release', authenticateToken, releaseMobileSessionForAdmin);

// POST /api/auth/change-password - Change user password (requires authentication)
router.post('/change-password', authenticateToken, changePassword);

export default router;

