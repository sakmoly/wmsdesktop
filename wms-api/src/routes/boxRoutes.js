// wms-api/src/routes/boxRoutes.js
// Box routes

import express from 'express';
import { createBox, closeBox, deleteBox, getBoxes, getBoxById } from '../modules/boxes/boxController.js';
import { printBox } from '../modules/boxes/boxPrintController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/boxes - Get boxes filtered by ASN, store, and optionally status
// Must come before /:box_id route to avoid matching conflicts
router.get('/', authenticateToken, getBoxes);

// POST /api/boxes/create - Create a new sort box
router.post('/create', authenticateToken, createBox);

// POST /api/boxes/close - Close a sort box
router.post('/close', authenticateToken, closeBox);

// POST /api/boxes/print - Print a box label
router.post('/print', authenticateToken, printBox);

// POST /api/boxes/delete - Delete a box (only if no scanned items)
router.post('/delete', authenticateToken, deleteBox);

// GET /api/boxes/:box_id - Get a specific box by ID
// Must come after all specific routes to avoid matching conflicts
router.get('/:box_id', authenticateToken, getBoxById);

export default router;

