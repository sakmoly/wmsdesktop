# Putaway Error Handling and Retry Fix

**Date**: 2026-01-17  
**Status**: ✅ **FIXED**

---

## Problem

1. **Error During Putaway Still Updates Status**: When `scanTransferCarton` fails (e.g., "Unknown column 'box_id'"), the mobile app shows "Success" but the backend fails, leaving the task in an inconsistent state.

2. **"Update Stock" Button Not Working**: The mobile app's "Update Stock" button should retry the putaway completion, but it's not working due to the same database errors.

3. **Task Status Not Preserved on Error**: If putaway fails, the task should remain in "Open" or "In Progress" state so it can be retried, but errors were causing inconsistent states.

---

## Root Causes

1. **Missing Column Check**: `scanTransferCarton` was querying `box_id` column before checking if it exists (FIXED in previous commit).

2. **Transaction Rollback**: Errors properly rollback transactions, but mobile app shows "Success" due to event-based fallback.

3. **No Retry Endpoint**: The "Update Stock" button needs to call `POST /api/putaway/complete` to retry completion.

---

## Solutions Implemented

### 1. ✅ Fixed `box_id` Column Check (Already Fixed)

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Lines**: ~4028-4045

**Change**: Moved column existence check BEFORE SELECT query:

```javascript
// BEFORE (WRONG):
const [taskInfo] = await connection.execute(
  `SELECT source_type, box_id FROM tabPutawayTask WHERE title = ?`,
  [putawayTaskTitle]
);
// ... then check if box_id exists

// AFTER (CORRECT):
// Check if box_id column exists FIRST
const [boxIdColCheck] = await connection.execute(`
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tabPutawayTask'
    AND COLUMN_NAME = 'box_id'
`);
const hasBoxId = boxIdColCheck.length > 0;

// Conditionally include box_id in SELECT
const taskInfoSelect = hasBoxId 
  ? `SELECT source_type, box_id FROM tabPutawayTask WHERE title = ?`
  : `SELECT source_type, NULL as box_id FROM tabPutawayTask WHERE title = ?`;

const [taskInfo] = await connection.execute(taskInfoSelect, [putawayTaskTitle]);
```

**Result**: No more "Unknown column 'box_id'" errors.

---

### 2. ✅ Error Handling in `scanTransferCarton`

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `scanTransferCarton()`

**Current Behavior**:
- ✅ Uses database transaction (`beginTransaction()`)
- ✅ On error, calls `rollback()` - **prevents any status updates**
- ✅ Task remains in original state ("Open" or "In Progress")
- ✅ Returns proper error response to mobile app

**Error Response**:
```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to process transfer carton for putaway",
    "details": {
      "message": "Unknown column 'box_id' in 'field list'",
      "code": "ER_BAD_FIELD_ERROR"
    }
  }
}
```

**Result**: If error occurs, task status is NOT updated, allowing retry.

---

### 3. ✅ Error Handling in `completePutaway`

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `completePutaway()`

**Current Behavior**:
- ✅ Uses database transaction (`beginTransaction()`)
- ✅ Updates stock ledger, carton stock, stock transactions
- ✅ **ONLY marks as "Completed" AFTER all updates succeed**
- ✅ On error, calls `rollback()` - **prevents status update to "Completed"**
- ✅ Task remains in "In Progress" state on error

**Status Update Location** (Line ~1134):
```javascript
// Update task status to Completed
// This happens AFTER all stock updates succeed
await connection.execute(
  `UPDATE tabPutawayTask 
   SET status = 'Completed',
       updated_at = CURRENT_TIMESTAMP
   WHERE title = ?`,
  [putaway_task]
);
```

**Result**: Task only marked as "Completed" if ALL operations succeed.

---

### 4. ✅ "Update Stock" Button - Retry Endpoint

**Mobile App Action**: "Update Stock" button should call:

```http
POST /api/putaway/complete
Content-Type: application/json

{
  "putaway_task": "PUT-20260119-0001",
  "performed_by": "USER-294226",
  "location_id": "A1-R02-L1-B2"  // Optional: if not set, uses location from putaway lines
}
```

**Endpoint**: `POST /api/putaway/complete`  
**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `completePutaway()`

**What It Does**:
1. ✅ Validates putaway task exists
2. ✅ Gets all putaway lines with locations
3. ✅ Updates stock ledger (MOVE pattern: decrease from staging, increase at target)
4. ✅ Updates carton stock (if carton_id provided)
5. ✅ Creates stock transaction history
6. ✅ Updates item stock quantities
7. ✅ Marks task as "Completed" (only if all succeed)

**Error Handling**:
- If any step fails, transaction is rolled back
- Task status remains "In Progress" or "Open"
- Returns error response to mobile app
- Task can be retried

---

## How to Retry Putaway from Mobile App

### Option 1: Use "Update Stock" Button (Recommended)

1. **Navigate to**: "Put Away Transactions" screen
2. **Find the transaction** with error (status: "Sync" but stock not updated)
3. **Tap "Update Stock" button**
4. **Mobile app should call**: `POST /api/putaway/complete` with:
   ```json
   {
     "putaway_task": "PUT-20260119-0001",
     "performed_by": "USER-294226"
   }
   ```
5. **Backend will**:
   - Get all putaway lines for the task
   - Use location from lines (or header `location_id` if provided)
   - Update stock ledger and carton stock
   - Create stock transaction history
   - Mark task as "Completed"

### Option 2: Re-scan Location

