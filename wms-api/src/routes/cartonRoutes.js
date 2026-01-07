// wms-api/src/routes/cartonRoutes.js
// Routes for carton operations (lock, complete, status updates)

import express from 'express';
import { lockCarton, completeCarton } from '../modules/cartons/cartonController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/carton/lock - Lock a carton for receiving
router.post('/lock', authenticateToken, lockCarton);

// POST /api/carton/complete - Mark carton as completed
router.post('/complete', authenticateToken, completeCarton);

export default router;

