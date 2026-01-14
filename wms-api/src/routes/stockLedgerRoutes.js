// wms-api/src/routes/stockLedgerRoutes.js
// Stock Ledger API routes

import express from 'express';
import { getStockLedger, getStockLedgerByItem, getStockLedgerByLocation, syncStockQuantities } from '../modules/stock-ledger/stockLedgerController.js';
import { diagnoseStockDiscrepancy } from '../modules/stock-ledger/stockDiagnosticsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/stock-ledger - Get all stock ledger entries
router.get('/', authenticateToken, getStockLedger);

// GET /api/stock-ledger/:item_code/:warehouse - Get stock ledger for specific item/warehouse
router.get('/:item_code/:warehouse', authenticateToken, getStockLedgerByItem);

// POST /api/stock/sync-quantities - Sync tabItem.stock_qty with actual stock
router.post('/sync-quantities', authenticateToken, syncStockQuantities);

// GET /api/wms/stock/diagnose - Diagnose stock discrepancies
router.get('/diagnose', authenticateToken, diagnoseStockDiscrepancy);

export default router;

