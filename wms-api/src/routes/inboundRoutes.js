// wms-api/src/routes/inboundRoutes.js
// Inbound session routes

import express from 'express';
import { receiveLines, updateInboundSession, completeInboundSession, getInboundSessions, createUnloadLine } from '../modules/inbound/inboundController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/inbound/sessions - Get all inbound sessions
router.get('/sessions', authenticateToken, getInboundSessions);

// POST /api/inbound/receive-lines - Create/update receive lines (batch)
router.post('/receive-lines', authenticateToken, receiveLines);

// POST /api/inbound/unload-line - Create/update unload line
router.post('/unload-line', authenticateToken, createUnloadLine);

// POST /api/inbound/update - Update inbound session (creates if doesn't exist)
router.post('/update', authenticateToken, updateInboundSession);

// POST /api/inbound/complete - Complete inbound session
router.post('/complete', authenticateToken, completeInboundSession);

export default router;

