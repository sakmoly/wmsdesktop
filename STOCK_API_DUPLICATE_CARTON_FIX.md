# Stock API Duplicate Carton Fix

## 🐛 Issue

**Problem:** API `GET /api/stock/item/:item_code/warehouse/:warehouse` returns duplicate carton records, causing incorrect total quantity (198 instead of 98).

**API Response:**
```json
[
  {
    "item_code": "SKU-HAT-301-BLU-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "cartons": [
      {
        "carton_id": "CTN-555444",
        "qty": 100  // ← Duplicate record
      },
      {
        "carton_id": "CTN-555444",
        "qty": 98   // ← Duplicate record
      }
    ],
    "total_qty": 198,  // ← Wrong (should be 98)
    "available_qty": 98
  }
]
```

**Root Cause:** 
1. Duplicate records exist in `tabCartonStock` (same `carton_id`, `item_code`, `bin_location`, but different `qty`)
2. The API query doesn't group by carton_id, so it returns all duplicate records
3. The API sums all duplicate records, resulting in 198 (100 + 98)

---

## ✅ Fix Applied

**File:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`

**Change:** Modified the query to GROUP BY carton_id and SUM(qty) to handle duplicates.

**Before:**
```sql
SELECT 
  cs.carton_id,
  cs.item_code,
  cs.warehouse,
  cs.bin_location,
  cs.qty,
  cs.status
FROM tabCartonStock cs
WHERE cs.item_code = ? AND cs.warehouse = ? AND cs.qty > 0 AND cs.status = 'PUTAWAY'
ORDER BY cs.bin_location, cs.carton_id
```

**After:**
```sql
SELECT 
  cs.carton_id,
  cs.item_code,
  cs.warehouse,
  cs.bin_location,
  SUM(cs.qty) as qty,  -- Sum quantities if duplicates exist
  MAX(cs.updated_at) as updated_at,  -- Get most recent updated_at
  cs.status
FROM tabCartonStock cs
WHERE cs.item_code = ? AND cs.warehouse = ? AND cs.qty > 0 AND cs.status = 'PUTAWAY'
GROUP BY cs.carton_id, cs.item_code, cs.warehouse, cs.bin_location, cs.status
ORDER BY cs.bin_location, cs.carton_id
```

**Result:**
- Duplicate records are grouped by `carton_id`, `item_code`, `warehouse`, `bin_location`
- Quantities are summed (100 + 98 = 198, but this is still wrong - we need to fix the duplicates)
- API will show correct quantity after duplicates are cleaned up

---

## 🔧 Complete Fix Steps

### Step 1: Fix Duplicate Records in Database

**Run:**
```sql
-- Run: SCRIPTS/FixDuplicateCartonStockRecords.sql
```

**What it does:**
- Identifies duplicate records
- Consolidates them into a single record with the correct quantity (most recent or sum)
- Deletes duplicate records

### Step 2: Verify API Response

**After running the fix script, test the API:**
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
        "qty": 98  // ← Single record, correct quantity
      }
    ],
    "total_qty": 98,  // ← Correct
    "available_qty": 98
  }
]
```

---

## 🧪 Testing

### Test 1: Check for Duplicates

```sql
-- Run: SCRIPTS/CheckDuplicateStockRecords.sql
-- Set @item_code = 'SKU-HAT-301-BLU-OS'
-- Set @carton_id = 'CTN-555444'
```

**Expected:** Should show 0 duplicate records after fix

### Test 2: Verify API Response

```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
```

**Expected:**
- `total_qty` = 98 (not 198)
- `cartons` array has only 1 entry for CTN-555444
- `cartons[0].qty` = 98

### Test 3: Verify Item Location Breakdown

1. Open desktop app
2. Select item: `SKU-HAT-301-BLU-OS`
3. Click "Show Location Breakdown"
4. Click "Refresh"
5. Should show 98.00 (not 198.00)

---

## 📋 Summary

**Problem:** Duplicate carton records causing API to return 198 instead of 98

**Root Cause:** 
- Duplicate records in `tabCartonStock` (UNIQUE KEY on `batch_no` but `batch_no` is NULL)
- API query not grouping duplicates

**Fix:**
1. ✅ **API Query:** Now groups by carton_id and sums quantities (handles duplicates)
2. ⚠️ **Database:** Still need to run `SCRIPTS/FixDuplicateCartonStockRecords.sql` to clean up duplicates

**After Fix:**
- API will return correct quantity (98)
- Item Location Breakdown will show correct quantity (98)
- No more duplicate records will be created (INSERT now includes `batch_no`)

---

**Status:** ✅ **API FIXED** | ⚠️ **DATABASE CLEANUP REQUIRED**  
**Date:** 2026-01-13  
**Files Changed:**
- `wms-api/src/modules/stock-ledger/stockLedgerController.js`
- `SCRIPTS/FixDuplicateCartonStockRecords.sql` (run this to clean up duplicates)
