# Stock API Duplicate Fix - Final

## 🐛 Issue

**Problem:** API still returns 198 instead of 98, even after grouping.

**Root Cause:** The API was using `SUM(qty)` which adds duplicate quantities (100 + 98 = 198). Instead, we should use the quantity from the **most recent record only**.

---

## ✅ Fix Applied

**File:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`

**Change:** Modified query to keep only the most recent record (by `id`) instead of summing duplicates.

**Before:**
```sql
SELECT 
  cs.carton_id,
  cs.item_code,
  cs.warehouse,
  cs.bin_location,
  SUM(cs.qty) as qty,  -- ❌ WRONG: Sums duplicates (100 + 98 = 198)
  MAX(cs.updated_at) as updated_at,
  cs.status
FROM tabCartonStock cs
WHERE cs.item_code = ? AND cs.warehouse = ? AND cs.qty > 0 AND cs.status = 'PUTAWAY'
GROUP BY cs.carton_id, cs.item_code, cs.warehouse, cs.bin_location, cs.status
```

**After:**
```sql
SELECT 
  cs.carton_id,
  cs.item_code,
  cs.warehouse,
  cs.bin_location,
  cs.qty,  -- ✅ CORRECT: Uses quantity from most recent record only (98)
  cs.updated_at,
  cs.status
FROM tabCartonStock cs
INNER JOIN (
  -- Get the most recent record for each carton_id+item_code+bin_location combination
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    MAX(id) as max_id  -- Keep the record with highest id (most recent)
  FROM tabCartonStock
  WHERE item_code = ? AND warehouse = ? AND qty > 0 AND status = 'PUTAWAY'
  GROUP BY carton_id, item_code, warehouse, bin_location
) latest
  ON cs.carton_id = latest.carton_id
  AND cs.item_code = latest.item_code
  AND cs.warehouse = latest.warehouse
  AND cs.bin_location = latest.bin_location
  AND cs.id = latest.max_id
WHERE cs.qty > 0 AND cs.status = 'PUTAWAY'
```

**Result:**
- Only the most recent record (highest `id`) is returned
- Quantity is 98 (from most recent record), not 198 (sum of duplicates)
- Duplicate records are ignored

---

## 🧪 Testing

### Test 1: Verify API Response

```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
```

**Expected Response:**
```json
[
  {
    "item_code": "SKU-HAT-301-BLU-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "cartons": [
      {
        "carton_id": "CTN-555444",
        "qty": 98  // ← Correct (from most recent record)
      }
    ],
    "total_qty": 98,  // ← Correct (not 198)
    "available_qty": 98
  }
]
```

### Test 2: Verify Database Still Has Duplicates

**Note:** The API now handles duplicates correctly, but you should still clean up the database:

```sql
-- Run: SCRIPTS/FixDuplicateCartonStockRecordsSimple.sql
```

This will remove duplicate records from the database permanently.

---

## 📋 Summary

**Problem:** API summing duplicate records (100 + 98 = 198)

**Solution:**
1. ✅ **API Query:** Now uses most recent record only (not sum)
2. ⚠️ **Database Cleanup:** Still recommended to run fix script

**After Fix:**
- API returns correct quantity (98) even if duplicates exist
- Database cleanup recommended for performance

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13  
**File Changed:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`
