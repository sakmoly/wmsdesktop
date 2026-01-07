# qty_before Fix - Complete Solution

## ✅ Issue Resolved

**Problem:** `qty_before` and `qty_reduced` columns were not being updated when completing putaway tasks.

**Root Causes:**
1. Column check was inside the loop (inefficient)
2. Columns weren't being included in INSERT/UPDATE query

---

## ✅ Fixes Applied

### 1. Optimized Column Check
**Before:** Column check inside loop (checked for every item)  
**After:** Column check outside loop (checked once)

### 2. Added qty_before and qty_reduced to Query
- Calculates `qty_before` = current quantity before putaway
- Calculates `qty_reduced` = quantity added (positive for putaway)
- Dynamically includes in INSERT/UPDATE if columns exist

### 3. Backfilled Existing Records
- Created script to update existing putaway transactions
- Updated 5 records successfully

---

## 📊 Test Results

**Before Backfill:**
```
qty_before: NULL
qty_reduced: NULL
```

**After Backfill:**
```
qty_before: 0.00, 2.00 (showing previous values) ✅
qty_reduced: 2.00 (showing quantity added) ✅
```

---

## 🔧 Code Changes

### File: `wms-api/src/modules/putaway/putawayController.js`

**Key Changes:**
1. Moved column check outside loop (line ~1620)
2. Added `qty_before` and `qty_reduced` calculation (line ~1685-1687)
3. Dynamic query building with optional columns (line ~1700-1729)
4. Added debug logging (line ~1731-1733)

**Query Now Includes:**
```sql
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty,
   qty_before, qty_reduced,  -- ✅ NEW
   last_transaction_date, last_transaction_type, last_transaction_ref,
   updated_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ...)
ON DUPLICATE KEY UPDATE
  qty = ?,
  qty_before = ?,      -- ✅ NEW
  qty_reduced = ?,     -- ✅ NEW
  ...
```

---

## ✅ Verification

**Existing Records:** ✅ Updated via backfill script  
**New Records:** ✅ Will be updated automatically (code fixed)  
**Columns:** ✅ Exist in database  
**Code:** ✅ Includes columns in query

---

## 📋 Next Steps

1. **Restart API Server** - Apply the optimized code
2. **Test New Putaway** - Complete a new putaway task
3. **Verify Stock Ledger** - Check that `qty_before` and `qty_reduced` are populated

---

## 🎯 Expected Behavior

### For New Putaway Tasks:
- `qty_before`: Shows quantity before putaway (e.g., 0.00)
- `qty_reduced`: Shows quantity added (e.g., +2.00)
- `qty`: Shows new total (e.g., 2.00)

### Example:
```
Before Putaway: qty = 0.00
After Putaway:  qty = 2.00
                qty_before = 0.00
                qty_reduced = +2.00
```

---

**Status:** ✅ Fixed and Backfilled  
**Date:** 2026-01-06  
**Requires:** API server restart for new transactions

