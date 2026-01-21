// wms-api/src/routes/cartonRoutes.js
// Routes for carton operations (lock, complete, status updates)

import express from 'express';
import { lockCarton, completeCarton } from '../modules/cartons/cartonController.js';
import { getCartonContents } from '../modules/relocation/relocationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/carton/lock - Lock a carton for receiving
router.post('/lock', authenticateToken, lockCarton);

// POST /api/carton/complete - Mark carton as completed
router.post('/complete', authenticateToken, completeCarton);

// GET /api/carton/:carton_id/contents - Get carton contents (for relocation)
router.get('/:carton_id/contents', authenticateToken, getCartonContents);

export default router;

