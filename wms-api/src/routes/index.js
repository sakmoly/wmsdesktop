// wms-api/src/routes/index.js
// Main routes file - registers all API routes

import express from 'express';
import masterRoutes from './masterRoutes.js';
import authRoutes from './authRoutes.js';
import cartonRoutes from './cartonRoutes.js';
import inboundRoutes from './inboundRoutes.js';
import cartonStatusRoutes from './cartonStatusRoutes.js';
import eventRoutes from './eventRoutes.js';
import putawayRoutes from './putawayRoutes.js';
import boxRoutes from './boxRoutes.js';
import transferCartonRoutes from './transferCartonRoutes.js';
import stockLedgerRoutes from './stockLedgerRoutes.js';
import stockTransactionRoutes from './stockTransactionRoutes.js';
import transactionHistoryRoutes from './transactionHistoryRoutes.js';
import { getStockLedgerByLocation } from '../modules/stock-ledger/stockLedgerController.js';
import transferInRoutes from './transferInRoutes.js';
import materialRequestRoutes from './materialRequestRoutes.js';
import cycleCountRoutes from './cycleCountRoutes.js';
import warehouseRoutes from './warehouseRoutes.js';
import relocationRoutes from './relocationRoutes.js';
import { getAsnByNumber } from '../modules/master/masterController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Health check endpoint (also available at /health without /api prefix)
router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'WMS API Server is running'
  });
});

// Register authentication routes (no auth middleware needed for login)
router.use('/api/auth', authRoutes);

// Register master data routes
router.use('/api/master', masterRoutes);

// Register carton routes
router.use('/api/carton', cartonRoutes);

// Register carton status routes
router.use('/api/cartons', cartonStatusRoutes);

// Register inbound routes
router.use('/api/inbound', inboundRoutes);

// Register event routes
router.use('/api/events', eventRoutes);

// Register putaway routes
router.use('/api/putaway', putawayRoutes);

// Register box routes
router.use('/api/boxes', boxRoutes);
// Also register as sort-box (alias for compatibility)
router.use('/api/sort-box', boxRoutes);

// Register transfer carton routes
router.use('/api/transfer-cartons', transferCartonRoutes);

// Register stock ledger routes
router.use('/api/stock-ledger', stockLedgerRoutes);

// Register WMS stock routes (diagnostics)
router.use('/api/wms/stock', stockLedgerRoutes);

// Register stock transaction routes
router.use('/api/stock-transactions', stockTransactionRoutes);

// Register transaction history routes (from tabTransactionHistory)
router.use('/api/transaction-history', transactionHistoryRoutes);

// Register enhanced stock ledger route for Cycle Count (bin_location + carton_id filtering)
// GET /api/stock/ledger - Get stock ledger filtered by bin_location (required) and carton_id (optional)
router.get('/api/stock/ledger', authenticateToken, getStockLedgerByLocation);

// Register alias route for stock by item/warehouse (alternative path structure)
// GET /api/stock/item/:item_code/warehouse/:warehouse - Get stock ledger for specific item/warehouse
// This is an alias for /api/stock-ledger/:item_code/:warehouse
import { getStockLedgerByItem, syncStockQuantities } from '../modules/stock-ledger/stockLedgerController.js';
router.get('/api/stock/item/:item_code/warehouse/:warehouse', authenticateToken, getStockLedgerByItem);

// POST /api/stock/sync-quantities - Sync tabItem.stock_qty with actual stock
router.post('/api/stock/sync-quantities', authenticateToken, syncStockQuantities);

// Register transfer in routes
router.use('/api/transfer-in', transferInRoutes);

// Register material request routes
router.use('/api/material-requests', materialRequestRoutes);

// Register cycle count routes
router.use('/api/cycle-count', cycleCountRoutes);

// Register warehouse routes
router.use('/api/warehouses', warehouseRoutes);

// Register relocation routes
router.use('/api/relocation', relocationRoutes);

// Register inventory validation routes
import inventoryRoutes from './inventoryRoutes.js';
router.use('/api/inventory', inventoryRoutes);

// Register ASN detail route (separate from master routes for mobile app compatibility)
// GET /api/asn/:asn_no - Get single ASN with cartons/items
router.get('/api/asn/:asn_no', authenticateToken, getAsnByNumber);

// Register transfer order by ASN route
// GET /api/transfer-order/by-asn/:asn_no - Get transfer order for a specific ASN
import { getTransferOrderByAsn } from '../modules/master/masterController.js';
router.get('/api/transfer-order/by-asn/:asn_no', authenticateToken, getTransferOrderByAsn);

// GET /api/transfer-orders/:to_no/stores - Get distinct stores for a specific transfer order
import { getTransferOrderStores, getAsnStores } from '../modules/transfer-orders/getTransferOrderStores.js';
router.get('/api/transfer-orders/:to_no/stores', authenticateToken, getTransferOrderStores);

// GET /api/asn/:asn_no/stores - Get distinct stores for an ASN (handles both ASN with TO and ASN without TO)
router.get('/api/asn/:asn_no/stores', authenticateToken, getAsnStores);

// Register transfer order quantity update routes
import { 
  updateTransferOrderQuantitiesEndpoint, 
  updateAllTransferOrderQuantitiesEndpoint,
  backfillScanEventTransferOrderEndpoint,
} from '../modules/transfer-orders/transferOrderController.js';
router.post('/api/transfer-orders/:to_no/update-quantities', authenticateToken, updateTransferOrderQuantitiesEndpoint);
router.post('/api/transfer-orders/update-all-quantities', authenticateToken, updateAllTransferOrderQuantitiesEndpoint);
router.post(
  '/api/transfer-orders/backfill-scan-transfer-order',
  authenticateToken,
  backfillScanEventTransferOrderEndpoint
);

export default router;

