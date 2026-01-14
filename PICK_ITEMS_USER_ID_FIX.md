# Pick Items API - user_id Fix

## Issue

**Error:** `normalizedCreatedBy is not defined`

**Root Cause:**
- The `pickMaterialRequestItems` function was using `normalizedCreatedBy` in the transaction log (line 1275)
- But `normalizedCreatedBy` was never defined in the function scope
- The function was not extracting `user_id` or `created_by` from the request body

---

## Fix Applied

### Updated `pickMaterialRequestItems` Function

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Changes:**
1. ✅ Extract `user_id` and `created_by` from request body
2. ✅ Normalize to `normalizedCreatedBy` (prefer `user_id`, fallback to `created_by`)
3. ✅ Validate that at least one is provided
4. ✅ Use `normalizedCreatedBy` consistently throughout the function

**Code Added:**
```javascript
export const pickMaterialRequestItems = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { items, warehouse, user_id, created_by } = req.body;
    
    // Normalize user_id/created_by (support both mobile and desktop app formats)
    const userId = user_id || created_by || null;
    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'user_id or created_by is required'
        }
      });
    }
    const normalizedCreatedBy = userId.trim();
    
    // ... rest of the function
```

---

## Request Body Format

### Mobile App Format (Preferred):
```json
{
  "items": [...],
  "warehouse": "WH-MAIN",
  "user_id": "USER-150526"
}
```

### Desktop App Format (Also Supported):
```json
{
  "items": [...],
  "warehouse": "WH-MAIN",
  "created_by": "USER-150526"
}
```

### Both Formats (Also Supported):
```json
{
  "items": [...],
  "warehouse": "WH-MAIN",
  "user_id": "USER-150526",
  "created_by": "USER-150526"
}
```

**Priority:** `user_id` is preferred, but `created_by` is accepted as fallback.

---

## Usage

### Transaction Log Entry:
The `normalizedCreatedBy` is now used in the `tabStockTransaction` INSERT:
```javascript
await connection.execute(`
  INSERT INTO tabStockTransaction 
    (transaction_date, transaction_type, reference_doc_type, reference_doc,
     item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
     source_bin, target_bin, performed_by, created_at)
  VALUES 
    (NOW(), 'Picking', 'Material Request', ?,
     ?, ?, ?, ?, ?, ?,
     ?, NULL, ?, NOW())
`, [
  title,
  item_code,
  targetWarehouse,
  source_bin,
  qtyReduced,
  qtyBefore,
  newQty,
  source_bin,
  normalizedCreatedBy || null // ← Now properly defined
]);
```

---

## Error Handling

### Missing user_id/created_by:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "user_id or created_by is required"
  }
}
```

---

## Testing

### Test 1: With user_id
```bash
POST /api/material-requests/MR-123460/pick-items
{
  "items": [...],
  "user_id": "USER-150526"
}
```
✅ Should work

### Test 2: With created_by
```bash
POST /api/material-requests/MR-123460/pick-items
{
  "items": [...],
  "created_by": "USER-150526"
}
```
✅ Should work

### Test 3: Without user_id/created_by
```bash
POST /api/material-requests/MR-123460/pick-items
{
  "items": [...]
}
```
❌ Should return validation error

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13
