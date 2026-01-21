# DESKTOP FIX.md Compliance Review

**Date**: 2026-01-16  
**File Reviewed**: `d:\DESKTOP FIX.md`

---

## Issue A: Audit Trail (Transaction History) - Bin Location Missing

### ✅ Status: **COMPLIANT**

**Requirement from DESKTOP FIX.md:**
> When inserting history rows for CARTON_MERGE / CARTON_SPLIT / CARTON_RELOCATION:
> - ALWAYS populate: `bin_location` (final location after operation)

**Current Implementation:**

1. **CARTON_MERGE** (`commitFullCartonMove`, lines ~2069-2071):
   ```javascript
   if (hasBinLocation) {
     txnFields.push('bin_location');
     txnValues.push(session.to_bin); // Destination bin where carton ends up ✅
   }
   ```

2. **CARTON_RELOCATION** (`commitFullCartonMove`, lines ~2211-2214):
   ```javascript
   if (hasBinLocation) {
     txnFields.push('bin_location');
     txnValues.push(session.to_bin); // Destination bin where carton ends up ✅
   }
   ```

3. **PARTIAL_RELOCATION** (`commitPartialMove`, lines ~2850-2852):
   ```javascript
   } else if (hasBinLocation) {
     txnFields.push('bin_location');
     txnValues.push(displayBin); // Use destination bin for display ✅
   }
   ```

**Result:** ✅ `bin_location` is being set correctly for all relocation transaction types.

**Additional Fields Set (per DESKTOP FIX.md):**
- ✅ `from_bin` and `to_bin` (if columns exist) - Lines ~2075-2081, ~2217-2223
- ✅ `source_bin` and `target_bin` (fallback) - Lines ~2078-2080, ~2220-2222
- ✅ `carton_id` - Lines ~2083-2086, ~2225-2228, ~2855-2858
- ✅ `warehouse` (from actual carton stock, not DEFAULT) - Lines ~2043-2058, ~2186-2187
- ✅ `transaction_date` - Lines ~2023-2026, ~2168-2171

---

## Issue B: Stock Ledger - Qty Showing 0

### ⚠️ Status: **PARTIALLY COMPLIANT** (Needs Verification)

**Requirement from DESKTOP FIX.md:**
> Update stock ledger update logic so:
> - `quantity = SUM(qty)` (or same as available_qty if reserved not used)
> - `available_qty = quantity - reserved_qty`

**Current Implementation:**

1. **Stock Ledger Updates** (All commit endpoints):
   - ✅ Setting `qty` field correctly (lines 1542, 1570, 1874, 1934, 2735, 2765)
   - ⚠️ **NOT explicitly setting `available_qty`** - relies on database default/trigger or separate calculation

2. **Fields Being Set:**
   ```javascript
   // CARTON_MERGE (line 1570)
   INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, ...)
   VALUES (?, ?, ?, ?, ?, ...)
   ON DUPLICATE KEY UPDATE qty = ?, ...

   // CARTON_RELOCATION (line 1934)
   INSERT INTO tabStockLedger (${insertFields}) // includes qty
   VALUES (${insertValues})
   ON DUPLICATE KEY UPDATE ${updateFields} // includes qty = ?

   // PARTIAL_RELOCATION (line 2765)
   INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, ...)
   VALUES (?, ?, ?, ?, ?, ...)
   ON DUPLICATE KEY UPDATE qty = ?, ...
   ```

**Issue:**
- `qty` is being set correctly ✅
- `available_qty` is **NOT being explicitly calculated** in the INSERT/UPDATE statements ⚠️
- The DESKTOP FIX.md suggests: `available_qty = qty - reserved_qty`

**Verification Needed:**
1. Check if `tabStockLedger` has `available_qty` column
2. Check if `available_qty` is auto-calculated (database trigger/view) or if it needs to be explicitly set
3. Check stock ledger API response to see if `quantity` field maps to `qty` or a different field

**Recommended Fix (if `available_qty` column exists):**
```javascript
// Calculate available_qty explicitly
const availableQty = updatedNewBinQty - newBinReservedQty;

// Include in INSERT/UPDATE
INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, available_qty, ...)
VALUES (?, ?, ?, ?, ?, ?, ...)
ON DUPLICATE KEY UPDATE 
  qty = ?,
  available_qty = ? - reserved_qty,  // Recalculate available_qty
  ...
```

---

## Summary

### ✅ Issue A: COMPLIANT
- Transaction history `bin_location` is being set correctly for all relocation types
- `from_bin`, `to_bin`, `carton_id`, `warehouse` are also populated correctly

### ⚠️ Issue B: NEEDS VERIFICATION
- `qty` is being set correctly in stock ledger
- `available_qty` is **not explicitly calculated** in code (may be auto-calculated by database)
- **Action Required**: Verify if `available_qty` needs to be explicitly set or if it's auto-calculated

---

## Next Steps

1. **Verify Stock Ledger Schema:**
   - Check if `tabStockLedger` has `available_qty` column
   - Check if there's a database trigger/view that calculates `available_qty`
   - Check stock ledger API response format

2. **If `available_qty` needs explicit calculation:**
   - Update all stock ledger INSERT/UPDATE statements to calculate `available_qty = qty - reserved_qty`
   - Apply to `commitFullCartonMove` and `commitPartialMove`

3. **Test:**
   - Perform relocation operations
   - Verify transaction history shows `bin_location` ✅ (already compliant)
   - Verify stock ledger shows `quantity` > 0 (verify current behavior)
   - Verify stock ledger shows `available_qty` correctly (needs verification)

---

## Files to Check

1. **Stock Ledger API:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`
   - Check how it returns `quantity` vs `available_qty`
   - Check if there's any calculation or mapping

2. **Database Schema:**
   - Check `tabStockLedger` table structure
   - Check for triggers/views that calculate `available_qty`

---

**Current Status:**
- ✅ Issue A: Fully compliant
- ⚠️ Issue B: Needs verification (likely compliant if database auto-calculates `available_qty`)
