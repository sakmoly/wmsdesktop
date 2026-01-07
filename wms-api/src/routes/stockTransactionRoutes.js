// wms-api/src/routes/stockTransactionRoutes.js
// Stock Transaction API routes

import express from 'express';
import { getStockTransactions } from '../modules/stock-ledger/stockTransactionController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/stock-transactions - Get all stock transaction entries
router.get('/', authenticateToken, getStockTransactions);

export default router;

