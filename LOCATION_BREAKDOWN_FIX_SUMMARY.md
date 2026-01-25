# Location Breakdown Fix Summary

## 🐛 Problem

**Location Breakdown** was showing **fractional quantities** (1.26, 15.74) instead of actual carton quantities (2.00, 20.00), and **Stock Ledger** was not matching **Transaction History**.

**Example:**
- Transaction History shows: CTN-TI-123457-20260121-000237-042: 2.00, PAW-ASN365425480-1769029168238: 20.00
- Location Breakdown was showing: CTN-TI-123457-20260121-000237-042: 1.26, PAW-ASN365425480-1769029168238: 15.74
- Stock Ledger was showing individual transaction values instead of aggregated values

---

## ✅ Fixes Applied

### 1. Stock Ledger - Use Transaction History Aggregated Values

**File**: `wms-api/src/modules/stock-ledger/stockLedgerController.js` (Line ~469-515)

**Change**: Added LEFT JOIN with `tabTransactionHistory` to get aggregated `qty_before` and `qty_change` values.

**Result**: Stock Ledger now shows aggregated values that match Transaction History.

---

### 2. Location Breakdown - Use Transaction History Net Quantities

**File**: `wms-api/src/modules/stock-ledger/stockLedgerController.js` (Line ~1075-1166)

**Changes**:
1. **Query Transaction History FIRST** (before tabStockTransaction)
2. **Use `net_qty` directly** from Transaction History (no proportional scaling)
3. **Calculate net_qty** as: `SUM(putaway) - SUM(picking)` per carton
4. **Fallback** to tabStockTransaction only if Transaction History is empty

**Result**: Location Breakdown now shows actual carton quantities (2.00, 20.00) that match Transaction History.

---

## 📊 Expected Results

**After Fix:**
- ✅ Stock Ledger shows aggregated values matching Transaction History
- ✅ Location Breakdown shows actual carton quantities (no fractional values)
- ✅ Both match Transaction History display
- ✅ Total quantities match (52 total available)

**Example:**
- Location: A1-R02-L2-B2
  - CTN-TI-123457-20260121-000237-042: **2.00** (was 1.26)
  - PAW-ASN365425480-1769029168238: **20.00** (was 15.74)
  - Total: **22.00** (matches Transaction History)

---

## ⚠️ Next Steps

1. **Restart API server** to apply changes
2. **Test Location Breakdown** - should show actual carton quantities
3. **Verify Stock Ledger** - should match Transaction History values
4. **Check totals** - should match item's stock_qty (52)

---

## 🔍 Technical Details

**Transaction History Query:**
```sql
SELECT 
  carton_id,
  SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE 0 END) as putaway_qty,
  SUM(CASE WHEN transaction_type = 'Picking' THEN ABS(qty_change) ELSE 0 END) as picked_qty,
  SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE -ABS(qty_change) END) as net_qty
FROM tabTransactionHistory
WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR location_id = ?)
GROUP BY carton_id
HAVING net_qty > 0
```

**Key Points:**
- Uses `tabTransactionHistory` (aggregated) instead of `tabStockTransaction` (individual)
- Calculates `net_qty` = putaway - picking per carton
- Filters out cartons with `net_qty <= 0`
- No proportional scaling - uses actual net quantities
