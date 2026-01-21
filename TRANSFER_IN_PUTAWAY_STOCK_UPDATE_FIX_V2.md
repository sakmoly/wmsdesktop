# Transfer In Putaway Stock Not Updating - Fix V2

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

**Symptoms**:
- ✅ Transfer In status = `Received`
- ✅ Putaway Task created and Status = `In Progress`
- ❌ Stock, Ledger, History still NULL or not updated

**Root Cause**: When mobile app calls `POST /api/putaway/scan-transfer-carton` with `putaway_task` parameter directly (without going through box validation), `taskTitleToCheck` was not being set, so the stock update code path was never reached.

---

## ✅ Fix Applied

### Issue: taskTitleToCheck Not Set When putaway_task Provided Directly

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Problem**:
- `taskTitleToCheck` was only set from box validation path (line 4374)
- If mobile app sends `putaway_task` directly, `taskTitleToCheck` remained `null`
- Stock update code path at line 4404 checks `if (taskTitleToCheck && location_id)` - this failed

**Fix**:

1. **Initialize taskTitleToCheck Early** (Line ~3966):
   ```javascript
   // If putaway_task is provided, use it (for desktop app workflow)
   const actualPutawayTask = putaway_task;
   let taskTitleToCheck = actualPutawayTask; // ✅ Initialize with putaway_task if provided
   ```

2. **Use putaway_task if Box Validation Didn't Set It** (Line ~4403):
   ```javascript
   // If putaway_task was provided directly but taskTitleToCheck wasn't set from box validation, use it now
   if (!taskTitleToCheck && actualPutawayTask) {
     taskTitleToCheck = actualPutawayTask;
     logger.info(`[Putaway Scan] Using putaway_task from request body: ${taskTitleToCheck}`);
   }
   ```

3. **Verify Task Match** (Line ~4374):
   ```javascript
   // Update taskTitleToCheck with found task (if not already set from putaway_task parameter)
   if (!taskTitleToCheck) {
     taskTitleToCheck = foundPutawayTask.title;
   } else {
     // Verify the found task matches the provided putaway_task
     if (taskTitleToCheck !== foundPutawayTask.title) {
       return res.status(400).json({
         ok: false,
         error: {
           code: "TASK_MISMATCH",
           message: `Putaway task ${taskTitleToCheck} does not match task found for box ${validatedBoxId}`
         }
       });
     }
   }
   ```

---

## 🔍 How It Works Now

### Code Flow:

1. **Request Received**:
   ```json
   {
     "putaway_task": "PUT-20260121-0001",
     "location_id": "A1-R02-L1-B2",
     "user_id": "USER-001"
   }
   ```

2. **taskTitleToCheck Initialized**:
   ```javascript
   let taskTitleToCheck = actualPutawayTask; // ✅ Now set immediately
   ```

3. **Location Update Path Triggered**:
   ```javascript
   if (taskTitleToCheck && location_id) { // ✅ Now TRUE
     // Update putaway lines with location
     // Trigger stock updates
   }
   ```

4. **Stock Updates Triggered**:
   ```javascript
   await processPutawayCompletionEvent(stockConnection, {
     event_type: 'PUTAWAY_TO_RACK',
     putaway_task: taskTitleToCheck,
     location_id: location_id,
     // ...
   });
   ```

---

## 📋 Testing

### Test 1: Mobile App with putaway_task Parameter

**Request**:
```json
POST /api/putaway/scan-transfer-carton
{
  "putaway_task": "PUT-20260121-0001",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-001"
}
```

**Expected Logs**:
```
[Putaway Scan] Entry: location_id=A1-R02-L1-B2, putaway_task=PUT-20260121-0001
[Putaway Scan] Checking location update path: taskTitleToCheck=PUT-20260121-0001, location_id=A1-R02-L1-B2
[Putaway Scan] ✅ Location update path triggered: task=PUT-20260121-0001, location=A1-R02-L1-B2
[Putaway] Triggering stock updates for putaway task PUT-20260121-0001 after location assignment
[Putaway] 🔵 About to call processPutawayCompletionEvent...
[Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called
[Putaway Completion] ✅✅✅ TRANSACTION COMMITTED SUCCESSFULLY
```

**Expected Result**:
- ✅ Location updated on putaway lines
- ✅ Task status = `In Progress`
- ✅ Stock ledger updated
- ✅ Transaction history created

---

### Test 2: Mobile App with box_id Parameter

**Request**:
```json
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-TI-123457-20260121-111153-371",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-001"
}
```

**Expected**: Same as Test 1 (box validation sets `taskTitleToCheck`)

---

## 🔧 Manual Fix for Existing Tasks

If you have existing putaway tasks with location set but stock not updated:

### Step 1: Verify Location is Set

```sql
SELECT 
  parent_title,
  item_code,
  location_id
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001';
```

**Expected**: `location_id` is NOT NULL

---

### Step 2: Trigger Stock Update Manually

**Endpoint**: `POST /api/putaway/trigger-stock-update`

**Request**:
```json
{
  "putaway_task": "PUT-20260121-0001",
  "user_id": "USER-001"
}
```

**Expected Response**:
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

---

### Step 3: Verify Stock Updates

```sql
-- Check Stock Ledger
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260121-0001';

-- Check Transaction History
SELECT 
  transaction_type,
  warehouse,
  bin_location,
  item_code,
  qty_change,
  reference_doc
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260121-0001';
```

**Expected**: Rows exist with `qty > 0`

---

## ✅ Completion Criteria

You are **DONE** when:

1. ✅ `taskTitleToCheck` is initialized from `putaway_task` parameter
2. ✅ Location update path is triggered when `putaway_task` is provided
3. ✅ Stock updates are triggered after location assignment
4. ✅ Backend logs show stock update process
5. ✅ Stock ledger and transaction history are updated

---

## 📊 Summary of Changes

| Change | File | Line | Status |
|--------|------|------|--------|
| Initialize taskTitleToCheck from putaway_task | `putawayController.js` | ~3966 | ✅ Fixed |
| Use putaway_task if box validation didn't set it | `putawayController.js` | ~4403 | ✅ Fixed |
| Verify task match when both provided | `putawayController.js` | ~4374 | ✅ Fixed |

---

**END**
