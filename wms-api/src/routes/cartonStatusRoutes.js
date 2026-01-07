// wms-api/src/routes/cartonStatusRoutes.js
// Carton status update routes

import express from 'express';
import { updateCartonStatus } from '../modules/cartons/cartonStatusController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/cartons/update-status - Update carton status (single or batch)
router.post('/update-status', authenticateToken, updateCartonStatus);

export default router;

