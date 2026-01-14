// wms-api/src/routes/transactionHistoryRoutes.js
// Transaction History API routes (from tabTransactionHistory table)

import express from 'express';
import { getTransactionHistory } from '../modules/stock-ledger/transactionHistoryController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/transaction-history - Get transaction history from tabTransactionHistory
router.get('/', authenticateToken, getTransactionHistory);

export default router;