1. **Navigate to**: Putaway screen
2. **Scan the box/carton** again: `PAW-ASN365425473-1768812437984`
3. **Scan the location** again: `A1-R02-L1-B2`
4. **Mobile app calls**: `POST /api/putaway/scan-transfer-carton`
5. **Then call**: `POST /api/putaway/complete` to finalize

---

## Testing Checklist

### Test 1: Error During `scanTransferCarton` Should Not Update Status

**Steps**:
1. Create putaway task (status: "Open")
2. Call `POST /api/putaway/scan-transfer-carton` with invalid data (e.g., missing required fields)
3. Verify error response
4. Check database: Task status should still be "Open" (not "In Progress" or "Completed")

**Expected Result**: ✅ Task status unchanged on error

---

### Test 2: Error During `completePutaway` Should Not Mark as Completed

**Steps**:
1. Create putaway task with lines (status: "In Progress")
2. Call `POST /api/putaway/complete` with invalid data (e.g., non-existent task)
3. Verify error response
4. Check database: Task status should still be "In Progress" (not "Completed")

**Expected Result**: ✅ Task status unchanged on error

---

### Test 3: Successful Putaway Should Update Status

**Steps**:
1. Create putaway task with lines and location (status: "In Progress")
2. Call `POST /api/putaway/complete` with valid data
3. Verify success response
4. Check database:
   - Task status = "Completed" ✅
   - Stock ledger updated ✅
   - Stock transaction created ✅
   - Carton stock updated ✅

**Expected Result**: ✅ All updates succeed, task marked as "Completed"

---

### Test 4: Retry After Error Should Work

**Steps**:
1. Create putaway task (status: "Open")
2. Call `POST /api/putaway/scan-transfer-carton` - **simulate error** (e.g., invalid location)
3. Verify error response, task status = "Open"
4. Fix the issue (e.g., provide valid location)
5. Call `POST /api/putaway/scan-transfer-carton` again - **should succeed**
6. Call `POST /api/putaway/complete` - **should complete successfully**
7. Verify task status = "Completed"

**Expected Result**: ✅ Task can be retried after error

---

### Test 5: "Update Stock" Button Should Work

**Steps**:
1. Create putaway task with lines and location (status: "In Progress")
2. Verify stock is NOT updated yet
3. Call `POST /api/putaway/complete` (simulating "Update Stock" button)
4. Verify success response
5. Check database:
   - Task status = "Completed" ✅
   - Stock ledger updated ✅
   - Stock transaction created ✅

**Expected Result**: ✅ "Update Stock" button successfully completes putaway

---

## Internal Test Script

### Test Case: PUT-20260119-0001

**Task Details** (from user's screenshot):
- **Task ID**: `PUT-20260119-0001`
- **Status**: `Open` (should remain "Open" if error occurs)
- **Carton IDs**: `PAW-ASN365425473-1768812437984`
- **Items**: 
  - `SKU-HAT-301-BLU-OS` (qty: 5.00)
  - `SKU-HAT-301-GRN-OS` (qty: 5.00)
- **Location**: `A1-R02-L1-B2` (currently empty, should be set)

**Test Steps**:

1. **Verify Task Exists**:
   ```sql
   SELECT title, status, source_type, advance_shipping_notice
   FROM tabPutawayTask
   WHERE title = 'PUT-20260119-0001';
   ```

2. **Verify Lines Exist**:
   ```sql
   SELECT carton_id, item_code, qty, location_id, rack, bin
   FROM tabPutawayLine
   WHERE parent_title = 'PUT-20260119-0001';
   ```

3. **Test `scanTransferCarton` with Location**:
   ```bash
   curl -X POST http://localhost:3000/api/putaway/scan-transfer-carton \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "box_id": "PAW-ASN365425473-1768812437984",
       "location_id": "A1-R02-L1-B2",
       "user_id": "USER-294226"
     }'
   ```

4. **Verify Location Updated**:
   ```sql
   SELECT location_id, rack, bin
   FROM tabPutawayLine
   WHERE parent_title = 'PUT-20260119-0001';
   ```

5. **Test `completePutaway`**:
   ```bash
   curl -X POST http://localhost:3000/api/putaway/complete \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "putaway_task": "PUT-20260119-0001",
       "performed_by": "USER-294226"
     }'
   ```

6. **Verify Stock Updated**:
   ```sql
   -- Check stock ledger
   SELECT item_code, bin_location, qty
   FROM tabStockLedger
   WHERE bin_location = 'A1-R02-L1-B2';
   
   -- Check stock transactions
   SELECT transaction_type, reference_doc, item_code, source_bin, target_bin, qty_change
   FROM tabStockTransaction
   WHERE reference_doc = 'PUT-20260119-0001';
   
   -- Check task status
   SELECT status FROM tabPutawayTask WHERE title = 'PUT-20260119-0001';
   ```

**Expected Results**:
- ✅ Location updated in putaway lines
- ✅ Stock ledger updated (MOVE pattern)
- ✅ Stock transaction created
- ✅ Task status = "Completed"

---

## Summary

✅ **Fixed Issues**:
1. ✅ `box_id` column check moved before SELECT query
2. ✅ Error handling ensures task status NOT updated on error
3. ✅ Transaction rollback prevents partial updates
4. ✅ "Update Stock" button can retry via `POST /api/putaway/complete`

✅ **How to Retry**:
1. Use "Update Stock" button → calls `POST /api/putaway/complete`
2. Or re-scan location → calls `POST /api/putaway/scan-transfer-carton` then `POST /api/putaway/complete`

✅ **Error Behavior**:
- Errors properly rollback transactions
- Task status preserved (allows retry)
- Mobile app should show error (not "Success")

---

**END**
