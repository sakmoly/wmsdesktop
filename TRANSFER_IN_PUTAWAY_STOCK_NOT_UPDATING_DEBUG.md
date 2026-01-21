# Transfer In Putaway Stock Not Updating - Debug Guide

**Date**: 2026-01-21  
**Status**: 🔍 **DEBUGGING IN PROGRESS**

---

## 🚨 Problem

**Symptoms**:
- ✅ Transfer In status = `Received`
- ✅ Putaway Task created and Status = `In Progress`
- ❌ Stock, Ledger, History still NULL or not updated

**This means**:
- Location scan happened (status changed to "In Progress")
- But stock updates did NOT occur

---

## 🔍 Root Cause Analysis

### Possible Causes:

1. **Stock Update Function Not Called**
   - `processPutawayCompletionEvent` might not be getting called
   - Error might be silently caught

2. **Idempotency Check Skipping**
   - Task status might be wrong
   - But status is "In Progress", not "Completed", so this shouldn't be the issue

3. **Missing Location ID on Putaway Lines**
   - `processPutawayCompletionEvent` skips lines without `location_id`
   - Need to verify `tabPutawayLine.location_id` is set

4. **Warehouse Resolution Failure**
   - Warehouse might be NULL
   - Stock updates require valid warehouse

5. **Transaction Rollback**
   - Stock update transaction might be rolling back
   - Error might be caught but not logged properly

---

## ✅ Fixes Applied

### 1. Enhanced Error Logging

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Added**:
- Log before calling `processPutawayCompletionEvent` with all parameters
- Log after completion with result
- Enhanced error logging with full error details

**Log Format**:
```
[Putaway] 🔵 About to call processPutawayCompletionEvent with params: {
  event_type: 'PUTAWAY_TO_RACK',
  putaway_task: 'PUT-20260121-0001',
  box_id: 'CTN-TI-123457-...',
  location_id: 'A1-R02-L1-B2',
  warehouse: 'WH-MAIN',
  ...
}
[Putaway] ✅ Stock updates completed for putaway task PUT-20260121-0001
```

**Error Log Format**:
```
[Putaway] ❌❌❌ CRITICAL ERROR: Failed to trigger stock updates for putaway task PUT-20260121-0001
{
  errorType: 'Error',
  message: '...',
  stack: '...',
  putaway_task: 'PUT-20260121-0001',
  location_id: 'A1-R02-L1-B2',
  warehouse: 'WH-MAIN'
}
```

---

## 🔍 Diagnostic Steps

### Step 1: Check Backend Logs

**Look for**:
1. `[Putaway] Triggering stock updates for putaway task...`
2. `[Putaway] 🔵 About to call processPutawayCompletionEvent...`
3. `[Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called`
4. `[Putaway Completion] ✅✅✅ TRANSACTION COMMITTED SUCCESSFULLY`
5. OR `[Putaway] ❌❌❌ CRITICAL ERROR: Failed to trigger stock updates...`

**If logs show**:
- ✅ Step 1-2 present → Stock update function is being called
- ✅ Step 3 present → Function entered successfully
- ❌ Step 4 missing → Transaction rolled back or error occurred
- ❌ Step 5 present → Error occurred, check error details

---

### Step 2: Verify Location ID on Putaway Lines

```sql
SELECT 
  parent_title,
  item_code,
  qty,
  location_id,
  rack,
  bin,
  carton_id
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001';
```

**Expected Result**:
- `location_id` is NOT NULL for all lines
- `rack` and `bin` are set (not `'TBD'`)

**If `location_id` is NULL**:
- ❌ Stock updates will be skipped
- ✅ Fix: Re-scan location or manually update `location_id`

---

### Step 3: Verify Putaway Task Status

```sql
SELECT 
  title,
  status,
  transfer_in,
  source_type,
  warehouse,
  location_id
FROM tabPutawayTask
WHERE title = 'PUT-20260121-0001';
```

**Expected Result**:
- `status` = `'In Progress'` (after location scan)
- `transfer_in` = Transfer In number
- `source_type` = `'TransferIn'`
- `warehouse` = Warehouse code (or NULL if not set)

**If `status` = `'Completed'`**:
- ❌ Idempotency check will skip stock updates
- ✅ Fix: Change status back to `'In Progress'` and re-trigger

---

### Step 4: Check Warehouse Resolution

