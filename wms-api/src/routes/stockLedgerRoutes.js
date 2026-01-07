// wms-api/src/routes/stockLedgerRoutes.js
// Stock Ledger API routes

import express from 'express';
import { getStockLedger, getStockLedgerByItem } from '../modules/stock-ledger/stockLedgerController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/stock-ledger - Get all stock ledger entries
router.get('/', authenticateToken, getStockLedger);

// GET /api/stock-ledger/:item_code/:warehouse - Get stock ledger for specific item/warehouse
router.get('/:item_code/:warehouse', authenticateToken, getStockLedgerByItem);

export default router;

