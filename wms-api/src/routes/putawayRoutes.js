// wms-api/src/routes/putawayRoutes.js
// Putaway routes

import express from 'express';
import { 
  getTasks,
  getTaskById,
  getRemainingItems, 
  assignRack, 
  completePutaway,
  scanTransferCarton,
  createTaskForRemainingItems,
  createTasks,
  triggerStockUpdate
} from '../modules/putaway/putawayController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// IMPORTANT: More specific routes must come before general routes
// GET /api/putaway/tasks/:taskId - Get single putaway task by ID
router.get('/tasks/:taskId', authenticateToken, getTaskById);

// GET /api/putaway/tasks - Get list of putaway tasks
router.get('/tasks', authenticateToken, getTasks);

// GET /api/putaway/remaining-items - Get remaining items for putaway
router.get('/remaining-items', authenticateToken, getRemainingItems);

// POST /api/putaway/create-task-for-remaining-items - Create putaway task for remaining items
router.post('/create-task-for-remaining-items', authenticateToken, createTaskForRemainingItems);

// POST /api/putaway/create-tasks - Idempotent Transfer In putaway task ensure (body: { transfer_in })
router.post('/create-tasks', authenticateToken, createTasks);

// POST /api/putaway/assign-rack - Assign rack/bin for putaway
router.post('/assign-rack', authenticateToken, assignRack);

// POST /api/putaway/scan-transfer-carton - Scan transfer carton and location for putaway
router.post('/scan-transfer-carton', authenticateToken, scanTransferCarton);

// POST /api/putaway/complete - Complete putaway task
router.post('/complete', authenticateToken, completePutaway);

// POST /api/putaway/trigger-stock-update - Manually trigger stock update for putaway task
router.post('/trigger-stock-update', authenticateToken, triggerStockUpdate);

export default router;

