// wms-api/src/routes/inventoryRoutes.js
// Inventory validation API routes

import express from 'express';
import { getInventoryByLocation, getInventoryByCarton } from '../modules/inventory/inventoryController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/inventory/by-location - Get inventory by location (for putaway validation)
router.get('/by-location', authenticateToken, getInventoryByLocation);

// GET /api/inventory/by-carton - Get inventory by carton (for putaway validation)
router.get('/by-carton', authenticateToken, getInventoryByCarton);

export default router;
