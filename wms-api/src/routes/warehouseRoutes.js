// wms-api/src/routes/warehouseRoutes.js
// Warehouse API routes

import express from 'express';
import { getWarehousesStores } from '../modules/master/masterController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/warehouses/stores - Get all warehouses and stores
// This endpoint is an alias for /api/master/warehouses-stores
// Added for mobile app compatibility
router.get('/stores', authenticateToken, getWarehousesStores);

export default router;

