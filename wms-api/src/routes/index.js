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
import transferInRoutes from './transferInRoutes.js';
import materialRequestRoutes from './materialRequestRoutes.js';
import cycleCountRoutes from './cycleCountRoutes.js';
import warehouseRoutes from './warehouseRoutes.js';
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

// Register transfer carton routes
router.use('/api/transfer-cartons', transferCartonRoutes);

// Register stock ledger routes
router.use('/api/stock-ledger', stockLedgerRoutes);

// Register stock transaction routes
router.use('/api/stock-transactions', stockTransactionRoutes);

// Register transfer in routes
router.use('/api/transfer-in', transferInRoutes);

// Register material request routes
router.use('/api/material-requests', materialRequestRoutes);

// Register cycle count routes
router.use('/api/cycle-count', cycleCountRoutes);

// Register warehouse routes
router.use('/api/warehouses', warehouseRoutes);

// Register ASN detail route (separate from master routes for mobile app compatibility)
// GET /api/asn/:asn_no - Get single ASN with cartons/items
router.get('/api/asn/:asn_no', authenticateToken, getAsnByNumber);

// Register transfer order by ASN route
// GET /api/transfer-order/by-asn/:asn_no - Get transfer order for a specific ASN
import { getTransferOrderByAsn } from '../modules/master/masterController.js';
router.get('/api/transfer-order/by-asn/:asn_no', authenticateToken, getTransferOrderByAsn);

// Register transfer order quantity update routes
import { 
  updateTransferOrderQuantitiesEndpoint, 
  updateAllTransferOrderQuantitiesEndpoint 
} from '../modules/transfer-orders/transferOrderController.js';
router.post('/api/transfer-orders/:to_no/update-quantities', authenticateToken, updateTransferOrderQuantitiesEndpoint);
router.post('/api/transfer-orders/update-all-quantities', authenticateToken, updateAllTransferOrderQuantitiesEndpoint);

export default router;

