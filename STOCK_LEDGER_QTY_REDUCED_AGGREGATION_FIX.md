# Stock Ledger Qty Reduced Aggregation Fix

## 🐛 Bug Description

**Issue:** Stock Ledger shows `-1.00` in "Qty +/-" column when multiple items were picked (e.g., picking 3 items shows `-1.00` instead of `-3.00`).

**Example from User:**
- **Item:** `SKU-HAT-301-GRN-OS`
- **Material Request:** `MR-0004`
- **Actual Pick:** Multiple items (likely 2, 3, or more)
- **Stock Ledger Shows:** `Qty +/- = -1.00` (only last scan's value)
- **Expected:** `Qty +/- = -3.00` (or total picked quantity)

**Root Cause:**
- Each scan creates a transaction with incremental `qty_reduced` (e.g., -1.00 per scan)
- Stock ledger's `qty_reduced` field gets **overwritten** on each update
- Stock ledger shows the **last transaction's** `qty_reduced` value, not the **aggregated total**
- Transaction history correctly aggregates in `tabTransactionHistory` (via trigger), but stock ledger doesn't use it

---

## ✅ Solution Implemented

**File Modified:** `wms-api/src/modules/material-request/materialRequestController.js`  
**Function:** `pickMaterialRequestItems`  
**Lines:** 1250-1381

### Changes Applied

**Before:**
```javascript
// Used incremental qty_reduced directly
const qtyReduced = isDecreasing ? pickedQty : -pickedQty;
// ...
updateFields += `, qty_reduced = ?`;
updateParams.push(qtyReduced); // Always incremental value
```

**After:**
```javascript
// 1. Insert transaction first (triggers aggregation in tabTransactionHistory)
await connection.execute(`INSERT INTO tabStockTransaction ...`);

// 2. Query aggregated qty_change from tabTransactionHistory
const [aggregatedHistory] = await connection.execute(`
  SELECT qty_change, qty_before, qty_after
  FROM tabTransactionHistory
  WHERE item_code = ? AND warehouse = ? AND ...
  AND reference_doc = ? AND transaction_type = 'Picking'
  AND DATE(transaction_date) = CURDATE()
  LIMIT 1
`, [...]);

// 3. Use aggregated value for stock ledger
if (aggregatedHistory.length > 0) {
  finalQtyReduced = parseFloat(aggregatedHistory[0].qty_change) || qtyReduced;
}

// 4. Update stock ledger with aggregated value
updateParams.push(finalQtyReduced); // Aggregated total
```

### How It Works

1. **Transaction Insert:** Insert into `tabStockTransaction` (line 1336-1381)
   - Creates individual transaction record
   - Trigger `trg_log_transaction_history_insert` automatically aggregates it

2. **Query Aggregated Value:** Query `tabTransactionHistory` for aggregated `qty_change` (after transaction insert)
   - Matches by: `item_code`, `warehouse`, `bin_location`, `carton_id`, `reference_doc`, `transaction_type`, same day
   - Returns aggregated `qty_change` (e.g., -3.00 for 3 scans of -1.00 each)

3. **Update Stock Ledger:** Use aggregated `qty_change` for `qty_reduced` in `tabStockLedger`
   - Stock ledger now shows total picked quantity (e.g., -3.00) instead of last scan (e.g., -1.00)

---

## 🔄 Complete Flow (After Fix)

### Scenario: Picking 3 Items in 3 Separate Scans

**Scan 1:**
- Insert transaction: `qty_change = -1.00`
- Trigger aggregates: `tabTransactionHistory.qty_change = -1.00`
- Query aggregated: `finalQtyReduced = -1.00`
- Update stock ledger: `qty_reduced = -1.00` ✅

**Scan 2:**
- Insert transaction: `qty_change = -1.00`
- Trigger aggregates: `tabTransactionHistory.qty_change = -2.00` (aggregated)
- Query aggregated: `finalQtyReduced = -2.00`
- Update stock ledger: `qty_reduced = -2.00` ✅

**Scan 3:**
- Insert transaction: `qty_change = -1.00`
- Trigger aggregates: `tabTransactionHistory.qty_change = -3.00` (aggregated)
- Query aggregated: `finalQtyReduced = -3.00`
- Update stock ledger: `qty_reduced = -3.00` ✅ **CORRECT!**

---

## 🧪 Testing

### Test 1: Single Scan

**Request:**
```json
POST /api/material-requests/MR-0004/pick-items
{
  "items": [{
    "item_code": "SKU-HAT-301-GRN-OS",
    "picked_qty": 1,
    "source_bin": "A1-R02-L1-B2"
  }]
}
```

**Expected Result:**
- `tabStockLedger.qty_reduced` = `-1.00` ✅
- Stock Ledger API shows `Qty +/- = -1.00` ✅

### Test 2: Multiple Scans (2 + 2 + 1 = 5)

**Request 1:**
```json
{
  "items": [{"item_code": "SKU-HAT-301-GRN-OS", "picked_qty": 2, ...}]
}
```

**Request 2:**
```json
{
  "items": [{"item_code": "SKU-HAT-301-GRN-OS", "picked_qty": 2, ...}]
}
```

**Request 3:**
```json
{
  "items": [{"item_code": "SKU-HAT-301-GRN-OS", "picked_qty": 1, ...}]
}
```

**Expected Result:**
- `tabStockLedger.qty_reduced` = `-5.00` ✅ (aggregated total)
- Stock Ledger API shows `Qty +/- = -5.00` ✅
- **NOT** `-1.00` (last scan only)

---

## 📊 Database Verification

### Check Stock Ledger:
```sql
SELECT 
  item_code,
  bin_location,
  qty,
  qty_before,
  qty_reduced,
  last_transaction_ref,
  last_transaction_date
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND last_transaction_ref = 'MR-0004';
```

**Expected:**
- `qty_reduced` should show **total picked quantity** (e.g., -5.00), not last scan (e.g., -1.00)

### Check Transaction History:
```sql
SELECT 
  item_code,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  reference_doc
FROM tabTransactionHistory
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND reference_doc = 'MR-0004'
ORDER BY transaction_date;
```

**Expected:**
- Should show **1 aggregated record** with `qty_change = -5.00` (total)
- **NOT** multiple records with -2, -2, -1

### Compare Stock Ledger vs Transaction History:
```sql
SELECT 
  'Stock Ledger' as source,
  qty_reduced as qty_change
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND last_transaction_ref = 'MR-0004'

UNION ALL

SELECT 
  'Transaction History' as source,
  qty_change
FROM tabTransactionHistory
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND reference_doc = 'MR-0004';
```

**Expected:**
- Both should show the **same aggregated value** (e.g., -5.00)

---

## 🔍 Troubleshooting

### Issue: Stock Ledger Still Shows -1.00

**Possible Causes:**
1. **Aggregation trigger not working** - Check if trigger exists and is active
2. **Transaction history not aggregated** - Query `tabTransactionHistory` to verify
3. **Query timing issue** - Aggregated value not available yet when querying

**Solution:**
```sql
-- Check if trigger exists
SHOW TRIGGERS WHERE `Trigger` = 'trg_log_transaction_history_insert';

-- Check transaction history aggregation
SELECT 
  item_code,
  COUNT(*) as record_count,
  SUM(qty_change) as total_qty_change
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0004'
GROUP BY item_code;

-- If multiple records exist, aggregation trigger may not be working
```

### Issue: Query Returns No Results

**Possible Causes:**
- Location mismatch (`bin_location` vs `location_id`)
- Carton ID mismatch (NULL vs actual value)
- Date mismatch (different day)

**Solution:**
- Check query parameters match exactly
- Verify `actualBinLocation` matches `tabTransactionHistory.bin_location` or `location_id`
- Check `finalCartonId` matches `tabTransactionHistory.carton_id` (including NULL handling)

---

## ✅ Status

**Current Status:** ✅ **FIXED**

The fix has been implemented. Stock ledger will now show the **aggregated total picked quantity** in the "Qty +/-" column instead of just the last scan's value.

---

## 🔗 Related Files

- **Modified:** `wms-api/src/modules/material-request/materialRequestController.js` (function: `pickMaterialRequestItems`)
- **Trigger:** `trg_log_transaction_history_insert` (aggregates transactions)
- **Table:** `tabTransactionHistory` (source of aggregated values)
- **Table:** `tabStockLedger` (displays `qty_reduced` to users)
- **Diagnostic Script:** `wms-api/diagnose-mr-0004-stock-ledger-issue.sql`
