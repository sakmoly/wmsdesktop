// wms-api/src/routes/transferInRoutes.js
// Transfer In API routes

import express from "express";
import {
  getTransferIns,
  getTransferInByTitle,
  createTransferIn,
  submitTransferIn,
  receiveTransferInLine,
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

// GET /api/transfer-in/:title - Get a single Transfer In document
// NOTE: This general route must be defined AFTER more specific routes
router.get("/:title", authenticateToken, getTransferInByTitle);

export default router;
