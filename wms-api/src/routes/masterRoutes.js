// wms-api/src/routes/masterRoutes.js
// Master data API routes

import express from 'express';
import { 
  getAllAsns, 
  getAsnByNumber,
  getAllTransferOrders,
  getAllBoxes,
  getAllTransferCartons,
  getAllWarehouseRacks,
  getAllWarehouses,
  getWarehousesStores,
  getAllLocations,
  getAllUsers,
  getAllItems,
  getBinMaster,
  getBinByCode,
  getStockLedgerMaster,
  getItemBarcodeMap,
  lookupItem
} from '../modules/master/masterController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/master/asns - Get all ASNs (preserves original format)
router.get('/asns', authenticateToken, getAllAsns);

// GET /api/master/transfer-orders - Get all transfer orders
router.get('/transfer-orders', authenticateToken, getAllTransferOrders);

// GET /api/master/boxes - Get all sort boxes
router.get('/boxes', authenticateToken, getAllBoxes);

// GET /api/master/transfer-cartons - Get all transfer cartons
router.get('/transfer-cartons', authenticateToken, getAllTransferCartons);

// GET /api/master/warehouse-racks - Get all warehouse racks
router.get('/warehouse-racks', authenticateToken, getAllWarehouseRacks);

// GET /api/master/warehouses - Get all warehouses
router.get('/warehouses', authenticateToken, getAllWarehouses);

// GET /api/master/warehouses-stores - Get all warehouses and stores
router.get('/warehouses-stores', authenticateToken, getWarehousesStores);

// GET /api/master/locations - Get all locations
router.get('/locations', authenticateToken, getAllLocations);

// GET /api/master/users - Get all users
router.get('/users', authenticateToken, getAllUsers);

// GET /api/master/items - Get all items
router.get('/items', authenticateToken, getAllItems);

// GET /api/master/bin-master/:bin_code - Get specific bin by code (must come before /bin-master)
router.get('/bin-master/:bin_code', authenticateToken, getBinByCode);

// GET /api/master/bin-master - Get all bin/location master data
router.get('/bin-master', authenticateToken, getBinMaster);

// GET /api/master/stock-ledger - Get all stock ledger entries
router.get('/stock-ledger', authenticateToken, getStockLedgerMaster);

// GET /api/master/item-barcode-map - Get item barcode mapping
router.get('/item-barcode-map', authenticateToken, getItemBarcodeMap);

// GET /api/master/items/lookup - Lookup item by barcode or item_code (for real-time validation)
router.get('/items/lookup', authenticateToken, lookupItem);

export default router;

