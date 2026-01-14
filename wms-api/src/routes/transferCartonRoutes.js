// wms-api/src/routes/transferCartonRoutes.js
// Transfer carton routes

import express from 'express';
import { getTransferCartons, getTransferCartonById, createTransferCarton, sealTransferCarton, dispatchTransferCarton, addItemsToTransferCarton } from '../modules/transfer-cartons/transferCartonController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/transfer-cartons - Get transfer cartons (with optional ?asn= and ?store= filters)
router.get('/', authenticateToken, getTransferCartons);

// POST /api/transfer-cartons/create - Create transfer cartons (must come before /:tc_id)
router.post('/create', authenticateToken, createTransferCarton);

// POST /api/transfer-cartons/seal - Seal transfer cartons (must come before /:tc_id)
router.post('/seal', authenticateToken, sealTransferCarton);

// POST /api/transfer-cartons/dispatch - Dispatch transfer cartons (must come before /:tc_id)
router.post('/dispatch', authenticateToken, dispatchTransferCarton);

// POST /api/transfer-cartons/:tc_id/add-items - Add items to an existing transfer carton (must come before /:tc_id)
router.post('/:tc_id/add-items', authenticateToken, addItemsToTransferCarton);

// GET /api/transfer-cartons/:tc_id - Get a single transfer carton by ID with contents (must come last)
router.get('/:tc_id', authenticateToken, getTransferCartonById);

export default router;

