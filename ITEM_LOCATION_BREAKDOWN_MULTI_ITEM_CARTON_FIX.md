# Item Location Breakdown - Multi-Item Carton Fix

## Problem

**Issue:** The API response shows incorrect `total_qty` values (e.g., `total_qty: 20` when it should be `10`), and carton IDs may not match correctly when the same carton contains multiple items.

**Root Cause:** 
1. The query was grouping by `(carton_id, location_id)` but NOT by `item_code`
2. When the same carton contains multiple items at the same location, the query was picking the wrong item or aggregating incorrectly
3. `total_qty` was being added to instead of recalculated from carton quantities

## Solution

### 1. Include `item_code` in GROUP BY

**Critical:** A single carton can contain multiple items at the same location. The query must group by `(item_code, carton_id, location_id)` to get the correct quantity for each item.

**Before:**
```sql
GROUP BY carton_key, loc_key  -- ❌ Missing item_code
```

**After:**
```sql
GROUP BY item_code, carton_key, loc_key  -- ✅ Includes item_code
```

### 2. Recalculate `total_qty` from Carton Quantities

**Before:**
```javascript
binData.total_qty += roundedQty;  // ❌ Adds to existing total
```

**After:**
```javascript
// ✅ Recalculate total_qty as sum of all carton quantities
const calculatedTotalQty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
binData.total_qty = calculatedTotalQty;
```

## Changes Made

### File: `wms-api/src/modules/stock-ledger/stockLedgerController.js`

#### 1. All-Cartons Query (Lines 1122-1152)

**Added `item_code` to GROUP BY:**
```sql
SELECT 
  item_code,  -- ✅ Added
  COALESCE(carton_id, 'NO_CARTON') as carton_key,
  COALESCE(location_id, bin_location, target_bin) as loc_key,
  MAX(transaction_date) as max_date,
  MAX(id) as max_id
FROM tabTransactionHistory
WHERE item_code = ? AND warehouse = ? AND qty_after > 0
GROUP BY item_code, carton_key, loc_key  -- ✅ Added item_code
```

**Added `item_code` to JOIN condition:**
```sql
latest ON 
  th.item_code = latest.item_code  -- ✅ Added
  AND COALESCE(th.carton_id, 'NO_CARTON') = latest.carton_key
  AND COALESCE(th.location_id, th.bin_location, th.target_bin) = latest.loc_key
```

#### 2. Per-Bin Fallback Query (Lines 1260-1290)

**Same changes as above** - Added `item_code` to GROUP BY and JOIN condition.

#### 3. Total Qty Recalculation (Lines 1205-1235)

**Changed from adding to recalculating:**
```javascript
// Before: binData.total_qty += roundedQty;
// After: Recalculate as sum of all cartons
const calculatedTotalQty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
binData.total_qty = calculatedTotalQty;
```

## Why This Matters

### Example from Transaction History:

**Carton `CTN-TI-12345-20260` at `A1-R01-L3-B1` contains:**
- `SKU-HAT-301-BLU-OS`: 10 qty
- `SKU-HAT-301-GRN-OS`: 10 qty

**Without `item_code` in GROUP BY:**
- Query might pick the wrong item
- Or aggregate both items (20 total) ❌

**With `item_code` in GROUP BY:**
- Query correctly gets 10 qty for `SKU-HAT-301-BLU-OS` ✅
- Query correctly gets 10 qty for `SKU-HAT-301-GRN-OS` ✅

## Result

✅ **Carton quantities are now item-specific**
- Each carton's quantity is for the specific item being queried
- `total_qty` is recalculated as the sum of carton quantities
- No more double-counting or wrong item quantities

## Testing

### 1. Test with Multi-Item Carton

**Query:** `GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN?format=flat`

**Expected:**
- Carton `CTN-TI-12345-20260123-221416-647` at `A1-R01-L3-B1` shows `qty: 10` (not 20)
- `total_qty: 10` (not 20)
- Carton ID matches transaction history

### 2. Verify Transaction History

Check that the same carton with different items shows correct quantities:
```sql
SELECT item_code, carton_id, bin_location, qty_after
FROM tabTransactionHistory
WHERE carton_id = 'CTN-TI-12345-20260123-221416-647'
  AND bin_location = 'A1-R01-L3-B1'
ORDER BY item_code;
```

**Expected:** Different `item_code` values with their respective `qty_after` values.

## Summary

**Problem:** Query didn't filter by `item_code` when grouping cartons, causing wrong quantities for multi-item cartons.

**Solution:** 
1. Added `item_code` to GROUP BY clause
2. Added `item_code` to JOIN condition
3. Recalculate `total_qty` from carton quantities instead of adding

**Result:** ✅ Correct quantities per item, even when cartons contain multiple items.
