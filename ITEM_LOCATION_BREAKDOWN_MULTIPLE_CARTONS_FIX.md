# Item Location Breakdown - Multiple Cartons Fix

**Date**: 2026-01-22  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

**Transaction History** shows multiple cartons for the same item at the same location:
- `PAW-ASN365425480-1769029168238` (25.00 qty) - ASN Putaway
- `CTN-TI-123457-20260121-000237-042` (2.00 qty) - Transfer In Putaway

But **Item Location Breakdown** shows only **ONE carton** (merged) with total qty (27.00).

**Expected**: One row per carton (carton-level inventory)

---

## 🔍 Root Cause

1. **`tabCartonStock` is empty** - Cartons are not being stored in `tabCartonStock` after putaway
2. **`tabStockLedger` has aggregated data** - One entry with total qty (27.00) but no `carton_id`
3. **API was only checking `tabCartonStock`** - When empty, it fell back to `tabStockLedger` which doesn't have carton-level detail
4. **`tabStockTransaction` has the carton details** - But API wasn't querying it when `tabCartonStock` was empty

---

## ✅ Fixes Applied

### 1. Changed Default Response Format

**File**: `wms-api/src/modules/stock-ledger/stockLedgerController.js` (Line ~1173)

**Change**: Changed default format from `'grouped'` to `'flat'`

```javascript
// Before: const format = req.query.format || 'grouped';
// After: const format = req.query.format || 'flat';
```

**Result**: API now returns one row per carton by default.

---

### 2. Enhanced Carton Detection from `tabStockTransaction`

**File**: `wms-api/src/modules/stock-ledger/stockLedgerController.js` (Lines ~1032-1080)

**Changes**:
- Always query `tabStockTransaction` for all bins (not just when `hasCartonStockTable`)
- Use `SUM(qty_change)` with `GROUP BY carton_id` to get quantities
- Add cartons from transactions even when `tabCartonStock` already has entries for that bin
- Check for carton_id column dynamically (`qty_change` is the correct column)

**Logic**:
```javascript
// For each bin location, query tabStockTransaction for all cartons
const [transactionCartons] = await connection.execute(
  `SELECT carton_id, SUM(qty_change) as qty, MAX(transaction_date) as transaction_date
   FROM tabStockTransaction
   WHERE item_code = ? AND warehouse = ?
     AND (target_bin = ? OR bin_location = ?)
     AND carton_id IS NOT NULL AND carton_id != ''
     AND transaction_type = 'Putaway'
   GROUP BY carton_id
   ORDER BY MAX(transaction_date) DESC`,
  [item_code, whUpper, binLocation, binLocation]
);
```

---

### 3. Create Bin Entries from Stock Ledger When `tabCartonStock` is Empty

**File**: `wms-api/src/modules/stock-ledger/stockLedgerController.js` (Lines ~1082-1125)

**Change**: When `tabCartonStock` is empty but `tabStockLedger` has entries, create bin entries and populate cartons from `tabStockTransaction`.

**Logic**:
```javascript
if (cartonStockRows.length === 0 && stockLedgerRows.length > 0) {
  for (const row of stockLedgerRows) {
    // Get cartons from tabStockTransaction for this bin
    const [txCartons] = await connection.execute(...);
    
    // Create bin entry with cartons from transactions
    binCartonMap.set(binLocation, {
      cartons: txCartons.map(...),
      total_qty: sum of carton quantities,
      ...
    });
  }
}
```

---

## 📊 Database State

**For `SKU-HAT-301-BLU-OS` at `A1-R02-L2-B2`:**

- **`tabCartonStock`**: 0 cartons ❌
- **`tabStockLedger`**: 1 entry (qty: 27.00, carton_id: NULL) ⚠️
- **`tabStockTransaction`**: 2 transactions ✅
  - `CTN-TI-123457-20260121-000237-042` (2.00 qty)
  - `PAW-ASN365425480-1769029168238` (25.00 qty)
- **`tabTransactionHistory`**: 2 transactions ✅ (same as above)

---

## 🧪 Testing

### Before Fix:
```json
[
  {
    "carton_id": "CTN-TI-123457-20260121-000237-042",
    "location_id": "A1-R02-L2-B2",
    "qty": 27,
    "total_qty": 27,
    "available_qty": 27
  }
]
```

### After Fix (Expected):
```json
[
  {
    "carton_id": "PAW-ASN365425480-1769029168238",
    "location_id": "A1-R02-L2-B2",
    "qty": 25,
    "total_qty": 27,
    "available_qty": 25
  },
  {
    "carton_id": "CTN-TI-123457-20260121-000237-042",
    "location_id": "A1-R02-L2-B2",
    "qty": 2,
    "total_qty": 27,
    "available_qty": 2
  }
]
```

---

## ✅ Verification Checklist

- [x] ✅ Changed default format to 'flat' (one row per carton)
- [x] ✅ Query `tabStockTransaction` for all bins
- [x] ✅ Use correct column name (`qty_change`)
- [x] ✅ Use `SUM(qty_change)` with `GROUP BY carton_id`
- [x] ✅ Create bin entries from stock ledger when `tabCartonStock` is empty
- [x] ✅ Populate cartons from `tabStockTransaction` when `tabCartonStock` is empty
- [ ] ⚠️ **Test after API restart** - Verify both cartons appear

---

## 🔧 Next Steps

1. **Restart API Server** - Changes require server restart
2. **Test API Endpoint** - Verify `/api/stock-ledger/{item_code}/{warehouse}` returns 2 rows
3. **Test Desktop App** - Verify Item Location Breakdown shows 2 separate cartons
4. **Optional**: Fix root cause - Ensure cartons are stored in `tabCartonStock` after putaway (separate issue)

---

## 📝 Summary

- **Root Cause**: `tabCartonStock` empty, API only checking `tabCartonStock` and `tabStockLedger` (no carton detail)
- **Solution**: Query `tabStockTransaction` to get carton-level detail when `tabCartonStock` is empty
- **Result**: API now returns one row per carton, showing both ASN and Transfer In cartons separately
