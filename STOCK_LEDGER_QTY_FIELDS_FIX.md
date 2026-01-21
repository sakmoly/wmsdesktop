# Stock Ledger Qty Fields Fix

**Date**: 2026-01-19  
**Issue**: "Qty" field and "Qty +/-" field values not updated in Stock Ledger view

---

## Problem

The Stock Ledger view was showing:
- **Quantity**: `0.00` (should show transaction quantity)
- **Qty Before**: Empty (should show stock before transaction)
- **Qty +/-**: Empty (should show change amount)

**Root Cause:**
The `processPutawayCompletionEvent` function in `eventController.js` was updating stock ledger entries **without** including `qty_before` and `qty_reduced` fields. This caused:
1. `qty_before` and `qty_reduced` to be NULL in the database
2. Desktop app's transaction quantity calculation to return 0 (fallback when both fields are NULL)
3. Stock Ledger view to display empty/zero values

---

## Fix Applied

**File**: `wms-api/src/modules/events/eventController.js`

### Fix 1: Check for qty_before and qty_reduced Columns

**Change**: Added column existence check at the beginning of `processPutawayCompletionEvent`:

```javascript
// Check if qty_before and qty_reduced columns exist in tabStockLedger
const [stockLedgerColumns] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabStockLedger' 
  AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
`);
const hasQtyBefore = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_before');
const hasQtyReduced = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_reduced');
```

### Fix 2: Include qty_before and qty_reduced in FROM Location Update

**Change**: Modified stock ledger update for FROM location (staging) to include `qty_before` and `qty_reduced`:

```javascript
// Calculate qty_before and qty_reduced for FROM location (stock decrease)
const fromQtyBefore = fromCurrentQty;
const fromQtyReduced = -lineQty; // Negative for stock decrease

// Build INSERT/UPDATE query with optional qty_before and qty_reduced
let fromInsertFields = `item_code, warehouse, bin_location, qty, reserved_qty`;
let fromInsertValues = `?, ?, ?, ?, ?`;
let fromInsertParams = [itemCode, warehouse, fromLocation, fromNewQty, fromCurrentReservedQty];

let fromUpdateFields = `qty = ?`;
let fromUpdateParams = [fromNewQty];

if (hasQtyBefore) {
  fromInsertFields += `, qty_before`;
  fromInsertValues += `, ?`;
  fromInsertParams.push(fromQtyBefore);
  fromUpdateFields += `, qty_before = ?`;
  fromUpdateParams.push(fromQtyBefore);
}

if (hasQtyReduced) {
  fromInsertFields += `, qty_reduced`;
  fromInsertValues += `, ?`;
  fromInsertParams.push(fromQtyReduced);
  fromUpdateFields += `, qty_reduced = ?`;
  fromUpdateParams.push(fromQtyReduced);
}
```

### Fix 3: Include qty_before and qty_reduced in TO Location Update

**Change**: Modified stock ledger update for TO location (target bin) to include `qty_before` and `qty_reduced`:

```javascript
// Calculate qty_before and qty_reduced for TO location (stock increase)
const toQtyBefore = currentQty;
const toQtyReduced = lineQty; // Positive for stock increase

// Build INSERT/UPDATE query with optional qty_before and qty_reduced
let toInsertFields = `item_code, warehouse, bin_location, qty, reserved_qty`;
let toInsertValues = `?, ?, ?, ?, ?`;
let toInsertParams = [itemCode, warehouse, binLocation, newQty, currentReservedQty];

let toUpdateFields = `qty = ?`;
let toUpdateParams = [newQty];

if (hasQtyBefore) {
  toInsertFields += `, qty_before`;
  toInsertValues += `, ?`;
  toInsertParams.push(toQtyBefore);
  toUpdateFields += `, qty_before = ?`;
  toUpdateParams.push(toQtyBefore);
}

