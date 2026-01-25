/**
 * scanNormalize.js
 * Utility to normalize and validate carton IDs
 * Enforces CTN-* format and rejects old TI-PUT-* and PUT-* formats
 */

/**
 * Normalize carton ID or box ID
 * - Rejects old formats (TI-PUT-*, PUT-*)
 * - Accepts CTN-* format (for carton IDs)
 * - Accepts PAW-ASN-* format (for ASN box IDs)
 * - Accepts BOX-* format (for ASN box IDs created by box API)
 * - Returns normalized carton_id and box_id
 * 
 * @param {string} raw - Raw carton ID or box ID from scan/input
 * @param {boolean} allowAsnBoxId - If true, allow PAW-ASN-* and BOX-* formats (for ASN putaway)
 * @returns {Object} { ok: boolean, reason?: string, carton_id?: string, box_id?: string }
 */
export function normalizeCartonId(raw, allowAsnBoxId = false) {
  if (!raw) {
    return { ok: false, reason: "EMPTY" };
  }

  const v = String(raw).trim().toUpperCase();

  // Reject old formats that should not be used for putaway
  if (v.startsWith("TI-PUT-") || v.startsWith("PUT-")) {
    return { 
      ok: false, 
      reason: "PUTAWAY_REQUIRES_CARTON_ID",
      message: "Putaway requires carton ID (CTN-* format). Old format (TI-PUT-* or PUT-*) is no longer supported."
    };
  }

  // For ASN putaway: Accept PAW-ASN-* format as box_id (not carton_id)
  // Handle both "PAW-ASN" (without dash) and "PAW-ASN-" (with dash) formats
  if (allowAsnBoxId && v.startsWith("PAW-ASN")) {
    // For ASN: box_id = PAW-ASN-*, carton_id = null (will be looked up from tabSortBox)
    // Normalize format: ensure consistent format (PAW-ASN123 -> PAW-ASN-123 if needed)
    let normalizedBoxId = v;
    // If format is PAW-ASN123 (without dash after ASN), keep as-is (database might have this format)
    // If format is PAW-ASN-123 (with dash), keep as-is
    // Both formats are valid for ASN box IDs
    return { 
      ok: true, 
      carton_id: null, // ASN box_id is not a carton_id
      box_id: normalizedBoxId 
    };
  }

  // For ASN putaway: Accept BOX-* format as box_id (created by /api/boxes/create)
  // Format: BOX-{STORE}-{TIMESTAMP} or BOX-ASN-{NUMBER}-{SEQUENCE}
  if (allowAsnBoxId && v.startsWith("BOX-")) {
    // For ASN: box_id = BOX-*, carton_id = null (will be looked up from tabSortBox)
    return { 
      ok: true, 
      carton_id: null, // ASN box_id is not a carton_id
      box_id: v 
    };
  }

  // Enforce carton format - must start with CTN-
  if (!v.startsWith("CTN-")) {
    return { 
      ok: false, 
      reason: "INVALID_CARTON_FORMAT",
      message: `Carton ID must start with "CTN-". Received: ${v}. For ASN putaway, use box_id (BOX-* or PAW-ASN-* format) instead of carton_id.`
    };
  }

  // For putaway: box_id = carton_id (always for CTN-* format)
  return { 
    ok: true, 
    carton_id: v, 
    box_id: v 
  };
}

/**
 * Normalize box ID for putaway
 * Same as normalizeCartonId - enforces CTN-* format
 * 
 * @param {string} raw - Raw box ID from scan/input
 * @returns {Object} { ok: boolean, reason?: string, box_id?: string, carton_id?: string }
 */
export function normalizeBoxId(raw) {
  return normalizeCartonId(raw);
}

/**
 * Strip item code suffix from carton ID
 * Handles format: "CTN-TI-123457-20260120-2146: SKU-HAT-301-BLU-OS"
 * Returns: "CTN-TI-123457-20260120-2146"
 * 
 * @param {string} cartonId - Carton ID that may have item code appended
 * @returns {string} Cleaned carton ID without item code
 */
export function stripItemCodeFromCartonId(cartonId) {
  if (!cartonId) return cartonId;
  
  // Split by colon and take first part
  const parts = String(cartonId).split(':');
  return parts[0].trim();
}

/**
 * Validate and normalize for putaway operations
 * Combines validation and normalization
 * 
 * @param {string} raw - Raw input from scan
 * @param {string} operation - Operation type: "putaway", "receiving", "relocation"
 * @param {boolean} allowAsnBoxId - If true, allow PAW-ASN-* format (for ASN putaway)
 * @returns {Object} { ok: boolean, reason?: string, carton_id?: string, box_id?: string }
 */
export function validateForPutaway(raw, allowAsnBoxId = false) {
  const normalized = normalizeCartonId(raw, allowAsnBoxId);
  
  if (!normalized.ok) {
    return normalized;
  }

  // Additional validation for putaway
  const cartonId = normalized.carton_id;
  const boxId = normalized.box_id;
  
  // For CTN-* format: check minimum length
  if (cartonId && cartonId.length < 8) {
    return {
      ok: false,
      reason: "INVALID_CARTON_FORMAT",
      message: `Carton ID is too short: ${cartonId}`
    };
  }
  
  // For PAW-ASN-* format: check minimum length
  if (!cartonId && boxId && boxId.length < 8) {
    return {
      ok: false,
      reason: "INVALID_BOX_FORMAT",
      message: `Box ID is too short: ${boxId}`
    };
  }

  return normalized;
}
