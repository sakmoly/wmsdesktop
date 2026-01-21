# Putaway Retry After Error Fix

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🔍 Problem

When a putaway fails (e.g., due to database error, network issue, or validation error), the box status is set to "Closed" but the putaway task is NOT completed. This prevents users from retrying the putaway because:

1. **Box Status = "Closed"** (preventing retry)
2. **Task Status ≠ "Completed"** (putaway not actually finished)
3. **User cannot retry** (box validation rejects closed boxes)

**Error Message:**
```
Box PAW-ASN365425479-1768995821165 is already Closed and cannot be used for putaway.
```

---

## 🔍 Root Cause

The validation logic in `scanTransferCarton` and `completePutaway` was checking box status but NOT verifying if the putaway task was actually completed. This led to:

- Box marked as "Closed" (due to partial transaction commit or error)
- Task still in "Open" or "In Progress" status
- User cannot retry because box is closed

---

## ✅ Fix Applied

### 1. Enhanced Box Status Validation in `scanTransferCarton`

**File**: `wms-api/src/modules/putaway/putawayController.js` (around line 4144)

**Changes**:
- When box status is "Closed", check if putaway task is actually completed
- If task is NOT completed, automatically reopen the box and allow putaway to proceed
- If task IS completed, reject (true idempotency)

```javascript
// Validate box status (should be Open or Assigned, not Closed/Completed)
// BUT: If box is Closed but putaway task is NOT completed, allow retry (reopen box)
if (box.status === 'Closed' || box.status === 'Completed' || box.status === 'Dispatched') {
  // Check if putaway task exists and is actually completed
  const [putawayTaskCheck] = await connection.execute(`
    SELECT DISTINCT pt.parent_title, pt.status as task_status
    FROM tabPutawayLine pt
    WHERE (pt.carton_id = ? OR pt.box_id = ?)
    ORDER BY pt.parent_title DESC
    LIMIT 1
  `, [validatedBoxId, validatedBoxId]);
  
  let allowRetry = false;
  let taskTitle = null;
  
  if (putawayTaskCheck.length > 0) {
    taskTitle = putawayTaskCheck[0].parent_title;
    
    // Check actual task status from tabPutawayTask
    const [taskStatusCheck] = await connection.execute(`
      SELECT status FROM tabPutawayTask WHERE title = ? LIMIT 1
    `, [taskTitle]);
    
    if (taskStatusCheck.length > 0) {
      const actualTaskStatus = taskStatusCheck[0].status;
      // If task is NOT "Completed", allow retry (box was closed but putaway failed)
      if (actualTaskStatus !== 'Completed' && actualTaskStatus !== 'Closed') {
        allowRetry = true;
        
        // Reopen the box to allow putaway retry
        await connection.execute(`
          UPDATE tabsortbox
          SET status = 'Open', updated_at = CURRENT_TIMESTAMP
          WHERE box_id = ?
        `, [validatedBoxId]);
        
        logger.info(`[Putaway] ✅ Reopened box ${validatedBoxId} for putaway retry`);
        // Continue with putaway - box is now Open
      }
    }
  }
  
  // If task is completed or no task found, reject (idempotency)
  if (!allowRetry) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "BOX_ALREADY_PROCESSED",
        message: `Box ${validatedBoxId} is already ${box.status} and cannot be used for putaway.`,
      },
    });
  }
  // If allowRetry is true, continue with putaway (box has been reopened)
}
```

### 2. Enhanced Idempotency Check in `completePutaway`

**File**: `wms-api/src/modules/putaway/putawayController.js` (around line 1065)

**Changes**:
- When box is "Closed", verify task is actually completed before returning success
- If task is NOT completed, reopen box and allow putaway to proceed
- Only return "already completed" if task is truly completed

