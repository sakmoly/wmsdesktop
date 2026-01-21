/**
 * Convert warehouse input to canonical WMS warehouse code used in DB.
 * Handles: "WH-Main", "wh-main", "Main Warehouse", etc.
 *
 * IMPORTANT: Adjust alias map to your real warehouses.
 */
export function normalizeWarehouse(rawWarehouse) {
  if (!rawWarehouse) return null;

  const original = String(rawWarehouse).trim();
  if (!original) return null;

  // If user already sends WH-* code, normalize casing only
  if (/^wh-?/i.test(original)) {
    // ensure WH-XXXX style
    return original.toUpperCase().replace(/^WH/, "WH").replace(/\s+/g, "");
  }

  // Remove spaces and make comparable key
  const key = original.toUpperCase().replace(/\s+/g, "");

  // ✅ Alias mapping (ADD YOUR REAL VALUES)
  const ALIASES = {
    "MAINWAREHOUSE": "WH-MAIN",
    "WHMAIN": "WH-MAIN",
    "WAREHOUSEMAIN": "WH-MAIN",
  };

  return ALIASES[key] || original; // fallback to original if unknown
}
