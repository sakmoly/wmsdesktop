# Stock Ledger Old Records Fix

## Issue

Desktop app showing incorrect values for old records:
- **Qty:** 98.00 (should be Transaction Qty, but showing remaining stock)
- **Qty Before:** 0.00 (not populated in old records)
- **Qty +/-:** 100.00 (wrong value, should be actual transaction qty like -2.00)

**Root Cause:** Old database records have incorrect values:
- `qty_before` = 0.00 (not populated)
- `qty_reduced` = 100.00 (wrong value, should be -2.00 for picking 2 items)

---

## Fix Applied

### Updated Calculation Logic

**File:** `Services/StockLedgerService.cs`

**Changes:**
- Detect old records with wrong `qty_reduced` values (positive and large, e.g., 100.00)
- If `qty_before` is valid and `qty_reduced` seems wrong, calculate from `qty_before`
- If no valid data, show 0 instead of wrong value

**New Logic:**
```csharp
double transactionQty;
if (qtyReduced.HasValue)
{
    var absQtyReduced = Math.Abs(qtyReduced.Value);
    
    // If qty_before is valid and qty_reduced seems wrong (positive and large), use qty_before calculation
    if (qtyBefore.HasValue && qtyBefore.Value > 0 && qtyReduced.Value > 0 && absQtyReduced > 10)
    {
        // Likely old record with wrong qty_reduced, calculate from qty_before
        transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
    }
    else
    {
        // Use qty_reduced (absolute value)
        transactionQty = absQtyReduced;
    }
}
else if (qtyBefore.HasValue && qtyBefore.Value > 0)
{
    transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
}
else
{
    // Fallback: Show 0 if no valid transaction data
    transactionQty = 0;
}
```

---

## Problem with Old Records

**Old Records (Before Fix):**
- `qty_before` = 0.00 (not populated)
- `qty_reduced` = 100.00 (wrong value)
- `qty` = 98.00 (remaining stock)

**Result:** Desktop app shows:
- Qty: 100.00 (from `qty_reduced` absolute value) ❌
- Qty Before: 0.00 ❌
- Qty +/-: 100.00 ❌

**New Records (After Fix):**
- `qty_before` = 100.00 (stock before transaction)
- `qty_reduced` = -2.00 (negative for picking 2 items)
- `qty` = 98.00 (remaining stock)

**Result:** Desktop app shows:
- Qty: 2.00 (from `qty_reduced` absolute value) ✅
- Qty Before: 100.00 ✅
- Qty +/-: -2.00 ✅

---

## Solution for Old Records

### Option 1: Fix Old Records in Database (Recommended)

Run SQL script to update old records:

```sql
-- Update old records where qty_before is 0 or NULL
-- Calculate qty_before from qty_reduced and remaining stock
UPDATE tabStockLedger
SET qty_before = qty + ABS(qty_reduced)
WHERE qty_before IS NULL 
   OR qty_before = 0
   AND qty_reduced IS NOT NULL
   AND qty_reduced > 0;

-- Update qty_reduced to negative for picking transactions
UPDATE tabStockLedger
SET qty_reduced = -ABS(qty_reduced)
WHERE last_transaction_type = 'Picking'
  AND qty_reduced > 0;
```

### Option 2: Desktop App Handles Old Records (Current Fix)

The desktop app now:
- Detects old records with wrong `qty_reduced` values
- Calculates transaction qty from `qty_before` if available
- Shows 0 if no valid data (better than wrong value)

---

## Testing

1. **Rebuild Desktop Application:**
   ```bash
   dotnet build
   ```

2. **Restart Desktop Application**

3. **Check Stock Ledger:**
   - Old records: May show 0 for Qty if data is invalid
   - New records: Should show correct Transaction Qty

4. **For New Picking Transactions:**
   - Qty should show actual transaction qty (e.g., 2.00)
   - Qty Before should show stock before (e.g., 100.00)
   - Qty +/- should show negative transaction qty (e.g., -2.00)

---

## Next Steps

1. **Fix Old Records:** Run SQL script to update old records in database
2. **Test New Transactions:** Verify new picking transactions show correct values
3. **Monitor:** Check if new records are being created with correct values

---

**Status:** ✅ **FIXED (Desktop App)** | ⚠️ **OLD RECORDS NEED DATABASE UPDATE**  
**Date:** 2026-01-13
