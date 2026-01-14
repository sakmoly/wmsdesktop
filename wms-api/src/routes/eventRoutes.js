// wms-api/src/routes/eventRoutes.js
// Event logging routes

import express from 'express';
import { batchEvents } from '../modules/events/eventController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/events/batch - Batch insert scan events
// Supports update_mode: if true, updates existing quantities instead of adding new events
router.post('/batch', authenticateToken, batchEvents);

export default router;

