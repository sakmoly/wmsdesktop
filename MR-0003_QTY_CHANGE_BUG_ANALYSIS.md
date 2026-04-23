# MR-0003 Qty Change Bug Analysis

## 🐛 Bug Description

**Issue:** Material Request MR-0003 shows incorrect `qty_change` in transaction history:
- **Actual Pick:** 5 items
- **Transaction History Shows:** `qty_change = -7.00`
- **Qty Before:** 25.00
- **Qty After:** 20.00 (correct: 25 - 5 = 20)
- **Problem:** `qty_change` shows -7.00 instead of -5.00

**Additional Issue:** When scanning each item, transactions are not consolidating properly.

---

## 🔍 Root Cause Analysis

### Issue 1: Incorrect qty_change Calculation

The `qty_change` field in `tabTransactionHistory` is showing `-7.00` when only `5` items were actually picked. This suggests one of the following:

1. **Multiple scans not properly aggregated**
   - User may have scanned: 2 + 2 + 2 + 1 = 7 (instead of 5)
   - Or: 2 + 2 + 3 = 7 (instead of 5)
   - Aggregation trigger might be summing incorrectly

2. **Mobile app sending total instead of incremental**
   - Mobile app might be sending `picked_qty: 5` (total) instead of `picked_qty: 1` (incremental per scan)
   - If scanned 5 times with `picked_qty: 5` each, backend would add: 5 + 5 + 5 + 5 + 5 = 25
   - But transaction history would show: -5 + -5 + -5 + -5 + -5 = -25 (if not aggregated)

3. **Aggregation trigger bug**
   - The trigger might be incorrectly summing `qty_change` values
   - Or not matching records correctly (different carton_id, location, etc.)

### Issue 2: Transactions Not Consolidating

When scanning items multiple times, each scan should create a transaction that gets aggregated into a single record in `tabTransactionHistory`. If this isn't happening, it could be because:

1. **Aggregation criteria not matching**
   - Different `carton_id` values
   - Different `bin_location` / `location_id` values
   - Different `transaction_date` (not same day)
   - Different `reference_doc` values

2. **Trigger not active or not working**
   - Trigger might not be installed
   - Trigger might have errors
   - Trigger might be disabled

---

## 🔬 Diagnostic Steps

### Step 1: Check Actual Transaction Records

```sql
-- Check all transactions for MR-0003
SELECT 
  id,
  transaction_date,
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  qty_change,
  qty_before,
  qty_after,
  transaction_type
FROM tabStockTransaction
WHERE reference_doc = 'MR-0003'
ORDER BY transaction_date, id;
```

**Expected:** Should show individual scan transactions (e.g., -2, -2, -1 for 5 items picked in 3 scans)

### Step 2: Check Aggregated Transaction History

```sql
-- Check aggregated transaction history for MR-0003
SELECT 
  id,
  transaction_date,
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  qty_change,
  qty_before,
  qty_after,
  transaction_type
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0003'
ORDER BY transaction_date, id;
```

**Expected:** Should show 1 aggregated record per item/location/carton with `qty_change = -5.00`

### Step 3: Check Material Request Item Picked Quantities

```sql
-- Check actual picked quantities for MR-0003
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  scan_qty,
  status
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0003';
```

**Expected:** Should show `picked_qty = 5.00` for each item

### Step 4: Verify Aggregation Trigger

```sql
-- Check if trigger exists and is active
SHOW TRIGGERS WHERE `Trigger` = 'trg_log_transaction_history_insert';

-- Check trigger definition
SHOW CREATE TRIGGER trg_log_transaction_history_insert;
```

**Expected:** Trigger should exist and have aggregation logic

### Step 5: Check for Duplicate/Non-Matching Records

```sql
-- Find transactions that should be aggregated but aren't
SELECT 
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  DATE(transaction_date) as date,
  COUNT(*) as transaction_count,
  SUM(qty_change) as total_qty_change,
  MIN(qty_before) as first_qty_before,
  MAX(qty_after) as last_qty_after
FROM tabStockTransaction
WHERE reference_doc = 'MR-0003'
GROUP BY item_code, bin_location, carton_id, reference_doc, DATE(transaction_date)
HAVING COUNT(*) > 1;
```

**Expected:** Should show groups that should be aggregated

---

## 🛠️ Potential Fixes

### Fix 1: Verify Mobile App Sends Incremental Quantities

**Problem:** Mobile app might be sending total `picked_qty` instead of incremental.

