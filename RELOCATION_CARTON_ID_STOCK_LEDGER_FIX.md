# Relocation Carton ID in Stock Ledger Fix

## Problem

After relocating a carton from one bin to another, the carton was not showing up in the Item Location Breakdown screen. The carton was moved correctly in `tabCartonStock`, but `tabStockLedger` was not being updated with the `carton_id`, causing the item location breakdown query to not properly associate the carton with the new bin location.

## Root Cause

When relocation updates `tabStockLedger` to reflect the stock movement:
1. ✅ It decreases stock at the old bin location
2. ✅ It increases stock at the new bin location
3. ❌ **It does NOT include `carton_id` in the INSERT/UPDATE statement**

The Item Location Breakdown query reads from both:
- `tabCartonStock` (has `carton_id`) - ✅ Updated correctly
- `tabStockLedger` (may have `carton_id` column) - ❌ Not updated with `carton_id`

When `tabStockLedger` doesn't have `carton_id`, the query can't properly match cartons to bin locations, causing the carton to not appear in the breakdown.

---

## Fix Applied

### 1. Updated `commitFullCartonMove` Function

**File:** `wms-api/src/modules/relocation/relocationController.js`

**Change:** Added `carton_id` to `tabStockLedger` INSERT/UPDATE when the column exists.

**Code Added:**
```javascript
// Check if carton_id column exists in tabStockLedger
const [stockLedgerCartonIdColumn] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabStockLedger' 
  AND COLUMN_NAME = 'carton_id'
`);
const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;

// Build INSERT/UPDATE query
let insertFields = 'item_code, warehouse, bin_location, qty, reserved_qty';
// ... other fields ...

// ✅ Include carton_id if column exists
if (hasStockLedgerCartonIdColumn && session.from_carton) {
  insertFields += ', carton_id';
  insertValues += ', ?';
  insertParams.push(session.from_carton);
  updateFields += ', carton_id = ?';
  updateParams.push(session.from_carton);
}
```

### 2. Updated `completeFullCartonRelocation` Function

**File:** `wms-api/src/modules/relocation/relocationController.js`

**Change:** Applied the same fix to the complete endpoint (which creates session and commits in one transaction).

---

## Impact

### Before Fix:
- Carton moved in `tabCartonStock` ✅
- Stock ledger updated at new bin ✅
- **But `carton_id` missing in `tabStockLedger`** ❌
- Item Location Breakdown shows carton at old location or doesn't show it ❌

### After Fix:
- Carton moved in `tabCartonStock` ✅
- Stock ledger updated at new bin ✅
- **`carton_id` included in `tabStockLedger`** ✅
- Item Location Breakdown shows carton at new location correctly ✅

---

## Database Tables Updated

### For FULL_CARTON Relocation:

1. ✅ `tabCarton.bin_id` / `current_bin_id` - Updated
2. ✅ `tabCartonStock.bin_location` - Updated (all items in carton)
3. ✅ **`tabStockLedger`** - Updated with:
   - Stock decrease at old bin
   - Stock increase at new bin
   - **`carton_id` (if column exists)** ✅ **NEW**
4. ✅ `tabStockTransaction` - Transaction history inserted

---

## Testing

### Test Scenario:
1. Carton `CTN-001` with item `SKU-001` (qty: 10) at bin `A1-R01-L3-B1`
2. Relocate carton to bin `A1-R01-L4-B1`
3. Check Item Location Breakdown for `SKU-001`

### Expected Result:
- Item Location Breakdown should show:
  - `A1-R01-L4-B1` with carton `CTN-001` (qty: 10) ✅
  - `A1-R01-L3-B1` should NOT show the carton (moved) ✅

### Verification Query:
```sql
-- Check tabStockLedger has carton_id
SELECT item_code, bin_location, carton_id, qty
FROM tabStockLedger
WHERE item_code = 'SKU-001'
  AND bin_location IN ('A1-R01-L3-B1', 'A1-R01-L4-B1');

-- Check tabCartonStock has correct bin_location
SELECT carton_id, item_code, bin_location, qty
FROM tabCartonStock
WHERE carton_id = 'CTN-001';
```

---

## Related Files

- `wms-api/src/modules/relocation/relocationController.js` - Relocation logic
- `wms-api/src/modules/stock-ledger/stockLedgerController.js` - Item Location Breakdown query
- `SCRIPTS/MIGRATION_007_STOCK_LEDGER_CARTON_LEVEL.sql` - Migration that adds `carton_id` to `tabStockLedger`

---

## Summary

**Problem:** Carton moves not showing in Item Location Breakdown

**Root Cause:** `tabStockLedger` not updated with `carton_id` during relocation

**Solution:** Include `carton_id` in `tabStockLedger` INSERT/UPDATE when column exists

**Result:** ✅ Cartons now appear correctly in Item Location Breakdown after relocation
