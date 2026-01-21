// wms-api/src/routes/inboundRoutes.js
// Inbound session routes

import express from 'express';
import { receiveLines, updateInboundSession, completeInboundSession, getInboundSessions, createUnloadLine } from '../modules/inbound/inboundController.js';
import { 
  startInboundSession, 
  generateCartonId, 
  validateCarton, 
  receiveItem, 
  completeInboundSession as completeUnifiedSession 
} from '../modules/inbound/unifiedInboundController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Unified Inbound APIs (new)
// POST /api/inbound/session/start - Start inbound session
router.post('/session/start', authenticateToken, startInboundSession);

// POST /api/inbound/carton/generate - Generate carton ID
router.post('/carton/generate', authenticateToken, generateCartonId);

// POST /api/inbound/carton/validate - Validate carton
router.post('/carton/validate', authenticateToken, validateCarton);

// POST /api/inbound/receive - Receive item (unified for ASN and Transfer In)
router.post('/receive', authenticateToken, receiveItem);

// POST /api/inbound/session/complete - Complete inbound session (creates putaway task)
router.post('/session/complete', authenticateToken, completeUnifiedSession);

// Legacy APIs (backward compatibility)
// GET /api/inbound/sessions - Get all inbound sessions
router.get('/sessions', authenticateToken, getInboundSessions);

// POST /api/inbound/receive-lines - Create/update receive lines (batch)
router.post('/receive-lines', authenticateToken, receiveLines);

// POST /api/inbound/unload-line - Create/update unload line
router.post('/unload-line', authenticateToken, createUnloadLine);

// POST /api/inbound/update - Update inbound session (creates if doesn't exist)
router.post('/update', authenticateToken, updateInboundSession);

// POST /api/inbound/complete - Complete inbound session (legacy)
router.post('/complete', authenticateToken, completeInboundSession);

export default router;

