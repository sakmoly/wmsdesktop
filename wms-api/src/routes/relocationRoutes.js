// wms-api/src/routes/relocationRoutes.js
// Relocation / Bin Transfer API routes

import express from 'express';
import {
  startRelocationSession,
  setRelocationFrom,
  setRelocationTo,
  getCartonContents,
  scanRelocationLine,
  editRelocationLine,
  commitFullCartonMove,
  commitPartialMove,
  getRelocationSession,
  listRelocationSessions,
  completeFullCartonRelocation,
  completePartialRelocation
} from '../modules/relocation/relocationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/relocation/carton/:carton_id/contents - Get carton contents (alias for /api/carton/:carton_id/contents)
// This is added for compatibility in case some clients call it from the relocation namespace
router.get('/carton/:carton_id/contents', authenticateToken, getCartonContents);

// GET /api/relocation/sessions - List all relocation sessions
router.get('/sessions', authenticateToken, listRelocationSessions);

// POST /api/relocation/session/start - Start relocation session
router.post('/session/start', authenticateToken, startRelocationSession);

// PUT /api/relocation/session/:session_id/from - Set FROM location
router.put('/session/:session_id/from', authenticateToken, setRelocationFrom);

// PUT /api/relocation/session/:session_id/to - Set TO location
router.put('/session/:session_id/to', authenticateToken, setRelocationTo);

// GET /api/relocation/session/:session_id - Get session details
router.get('/session/:session_id', authenticateToken, getRelocationSession);

// POST /api/relocation/session/:session_id/line-scan - Scan item (optional helper)
router.post('/session/:session_id/line-scan', authenticateToken, scanRelocationLine);

// PUT /api/relocation/session/:session_id/line - Edit line
router.put('/session/:session_id/line', authenticateToken, editRelocationLine);

// POST /api/relocation/session/:session_id/commit-full - Commit full carton move
router.post('/session/:session_id/commit-full', authenticateToken, commitFullCartonMove);

// POST /api/relocation/session/:session_id/commit-partial - Commit partial/carton-to-carton move
router.post('/session/:session_id/commit-partial', authenticateToken, commitPartialMove);

// POST /api/relocation/complete-full - Complete full carton relocation (create session + commit atomically)
// NEW ENDPOINT: Creates session with status COMPLETED (not IN_PROGRESS) and commits in one transaction
router.post('/complete-full', authenticateToken, completeFullCartonRelocation);

// POST /api/relocation/complete-partial - Complete partial/carton-to-carton relocation (create session + commit atomically)
// NEW ENDPOINT: Creates session with status COMPLETED (not IN_PROGRESS) and commits in one transaction
router.post('/complete-partial', authenticateToken, completePartialRelocation);

export default router;
