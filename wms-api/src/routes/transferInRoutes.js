// wms-api/src/routes/transferInRoutes.js
// Transfer In API routes

import express from "express";
import {
  getTransferIns,
  getTransferInByTitle,
  createTransferIn,
  submitTransferIn,
  receiveTransferInLine,
  updateTransferInLineCarton,
  markTransferInItemReceived,
  completeTransferInReceiving,
  getTransferInCartons,
  createOrSelectTransferInCarton,
  closeTransferInCarton,
  reopenTransferInCarton,
  getTransferInCartonLines,
  getTransferInPutawayBoxes,
  validateTransferInCarton,
} from "../modules/transfer-in/transferInController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// GET /api/transfer-in - Get all Transfer In documents
router.get("/", authenticateToken, getTransferIns);

// POST /api/transfer-in - Create a new Transfer In document
router.post("/", authenticateToken, createTransferIn);

// POST /api/transfer-in/:title/submit - Submit Transfer In (Draft → Submitted)
// NOTE: More specific routes must be defined BEFORE the general /:title route
router.post("/:title/submit", authenticateToken, submitTransferIn);

// POST /api/transfer-in/:title/receive-line - Receive items (cartonized or loose)
// NOTE: More specific routes must be defined BEFORE the general /:title route
router.post("/:title/receive-line", authenticateToken, receiveTransferInLine);

// POST /api/transfer-in/:title/update-line-carton - Update carton_id for a line
// NOTE: More specific routes must be defined BEFORE the general /:title route
router.post("/:title/update-line-carton", authenticateToken, updateTransferInLineCarton);

// POST /api/transfer-in/:title/validate-carton - Validate carton and get box_id for putaway
// NOTE: More specific routes must be defined BEFORE the general /:title route
router.post("/:title/validate-carton", authenticateToken, validateTransferInCarton);

// POST /api/transfer-in/:title/mark-received - Mark item(s) as Received
// NOTE: More specific routes must be defined BEFORE the general /:title route
router.post("/:title/mark-received", authenticateToken, markTransferInItemReceived);

// POST /api/transfer-in/:title/complete-receiving - Complete Transfer In receiving
// NOTE: More specific routes must be defined BEFORE the general /:title route
router.post("/:title/complete-receiving", authenticateToken, completeTransferInReceiving);

// GET /api/transfer-in/:title/cartons - Get all cartons for Transfer In
router.get("/:title/cartons", authenticateToken, getTransferInCartons);

// POST /api/transfer-in/:title/cartons - Create or select carton
router.post("/:title/cartons", authenticateToken, createOrSelectTransferInCarton);

// GET /api/transfer-in/:title/putaway-boxes - Get putaway boxes for Transfer In
router.get("/:title/putaway-boxes", authenticateToken, getTransferInPutawayBoxes);

// GET /api/transfer-in/:title/cartons/:carton_id/lines - Get carton lines
router.get("/:title/cartons/:carton_id/lines", authenticateToken, getTransferInCartonLines);

// POST /api/transfer-in/:title/cartons/:carton_id/close - Close carton
router.post("/:title/cartons/:carton_id/close", authenticateToken, closeTransferInCarton);

// POST /api/transfer-in/:title/cartons/:carton_id/reopen - Reopen carton
router.post("/:title/cartons/:carton_id/reopen", authenticateToken, reopenTransferInCarton);

// GET /api/transfer-in/:title - Get a single Transfer In document
// NOTE: This general route must be defined AFTER more specific routes
router.get("/:title", authenticateToken, getTransferInByTitle);

export default router;