**Solution:** Ensure mobile app sends:
- **Scan 1:** `picked_qty: 1` (1 item in this scan)
- **Scan 2:** `picked_qty: 1` (1 more item in this scan)
- **NOT:** `picked_qty: 2` (total so far)

**Backend expects:** Incremental quantities that get added: `picked_qty = current + new`

### Fix 2: Fix Aggregation Trigger Matching

**Problem:** Trigger might not be matching records correctly due to:
- Different `carton_id` values (NULL vs actual value)
- Different `bin_location` format (e.g., "A1-R02-L2-B2" vs "Rack 02-B2")
- Different `location_id` vs `bin_location`

**Solution:** Update trigger to handle:
```sql
-- More flexible matching
WHERE item_code = NEW.item_code
  AND (
    (location_id = NEW.bin_location OR bin_location = NEW.bin_location)
    OR (location_id IS NULL AND NEW.bin_location IS NULL)
  )
  AND (
    (carton_id = NEW.carton_id)
    OR (carton_id IS NULL AND NEW.carton_id IS NULL)
  )
  AND reference_doc = NEW.reference_doc
  AND transaction_type = NEW.transaction_type
  AND DATE(transaction_date) = DATE(NEW.transaction_date)
```

### Fix 3: Fix qty_change Calculation

**Problem:** `qty_change` might be calculated incorrectly if `pickedQty` is the total instead of incremental.

**Current Code (Line 1256):**
```javascript
const qtyReduced = isDecreasing ? pickedQty : -pickedQty;
```

**Issue:** If mobile app sends `picked_qty: 5` (total) instead of `picked_qty: 1` (incremental), this would create `qty_change = -5` for each scan, leading to incorrect aggregation.

**Solution:** Ensure `pickedQty` is always the incremental quantity for this specific transaction, not the total.

### Fix 4: Re-aggregate Existing Transactions

**Problem:** Existing transactions might already be incorrectly aggregated.

**Solution:** Run aggregation script to fix existing records:
```sql
-- Aggregate existing MR-0003 transactions
-- (Use the aggregate-existing-transaction-history.js script)
```

---

## 🧪 Testing Scenarios

### Test 1: Single Scan of 5 Items

**Request:**
```json
POST /api/material-requests/MR-0003/pick-items
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 5,
      "source_bin": "A1-R02-L2-B2",
      "carton_id": "PAW-ASN365425487"
    }
  ]
}
```

**Expected Result:**
- `tabMaterialRequestItem.picked_qty` = 5.00
- `tabStockTransaction.qty_change` = -5.00
- `tabTransactionHistory.qty_change` = -5.00 (1 record)
- `tabStockLedger.qty` = 20.00 (25 - 5)

### Test 2: Multiple Scans (2 + 2 + 1 = 5)

**Request 1:**
```json
{
  "items": [{"item_code": "SKU-HAT-301-BLU-OS", "picked_qty": 2, ...}]
}
```

**Request 2:**
```json
{
  "items": [{"item_code": "SKU-HAT-301-BLU-OS", "picked_qty": 2, ...}]
}
```

**Request 3:**
```json
{
  "items": [{"item_code": "SKU-HAT-301-BLU-OS", "picked_qty": 1, ...}]
}
```

**Expected Result:**
- `tabMaterialRequestItem.picked_qty` = 5.00 (2 + 2 + 1)
- `tabStockTransaction`: 3 records with qty_change = -2, -2, -1
- `tabTransactionHistory`: 1 aggregated record with qty_change = -5.00
- `tabStockLedger.qty` = 20.00 (25 - 5)

---

## 📋 Action Items

1. [ ] **Run diagnostic queries** to identify the root cause
2. [ ] **Check mobile app** to verify it sends incremental quantities
3. [ ] **Verify aggregation trigger** is active and working correctly
4. [ ] **Fix trigger matching logic** if needed (handle NULL carton_id, location format differences)
5. [ ] **Re-aggregate existing transactions** for MR-0003
6. [ ] **Test with new picks** to verify fix works
7. [ ] **Update documentation** if mobile app needs changes

---

## 🔗 Related Files

- **Pick Items Endpoint:** `wms-api/src/modules/material-request/materialRequestController.js` (lines 765-1572)
- **Aggregation Trigger:** `wms-api/update-transaction-history-aggregation-trigger.js`
- **Transaction History:** `tabTransactionHistory` table
- **Stock Transactions:** `tabStockTransaction` table
