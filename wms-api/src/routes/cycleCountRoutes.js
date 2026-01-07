// wms-api/src/routes/cycleCountRoutes.js
// Cycle Count API routes

import express from 'express';
import { 
  getCycleCountTasks, 
  getCycleCountTaskByTitle, 
  createCycleCountTask,
  startCycleCount,
  updateCountLine,
  updateCountLines,
  submitCycleCount,
  completeCycleCount,
  deleteCycleCount
} from '../modules/cycle-count/cycleCountController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/cycle-count - Get all Cycle Count Task documents
router.get('/', authenticateToken, getCycleCountTasks);

// POST /api/cycle-count - Create a new Cycle Count Task document
router.post('/', authenticateToken, createCycleCountTask);

// POST /api/cycle-count/:title/start - Start a Cycle Count Task
router.post('/:title/start', authenticateToken, startCycleCount);

// POST /api/cycle-count/:title/count - Batch update count lines (mobile app)
router.post('/:title/count', authenticateToken, updateCountLines);

// POST /api/cycle-count/:title/update-line - Update single count line
router.post('/:title/update-line', authenticateToken, updateCountLine);

// POST /api/cycle-count/:title/submit - Submit Cycle Count Task
router.post('/:title/submit', authenticateToken, submitCycleCount);

// POST /api/cycle-count/:title/complete - Complete Cycle Count Task
router.post('/:title/complete', authenticateToken, completeCycleCount);

// DELETE /api/cycle-count/:title - Delete Cycle Count Task (must be before GET /:title)
router.delete('/:title', authenticateToken, deleteCycleCount);

// GET /api/cycle-count/:title - Get a single Cycle Count Task document (must be last)
router.get('/:title', authenticateToken, getCycleCountTaskByTitle);

export default router;

