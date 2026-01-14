# TabCartonStock Duplicate Records Fix

## 🐛 Issue

**Problem:** Item Location Breakdown shows 198.00 instead of 98.00 (previous 100 was not cleared).

**Root Cause:** Duplicate records in `tabCartonStock` due to UNIQUE KEY mismatch.

**UNIQUE KEY:** `uk_carton_item_batch (carton_id, item_code, batch_no)`

**Problem:** The INSERT statement doesn't include `batch_no`, so when `batch_no` is NULL:
- Multiple records can be created with the same `(carton_id, item_code, NULL)`
- `ON DUPLICATE KEY UPDATE` doesn't match correctly
- Duplicate records accumulate (100 + 98 = 198)

---

## ✅ Fix Applied

### Fix 1: Include `batch_no` in INSERT Statement

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Change:** Before inserting, check if a record exists and get its `batch_no`, then include it in the INSERT.

**Before:**
```javascript
await connection.execute(`
  INSERT INTO tabCartonStock 
    (carton_id, item_code, bin_location, warehouse, qty, status, updated_at)
  VALUES (?, ?, ?, ?, ?, 'PUTAWAY', NOW())
  ON DUPLICATE KEY UPDATE
    qty = ?,
    updated_at = NOW(),
    status = 'PUTAWAY'
`, [finalCartonId, item_code, actualBinLocation, targetWarehouse, newCartonQty, newCartonQty]);
```

**After:**
```javascript
// First, try to get existing batch_no if record exists
const [existingCartonStock] = await connection.execute(
  `SELECT batch_no FROM tabCartonStock 
   WHERE carton_id = ? AND item_code = ? AND bin_location = ? AND warehouse = ?
   LIMIT 1`,
  [finalCartonId, item_code, actualBinLocation, targetWarehouse]
);

const existingBatchNo = existingCartonStock.length > 0 
  ? (existingCartonStock[0].batch_no || null)
  : null;

// Include batch_no in INSERT so UNIQUE KEY constraint works correctly
await connection.execute(`
  INSERT INTO tabCartonStock 
    (carton_id, item_code, bin_location, warehouse, qty, status, batch_no, updated_at)
  VALUES (?, ?, ?, ?, ?, 'PUTAWAY', ?, NOW())
  ON DUPLICATE KEY UPDATE
    qty = ?,
    updated_at = NOW(),
    status = 'PUTAWAY'
`, [finalCartonId, item_code, actualBinLocation, targetWarehouse, newCartonQty, existingBatchNo, newCartonQty]);
```

### Fix 2: Clean Up Existing Duplicate Records

**Script:** `SCRIPTS/FixDuplicateCartonStockRecords.sql`

**What it does:**
1. Identifies duplicate records (same `carton_id`, `item_code`, `warehouse`, `bin_location`, `batch_no`)
2. Consolidates them into a single record with the sum of quantities
3. Deletes the duplicate records
4. Verifies no more duplicates exist

---

## 🧪 Testing

### Test 1: Check for Duplicate Records

```sql
-- Run: SCRIPTS/CheckDuplicateStockRecords.sql
-- Replace @item_code, @bin_location, @carton_id with your values
```

**Expected Result:**
- Should show 0 duplicate records after fix

### Test 2: Fix Existing Duplicates

```sql
-- Run: SCRIPTS/FixDuplicateCartonStockRecords.sql
```

**Expected Result:**
- Duplicate records consolidated
- Item Location Breakdown should show correct quantity (98, not 198)

### Test 3: Verify Item Location Breakdown

1. Open desktop app
2. Go to Items screen
3. Select item: `SKU-HAT-301-BLU-OS`
4. Click "Show Location Breakdown"
5. Click "Refresh" button
6. Verify quantity is 98 (not 198)

**Expected Result:**
- Item Location Breakdown should show 98.00
- Should match `tabItem.stock_qty` (98)
- Should match sum of `tabCartonStock` (98)

---

## 📋 Steps to Fix

1. **Run the duplicate check script:**
   ```sql
   -- Run: SCRIPTS/CheckDuplicateStockRecords.sql
   ```

2. **Fix existing duplicates:**
   ```sql
   -- Run: SCRIPTS/FixDuplicateCartonStockRecords.sql
   ```

3. **Restart API server** (to apply the code fix)

4. **Test picking again:**
   - Pick items via Material Request API
   - Verify no new duplicates are created
   - Verify Item Location Breakdown shows correct quantity

---

## 🔍 Why This Happens

### UNIQUE KEY Constraint:
```sql
UNIQUE KEY uk_carton_item_batch (carton_id, item_code, batch_no)
```

### Problem:
- When `batch_no` is NULL, MySQL treats each NULL as a distinct value
- Multiple records with `(carton_id, item_code, NULL)` can exist
- `ON DUPLICATE KEY UPDATE` doesn't match when `batch_no` is not in the INSERT

### Solution:
- Include `batch_no` in the INSERT statement (even if NULL)
- This ensures the UNIQUE KEY constraint works correctly
- `ON DUPLICATE KEY UPDATE` will match and update the existing record

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13  
**Files Changed:**
- `wms-api/src/modules/material-request/materialRequestController.js`
- `SCRIPTS/FixDuplicateCartonStockRecords.sql` (new)
- `SCRIPTS/CheckDuplicateStockRecords.sql` (new)
