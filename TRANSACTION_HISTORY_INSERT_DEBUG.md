# Transaction History Insert Debug Guide

**Date**: 2026-01-20  
**Issue**: Transaction history not being inserted during putaway completion

---

## Problem

- Transaction history (`tabStockTransaction`) is not being created/inserted
- Carton ID is showing in Item Location Breakdown (working)
- Transaction history table appears blank

---

## Code Changes Applied

### ✅ Fix 1: Removed `carton_id` Requirement
**Location**: `putawayController.js:2643-2669`

**Before (WRONG):**
```javascript
// Required carton_id - would skip transaction if missing
if (!binLocation || !cartonIdValue) {
  console.error(`⚠️ Skipping transaction...`);
  continue; // ❌ Transaction NOT inserted
}
```

**After (CORRECT):**
```javascript
// Only require bin_location (carton_id is optional)
if (!binLocation || binLocation.trim() === '' || binLocation.includes('TBD')) {
  console.error(`⚠️ Skipping transaction: bin_location is invalid`);
  continue; // Only skip if bin_location is invalid
}
```

### ✅ Fix 2: Always Include `carton_id` if Column Exists
**Location**: `putawayController.js:2685-2689`

```javascript
// Add carton_id if column exists (include even if NULL)
if (hasStockTransactionCartonId) {
  txnFields.push('carton_id');
  txnValues.push(cartonIdValue || null); // ✅ Allow NULL
  console.log(`[Putaway] 📦 Including carton_id in transaction: ${cartonIdValue || 'NULL'}`);
}
```

### ✅ Fix 3: Added Error Handling
**Location**: `putawayController.js:2695-2712`

```javascript
try {
  await connection.execute(
    `INSERT INTO tabStockTransaction (${txnFields.join(', ')})
     VALUES (${txnFields.map(() => '?').join(', ')})`,
    txnValues
  );
  console.log(`[Putaway] ✅ Inserted transaction history...`);
} catch (txnError) {
  console.error(`[Putaway] ❌ ERROR inserting transaction:`, txnError.message);
  // Don't throw - continue processing other items
}
```

---

## Debugging Steps

### Step 1: Check Backend Logs

**Look for these log messages during putaway completion:**

1. **Transaction preparation:**
   ```
   [Putaway] 🔍 Preparing transaction INSERT: X fields, X values
   [Putaway] 🔍 Fields: transaction_date, transaction_type, ...
   [Putaway] 📦 Including carton_id in transaction: CTN-001 (or NULL)
   ```

2. **Successful insertion:**
   ```
   [Putaway] ✅ Inserted transaction history for SKU-HAT-301-GRN-OS @ A1-R02-L1-B2 (carton_id: CTN-001)
   ```

3. **Error (if any):**
   ```
   [Putaway] ❌ ERROR inserting transaction history for SKU-HAT-301-GRN-OS: [error message]
   ```

**If logs are missing**: Transaction INSERT might not be executing (check if `linesToProcess` is empty)

---

### Step 2: Verify Database Schema

```sql
-- Check if tabStockTransaction table exists and has required columns
DESCRIBE tabStockTransaction;

-- Expected columns:
-- - transaction_date (or transaction_date)
-- - transaction_type
-- - reference_doc_type
-- - reference_doc
-- - item_code
-- - warehouse
-- - bin_location (optional)
-- - carton_id (optional)
-- - qty_change
-- - qty_before
-- - qty_after
-- - source_bin
-- - target_bin
-- - performed_by
-- - created_at
```

**If columns missing**: Add them or adjust the INSERT statement

---

### Step 3: Check for Database Constraints

```sql
-- Check for unique constraints that might prevent INSERT
SHOW CREATE TABLE tabStockTransaction;

-- Check for foreign key constraints
SELECT 
  CONSTRAINT_NAME,
  TABLE_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabStockTransaction'
  AND REFERENCED_TABLE_NAME IS NOT NULL;
```

**If constraints exist**: Verify referenced data exists (e.g., `item_code` in `tabItem`, `warehouse` in `tabWarehouse`)

---

### Step 4: Test Transaction INSERT Manually

```sql
-- Test INSERT with sample data
INSERT INTO tabStockTransaction (
  transaction_date,
  transaction_type,
  reference_doc_type,
  reference_doc,
  item_code,
  warehouse,
  bin_location,
  carton_id,
  qty_change,
  qty_before,
  qty_after,
  source_bin,
  target_bin,
  performed_by,
  created_at
) VALUES (
  NOW(),
  'Putaway',
  'Putaway Task',
  'TEST-TASK',
  'SKU-HAT-301-GRN-OS',
  'WH-MAIN',
  'A1-R02-L1-B2',
  'CTN-001',
  5.00,
  0.00,
  5.00,
  'STAGING-01',
  'A1-R02-L1-B2',
  'SYSTEM',
  NOW()
);

-- If this fails, check the error message
```

**If manual INSERT fails**: Fix the database schema or constraints

---

### Step 5: Check if Transaction is Being Committed

**Look for this log message:**
```
[Putaway] ✅ Successfully completed putaway task PUT-XXX - stock updated, status: "Completed"
```

**If this log appears**: Transaction was committed (check database directly)

**If this log doesn't appear**: Transaction might have been rolled back (check error logs)

---

### Step 6: Verify Transaction in Database

```sql
-- Check recent putaway transactions
SELECT 
  id,
  transaction_date,
  transaction_type,
  item_code,
  warehouse,
  bin_location,
  carton_id,
  qty_change,
  reference_doc,
  created_at
FROM tabStockTransaction
WHERE transaction_type = 'Putaway'
  AND transaction_date >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY transaction_date DESC
LIMIT 20;
```

**If no rows returned**: Transaction INSERT is not executing or is being rolled back

**If rows exist but carton_id is NULL**: This is expected if carton_id was not provided

---

## Common Issues & Solutions

### Issue 1: `linesToProcess` is Empty

**Symptom**: No transaction logs appear

**Check:**
```javascript
// Add logging before the loop
console.log(`[Putaway] Processing ${linesToProcess.length} lines for stock update`);
```

**Fix**: Verify putaway lines exist in `tabPutawayLine` for the task

---

### Issue 2: Database Constraint Violation

**Symptom**: Error in logs: `ER_NO_REFERENCED_ROW_2` or `ER_DUP_ENTRY`

**Common causes:**
- `item_code` doesn't exist in `tabItem`
- `warehouse` doesn't exist in `tabWarehouse`
- Unique constraint violation

**Fix**: Verify referenced data exists or adjust constraints

---

### Issue 3: Column Mismatch

**Symptom**: Error in logs: `ER_BAD_FIELD_ERROR`

**Fix**: Verify column names match database schema

---

### Issue 4: Transaction Rollback

**Symptom**: Transaction INSERT succeeds but no data in database

**Check:**
- Look for `connection.rollback()` calls after transaction INSERT
- Check for errors in catch block that trigger rollback

**Fix**: Ensure transaction is committed (line 2946)

---

## Verification Checklist

- [ ] Backend logs show "Preparing transaction INSERT"
- [ ] Backend logs show "Inserted transaction history"
- [ ] No error messages in logs
- [ ] Database schema has all required columns
- [ ] Manual INSERT test succeeds
- [ ] Transaction appears in database after putaway completion
- [ ] Transaction is committed (status = "Completed")

---

## Next Steps

1. **Restart backend API server** to apply code changes
2. **Complete a putaway** and check backend logs
3. **Verify transaction in database** using SQL query above
4. **If still not working**: Check error logs for specific database errors

---

**END**