if (hasQtyReduced) {
  toInsertFields += `, qty_reduced`;
  toInsertValues += `, ?`;
  toInsertParams.push(toQtyReduced);
  toUpdateFields += `, qty_reduced = ?`;
  toUpdateParams.push(toQtyReduced);
}
```

---

## Expected Flow After Fix

1. **PUTAWAY_TO_RACK event received** with location and quantity
2. **`processPutawayCompletionEvent` processes event**:
   - Decreases stock at FROM location (staging):
     - `qty_before` = current stock before decrease
     - `qty_reduced` = **-lineQty** (negative for decrease)
   - Increases stock at TO location (target bin):
     - `qty_before` = current stock before increase
     - `qty_reduced` = **+lineQty** (positive for increase)
3. **Stock Ledger entries updated** with `qty_before` and `qty_reduced` ✅
4. **Desktop app calculates transaction quantity**:
   - Uses `qty_reduced` (absolute value) if available ✅
   - Falls back to `qty_before - remainingStock` if `qty_reduced` not available ✅
5. **Stock Ledger view displays**:
   - **Quantity**: Transaction quantity (e.g., `5.00`) ✅
   - **Qty Before**: Stock before transaction (e.g., `0.00` for new location) ✅
   - **Qty +/-**: Change amount (e.g., `+5.00` for putaway) ✅

---

## Field Values for Putaway

### TO Location (Target Bin) - Stock Increase

- **qty_before**: Stock at target bin before putaway (e.g., `0.00` if empty)
- **qty_reduced**: **+lineQty** (positive, e.g., `+5.00`)
- **qty**: Stock after putaway (e.g., `5.00`)
- **Transaction Qty**: `5.00` (absolute value of `qty_reduced`)

### FROM Location (Staging) - Stock Decrease

- **qty_before**: Stock at staging before putaway (e.g., `5.00`)
- **qty_reduced**: **-lineQty** (negative, e.g., `-5.00`)
- **qty**: Stock after putaway (e.g., `0.00`)
- **Transaction Qty**: `5.00` (absolute value of `qty_reduced`)

---

## Testing

### Test 1: Verify qty_before and qty_reduced in Database

**After PUTAWAY_TO_RACK event**, check database:

```sql
SELECT item_code, bin_location, qty, qty_before, qty_reduced, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND last_transaction_type = 'Putaway'
ORDER BY bin_location;
```

**Expected**:
- TO location (target bin): `qty_before` = 0 (or previous stock), `qty_reduced` = +5.00 (positive)
- FROM location (staging): `qty_before` = 5 (or previous stock), `qty_reduced` = -5.00 (negative)

---

### Test 2: Verify Stock Ledger View Display

**After fix**, check Stock Ledger view:

**Expected Display**:
- **Item Code**: SKU-HAT-301-GRN-OS
- **Bin Location**: A1-R02-L1-B2
- **Quantity**: `5.00` (transaction quantity) ✅
- **Available Qty**: `5.00` (remaining stock - reserved)
- **Qty Before**: `0.00` (stock before transaction) ✅
- **Qty +/-**: `5.00` (positive for putaway increase) ✅

---

## Status

✅ **Fixes Applied**

1. ✅ `processPutawayCompletionEvent` checks for `qty_before` and `qty_reduced` columns
2. ✅ `processPutawayCompletionEvent` includes `qty_before` and `qty_reduced` in FROM location update
3. ✅ `processPutawayCompletionEvent` includes `qty_before` and `qty_reduced` in TO location update
4. ✅ `qty_reduced` is positive for stock increase (putaway TO location)
5. ✅ `qty_reduced` is negative for stock decrease (putaway FROM location)

**Next Steps**:
1. Restart backend server
2. Test putaway completion
3. Verify Stock Ledger view shows correct values for:
   - Quantity (transaction qty)
   - Qty Before
   - Qty +/- (change amount)

---

## Related Issues

- This fix addresses the issue where "Qty field and Qty +/- field value not updated" in Stock Ledger view
- The root cause was missing `qty_before` and `qty_reduced` fields in `processPutawayCompletionEvent`
- The `/api/putaway/complete` endpoint already had this fix, but event-based processing was missing it
