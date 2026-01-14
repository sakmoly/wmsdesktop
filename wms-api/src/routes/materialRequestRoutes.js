// wms-api/src/routes/materialRequestRoutes.js
// Material Request API routes

import express from 'express';
import { getMaterialRequests, getMaterialRequestByTitle, createMaterialRequest, updateMaterialRequestStatus, pickMaterialRequestItems, getPickingStatus } from '../modules/material-request/materialRequestController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/material-requests - Get all Material Request documents
router.get('/', authenticateToken, getMaterialRequests);

// POST /api/material-requests - Create a new Material Request document
router.post('/', authenticateToken, createMaterialRequest);

// POST /api/material-requests/:title/update-status - Update Material Request status (must come before /:title)
router.post('/:title/update-status', authenticateToken, updateMaterialRequestStatus);

// POST /api/material-requests/:title/pick-items - Pick items for Material Request and reduce stock
router.post('/:title/pick-items', authenticateToken, pickMaterialRequestItems);

// GET /api/material-requests/:title/picking-status - Get picking status (check if all items are fully picked) (must come before /:title)
router.get('/:title/picking-status', authenticateToken, getPickingStatus);

// GET /api/material-requests/:title - Get a single Material Request document
router.get('/:title', authenticateToken, getMaterialRequestByTitle);

export default router;

