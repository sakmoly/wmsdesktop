# MR-0003 Transaction Aggregation Fix Summary

## 🐛 Issue

**Problem:** When scanning individual items for Material Request picking, each scan creates a **separate transaction history record** instead of **aggregating/summing** them into a single record.

**Example:**
- User scans item 5 times (1+1+1+1+1 = 5 total)
- **Expected:** 1 transaction history record with `qty_change = -5.00`
- **Actual:** 5 separate transaction history records, each with `qty_change = -1.00`

**Result:** Transaction history shows multiple individual records instead of one consolidated record.

---

## ✅ Solution

The issue is that the **database trigger** (`trg_log_transaction_history_insert`) either:
1. **Doesn't exist** - needs to be created
2. **Exists but doesn't have aggregation logic** - needs to be updated
3. **Has aggregation logic but matching criteria is too strict** - needs to be fixed

### Fix Applied

**File Created:** `wms-api/fix-transaction-aggregation-trigger.sql`

This SQL script:
1. Drops the existing trigger (if it exists)
2. Creates a new trigger with proper aggregation logic
3. Verifies the trigger was created successfully

**Aggregation Logic:**
- Checks if a record exists with the same:
  - `item_code`
  - `bin_location` / `location_id` (handles both)
  - `carton_id` (handles NULL values)
  - `reference_doc` (e.g., "MR-0003")
  - `transaction_type` (e.g., "Picking")
  - Same day (`DATE(transaction_date)`)
- **If exists:** Updates the existing record by adding `qty_change` values
- **If not exists:** Inserts a new record

---

## 🔧 How to Fix

### Option 1: Run SQL Script (Recommended)

```bash
# Connect to your database and run:
mysql -u your_user -p your_database < wms-api/fix-transaction-aggregation-trigger.sql
```

### Option 2: Run Node.js Script

```bash
cd wms-api
node fix-transaction-aggregation-issue.js
```

This script will:
- Check if trigger exists
- Verify trigger has aggregation logic
- Recreate trigger if needed
- Test aggregation with sample data

---

## 🧪 Testing

### Test 1: Verify Trigger is Active

```sql
SHOW TRIGGERS WHERE `Trigger` = 'trg_log_transaction_history_insert';
```

**Expected:** Should show the trigger is active

### Test 2: Test Aggregation

1. **Pick an item multiple times** (e.g., scan 5 times for 5 items)
2. **Check transaction history:**

```sql
SELECT 
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  qty_change,
  qty_before,
  qty_after,
  transaction_date
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0003'
ORDER BY transaction_date;
```

**Expected:** Should show **1 record** with `qty_change = -5.00` (sum of all scans)

### Test 3: Check Individual Transactions

```sql
SELECT 
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  qty_change,
  transaction_date
FROM tabStockTransaction
WHERE reference_doc = 'MR-0003'
ORDER BY transaction_date;
```

**Expected:** Should show **5 individual records** (one per scan) - these are preserved for audit trail

**Note:** `tabStockTransaction` keeps individual records, `tabTransactionHistory` should have aggregated records.

---

## 📊 Expected Behavior After Fix

### Before Fix:
```
Scan 1: qty_change = -1 → Creates record #1
Scan 2: qty_change = -1 → Creates record #2
Scan 3: qty_change = -1 → Creates record #3
Scan 4: qty_change = -1 → Creates record #4
Scan 5: qty_change = -1 → Creates record #5

Result: 5 separate transaction history records
```

### After Fix:
```
Scan 1: qty_change = -1 → Creates record #1
Scan 2: qty_change = -1 → Updates record #1 (qty_change = -2)
Scan 3: qty_change = -1 → Updates record #1 (qty_change = -3)
Scan 4: qty_change = -1 → Updates record #1 (qty_change = -4)
Scan 5: qty_change = -1 → Updates record #1 (qty_change = -5)

Result: 1 aggregated transaction history record
```

---

## 🔍 Troubleshooting

### Issue: Trigger still not aggregating

**Possible Causes:**
1. **Different carton_id values** - Check if scans have different `carton_id` (NULL vs actual value)
2. **Different bin_location formats** - Check if locations are stored differently
3. **Different dates** - Aggregation only works for same day

**Solution:** Check matching criteria:
```sql
-- Check if transactions have matching criteria
SELECT 
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  DATE(transaction_date) as date,
  COUNT(*) as count
FROM tabStockTransaction
WHERE reference_doc = 'MR-0003'
GROUP BY item_code, bin_location, carton_id, reference_doc, DATE(transaction_date)
HAVING COUNT(*) > 1;
```

### Issue: qty_change shows wrong value

**Possible Causes:**
1. **Mobile app sending total instead of incremental** - Check mobile app code
2. **Multiple scans with wrong quantities** - Check individual transactions

**Solution:** Verify mobile app sends incremental `picked_qty`:
- Scan 1: `picked_qty: 1` (not 5)
- Scan 2: `picked_qty: 1` (not 5)
- etc.

---

## 📋 Action Items

1. [x] **Create fix script** - `fix-transaction-aggregation-trigger.sql`
2. [x] **Create verification script** - `fix-transaction-aggregation-issue.js`
3. [ ] **Run fix script** on database
4. [ ] **Test with new picks** to verify aggregation works
5. [ ] **Re-aggregate existing MR-0003 transactions** (if needed)
6. [ ] **Verify mobile app** sends incremental quantities

---

## 🔗 Related Files

- **Fix Script (SQL):** `wms-api/fix-transaction-aggregation-trigger.sql`
- **Fix Script (Node.js):** `wms-api/fix-transaction-aggregation-issue.js`
- **Diagnostic SQL:** `wms-api/diagnose-mr-0003-qty-issue.sql`
- **Analysis Document:** `MR-0003_QTY_CHANGE_BUG_ANALYSIS.md`
- **Trigger Update Script:** `wms-api/update-transaction-history-aggregation-trigger.js`

---

## ✅ Status

**Current Status:** ⚠️ **FIX READY - NEEDS TO BE APPLIED**

The fix scripts are ready. You need to:
1. Run the SQL script to recreate the trigger
2. Test with a new pick operation
3. Verify transactions are aggregating correctly