**In Backend Logs, look for**:
```
[Putaway Completion] Transfer In putaway detected: transfer_in=INSLIP-123457
[Putaway Completion] Getting warehouse from tabTransferIn.to_warehouse for Transfer In: INSLIP-123457
[Putaway Completion] Transfer In query result: { to_warehouse: 'WH-MAIN', warehouse: 'NULL' }
[Putaway Completion] ✅ Using to_warehouse: WH-MAIN
[Putaway Completion] Step 5: Warehouse resolved: WH-MAIN
```

**If warehouse is NULL**:
- ❌ Stock updates will fail
- ✅ Fix: Verify `tabTransferIn.to_warehouse` is set

---

### Step 5: Verify Putaway Lines Have Items

```sql
SELECT 
  COUNT(*) as line_count,
  SUM(CASE WHEN item_code IS NULL THEN 1 ELSE 0 END) as null_item_code,
  SUM(CASE WHEN qty <= 0 THEN 1 ELSE 0 END) as zero_qty,
  SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) as null_location
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001';
```

**Expected Result**:
- `line_count` > 0
- `null_item_code` = 0
- `zero_qty` = 0
- `null_location` = 0 (after location scan)

**If any are > 0**:
- ❌ Those lines will be skipped
- ✅ Fix: Update missing data

---

## 🛠️ Manual Fix: Trigger Stock Update

If location is already set but stock didn't update, use the manual trigger:

**Endpoint**: `POST /api/putaway/trigger-stock-update`

**Request**:
```json
{
  "putaway_task": "PUT-20260121-0001",
  "user_id": "USER-001"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Stock updates triggered for putaway task PUT-20260121-0001",
  "data": {
    "putaway_task": "PUT-20260121-0001",
    "warehouse": "WH-MAIN",
    "location_id": "A1-R02-L1-B2",
    "items_updated": 2
  }
}
```

**Check Backend Logs After Trigger**:
- Should see `[Putaway Completion]` logs
- Should see `✅✅✅ TRANSACTION COMMITTED SUCCESSFULLY`
- Should see stock ledger and transaction history counts

---

## 📊 Verification Queries

### After Manual Trigger, Verify Stock Updates:

```sql
-- Check Stock Ledger
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260121-0001'
ORDER BY item_code;

-- Check Transaction History
SELECT 
  transaction_type,
  warehouse,
  bin_location,
  location_id,
  item_code,
  qty_change,
  reference_doc
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260121-0001'
ORDER BY created_at DESC;
```

**Expected Result**:
- At least 2 rows in stock ledger (one per item)
- At least 2 rows in transaction history (one per item)
- `qty` > 0
- `bin_location` = scanned location
- `location_id` = scanned location

---

## 🔧 Common Issues and Fixes

### Issue 1: Location ID Not Set

**Symptom**: `tabPutawayLine.location_id` is NULL

**Fix**:
```sql
-- Update location_id manually
UPDATE tabPutawayLine
SET location_id = 'A1-R02-L1-B2',
    rack = 'A1-R02-L1',
    bin = 'B2',
    updated_at = NOW()
WHERE parent_title = 'PUT-20260121-0001'
  AND location_id IS NULL;
```

Then trigger stock update manually.

---

### Issue 2: Task Status is "Completed"

**Symptom**: Task status is "Completed" before stock updates

**Fix**:
```sql
-- Change status back to "In Progress"
UPDATE tabPutawayTask
SET status = 'In Progress',
    updated_at = NOW()
WHERE title = 'PUT-20260121-0001';
```

Then trigger stock update manually.

---

### Issue 3: Warehouse is NULL

**Symptom**: Warehouse not resolved in logs

**Fix**:
```sql
-- Verify Transfer In has to_warehouse
SELECT title, to_warehouse, warehouse
FROM tabTransferIn
WHERE title = 'INSLIP-123457';

-- If to_warehouse is NULL, update it
UPDATE tabTransferIn
SET to_warehouse = 'WH-MAIN'
WHERE title = 'INSLIP-123457'
  AND to_warehouse IS NULL;
```

Then trigger stock update manually.

---

## 📋 Next Steps

1. **Restart Backend Server** (to get new logging)
2. **Check Backend Logs** for the enhanced error messages
3. **Run Diagnostic Queries** to verify data state
4. **Use Manual Trigger** if location is already set
5. **Share Logs** if issue persists

---

**END**
