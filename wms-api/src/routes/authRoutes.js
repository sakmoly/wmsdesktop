// wms-api/src/routes/authRoutes.js
// Authentication routes

import express from 'express';
import { login, changePassword } from '../modules/auth/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login - User login
router.post('/login', login);

// POST /api/auth/change-password - Change user password (requires authentication)
router.post('/change-password', authenticateToken, changePassword);

export default router;