```javascript
// IDEMPOTENCY: If box is already closed, check if task is actually completed
// If task is NOT completed, reopen box and allow putaway to proceed (retry after error)
if (boxStatus === "Closed") {
  // Find the putaway task for this box
  const [taskFromBox] = await connection.execute(/* ... */);
  const completedTask = taskFromBox.length > 0 ? taskFromBox[0].parent_title : null;
  
  // Check if task is actually completed
  let taskIsCompleted = false;
  if (completedTask) {
    const [taskStatusCheck] = await connection.execute(
      `SELECT status FROM tabPutawayTask WHERE title = ? LIMIT 1`,
      [completedTask]
    );
    
    if (taskStatusCheck.length > 0) {
      const actualTaskStatus = taskStatusCheck[0].status;
      taskIsCompleted = (actualTaskStatus === 'Completed' || actualTaskStatus === 'Closed');
      
      // If task is NOT completed, reopen box and allow retry
      if (!taskIsCompleted) {
        logger.warn(`[Putaway] Box ${box_id} is Closed but task ${completedTask} is ${actualTaskStatus} - reopening box for retry`);
        
        // Reopen the box
        await connection.execute(
          `UPDATE tabsortbox
           SET status = 'Open', updated_at = CURRENT_TIMESTAMP
           WHERE box_id = ?`,
          [box_id]
        );
        
        logger.info(`[Putaway] ✅ Reopened box ${box_id} for putaway retry`);
        // Continue with putaway - box is now Open, don't return early
      }
    }
  }
  
  // Only return success if task is actually completed (true idempotency)
  if (taskIsCompleted) {
    return res.json({
      ok: true,
      already_completed: true,
      box_id: box_id,
      putaway_task: completedTask,
      message: "Putaway already completed (idempotent - box already closed and task completed)"
    });
  }
  // If task is NOT completed, continue with putaway (box has been reopened above)
}
```

---

## ✅ Expected Behavior After Fix

### Before Fix:
- ❌ Error during putaway → Box status = "Closed" → User cannot retry
- ❌ Error message: "Box already Closed and cannot be used for putaway"

### After Fix:
- ✅ Error during putaway → Box status = "Closed" but task NOT completed
- ✅ User scans box again → System detects task NOT completed
- ✅ System automatically reopens box → User can retry putaway
- ✅ Putaway completes successfully → Box closed again (this time permanently)

---

## 🔄 Retry Flow

### Scenario: Putaway Fails

1. **User completes putaway** → `completePutaway` called
2. **Error occurs** (e.g., database error, validation error)
3. **Transaction rolled back** → Box status should revert, but might be "Closed" if commit partially succeeded
4. **Task status** = "Open" or "In Progress" (NOT "Completed")

### Scenario: User Retries

1. **User scans box again** → `scanTransferCarton` called
2. **System detects** box status = "Closed"
3. **System checks** task status → NOT "Completed"
4. **System automatically reopens box** → `UPDATE tabsortbox SET status = 'Open'`
5. **User can proceed** with putaway → Putaway completes successfully
6. **Box closed again** → This time permanently (task completed)

---

## 🧪 Testing

### Test 1: Retry After Error

1. **Complete putaway** → Cause an error (e.g., invalid location)
2. **Verify** box status = "Closed" but task status ≠ "Completed"
3. **Scan box again** → Should automatically reopen box
4. **Complete putaway** → Should succeed
5. **Verify** box status = "Closed" and task status = "Completed"

### Test 2: True Idempotency

1. **Complete putaway successfully** → Box = "Closed", Task = "Completed"
2. **Scan box again** → Should reject with "Box already Closed"
3. **Verify** no duplicate putaway records created

### Test 3: Multiple Retries

1. **Complete putaway** → Error occurs
2. **Retry 1** → Box reopened, putaway fails again
3. **Retry 2** → Box reopened again, putaway succeeds
4. **Verify** final state: Box = "Closed", Task = "Completed"

---

## 📋 Summary

- **Issue**: Users cannot retry putaway when box is closed but task is not completed
- **Root Cause**: Validation checked box status but not task completion status
- **Fix**: Enhanced validation to check task status and automatically reopen box if task is not completed
- **Result**: Users can retry putaway after errors, system automatically handles box reopening

---

## ⚠️ Important Notes

1. **Automatic Reopening**: System automatically reopens box if task is not completed (no manual intervention needed)
2. **True Idempotency**: Only returns "already completed" if task is truly completed
3. **Logging**: Enhanced logging helps track box reopening and retry attempts
4. **Transaction Safety**: Box reopening happens in the same transaction as validation

---

## 🔧 Manual Fix (If Needed)

If a box is stuck in "Closed" status but task is not completed, you can manually reopen it:

```sql
-- Check box and task status
SELECT 
  b.box_id, 
  b.status as box_status,
  pt.title as task_title,
  pt.status as task_status
FROM tabSortBox b
LEFT JOIN tabPutawayLine pl ON (pl.carton_id = b.box_id OR pl.box_id = b.box_id)
LEFT JOIN tabPutawayTask pt ON pt.title = pl.parent_title
WHERE b.box_id = 'PAW-ASN365425479-1768995821165';

-- Reopen box if task is not completed
UPDATE tabSortBox 
SET status = 'Open', updated_at = NOW() 
WHERE box_id = 'PAW-ASN365425479-1768995821165' 
  AND status = 'Closed';
```

**⚠️ Only do this if you're certain the putaway failed and stock wasn't updated!**
