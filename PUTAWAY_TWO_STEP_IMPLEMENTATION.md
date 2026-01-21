# Two-Step Putaway Implementation

**Date**: 2026-01-17  
**Status**: ✅ **IMPLEMENTED**

---

## Summary

Implemented strict two-step putaway workflow:
1. **Step 1: Scan Location** - Only assigns location, status = "In Progress", NO stock update
2. **Step 2: Complete Put Away** - Updates stock atomically, status = "Completed", with retry guarantee

---

## Problem

**Before**:
- `scanTransferCarton` auto-completed putaway when location was provided
- If completion failed, task was already marked "Completed" (no retry)
- Stock updates happened in scan step (wrong separation of concerns)

**Required**:
- Scan location → Only assign location, status = "In Progress"
- Complete putaway → Update stock atomically, status = "Completed"
- If completion fails → Rollback, status remains "In Progress", user can retry

---

## Solution Implemented

### ✅ 1. Disabled Auto-Complete in `scanTransferCarton`

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `scanTransferCarton()`

**Change**: Removed auto-complete logic. Now only assigns location:

```javascript
// TWO-STEP PUTAWAY: scanTransferCarton only assigns location, does NOT update stock
// Stock update happens only in completePutaway endpoint (separate step)
// This ensures atomic stock updates and allows retry if completion fails
console.log(`[Putaway] ✅ Location assigned to task ${putawayTaskTitle} - status: "In Progress" (stock will NOT be updated until completion)`);
```

**Result**: 
- ✅ Location assigned to putaway lines
- ✅ Task status = "In Progress"
- ✅ Stock NOT updated
- ✅ Repeatable (can scan location again to update)

---

### ✅ 2. Enhanced `completePutaway` with Atomic Transaction & Retry Guarantee

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `completePutaway()`

#### A) Validation & Locking

```javascript
// Validate task is in correct state
if (currentStatus !== "In Progress" && currentStatus !== "Open") {
  return res.status(400).json({
    ok: false,
    step: "COMPLETE",
    error: {
      code: "INVALID_TASK_STATUS",
      message: "Task must be 'In Progress' or 'Open'. Please scan location first."
    }
  });
}

// Lock task row FOR UPDATE to prevent double completion
const [lockedTask] = await connection.execute(
  `SELECT status, location_id FROM tabPutawayTask WHERE title = ? FOR UPDATE`,
  [actualPutawayTask]
);

// Validate location was scanned
if (!taskLocationId && !taskRack) {
  return res.status(400).json({
    ok: false,
    step: "COMPLETE",
    error: {
      code: "LOCATION_NOT_SCANNED",
      message: "Cannot complete putaway: location not scanned. Please scan location first."
    }
  });
}
```

#### B) Atomic Stock Updates

```javascript
// All stock updates happen in ONE transaction
await connection.beginTransaction();

// ... perform all stock updates (MOVE pattern) ...

// CRITICAL: Update status to Completed ONLY after all stock updates succeed
await connection.execute(
  `UPDATE tabPutawayTask SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE title = ?`,
  [actualPutawayTask]
);

// Commit transaction - all updates are atomic
await connection.commit();
```

#### C) Error Handling & Retry Guarantee

```javascript
} catch (error) {
  // CRITICAL: Rollback transaction on ANY error
  // This ensures task status remains "In Progress" and user can retry
  await connection.rollback();
  console.error(`[Putaway] ❌ Failed to complete putaway: ${error}`);
  console.error(`[Putaway] ⚠️ Transaction rolled back - task status remains "In Progress", user can retry`);
  
  res.status(500).json({
    ok: false,
    step: "COMPLETE",
    error: {
      code: "DATABASE_ERROR",
      message: "Failed to complete putaway"
    },
    data: {
      putaway_task: actualPutawayTask,
      status: "In Progress", // Status NOT updated due to error
      stock_updated: false,
      retry_available: true // User can retry after fixing issue
    }
  });
}
```

#### D) Idempotency

```javascript
// If task already completed, return success (not error)
if (currentStatus === "Completed") {
  await connection.rollback();
  connection.release();
  
  return res.json({
    ok: true,
    step: "COMPLETE",
    message: "Putaway task already completed (idempotent)",
    data: {
      putaway_task: actualPutawayTask,
      status: "Completed",
      stock_updated: true,
      already_completed: true
    }
  });
}
```

---

## API Endpoints

### 1. POST /api/putaway/scan-transfer-carton

**Purpose**: Scan location and assign to putaway task (Step 1)

**Request**:
```json
{
  "tc_id": "PAW-ASN365425473-1768812437984",
  "box_id": "PAW-ASN365425473-1768812437984", // Optional
  "location_id": "A1-R02-L1-B2",
  "rack": "Rack 02",
  "bin": "B2",
  "user_id": "USER-294226"
}
```

**Response**:
```json
{
  "ok": true,
  "step": "SCAN",
  "message": "Putaway task created and location assigned successfully",
  "data": {
    "putaway_task": "PUT-20260119-0001",
    "putaway_task_id": "PUT-20260119-0001",
    "tc_id": "PAW-ASN365425473-1768812437984",
    "status": "In Progress",
    "stock_updated": false,
    "location_id": "A1-R02-L1-B2",
    "to_location_id": "A1-R02-L1-B2",
    "lines": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "carton_id": "CTN-001",
        "qty": 5.0,
        "rack": "Rack 02",
        "bin": "B2",
        "location_id": "A1-R02-L1-B2"
      }
    ],
    "next_step": "Complete putaway using POST /api/putaway/complete with tc_id or putaway_task"
  }
}
```

**Behavior**:
- ✅ Creates/updates putaway task
- ✅ Assigns location to putaway lines
- ✅ Sets status = "In Progress"
- ✅ **Does NOT update stock**
- ✅ Repeatable (can scan location again)

---

### 2. POST /api/putaway/complete

**Purpose**: Complete putaway and update stock (Step 2)

**Request**:
```json
{
  "tc_id": "PAW-ASN365425473-1768812437984",
  "box_id": "PAW-ASN365425473-1768812437984", // Optional
  "putaway_task": "PUT-20260119-0001", // Optional if tc_id/box_id provided
  "performed_by": "USER-294226",
  "user_id": "USER-294226"
}
```

**Response (Success)**:
```json
{
  "ok": true,
  "step": "COMPLETE",
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20260119-0001",
    "putaway_task_id": "PUT-20260119-0001",
    "status": "Completed",
    "stock_updated": true,
    "moved_lines": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "carton_id": "CTN-001",
        "from_location_id": "STAGING-01",
        "to_location_id": "A1-R02-L1-B2",
        "qty": 5.0
      }
    ],
    "to_location_id": "A1-R02-L1-B2",
    "from_location_id": "STAGING-01"
  }
}
```

**Response (Error - Retry Available)**:
```json
{
  "ok": false,
  "step": "COMPLETE",
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to complete putaway"
  },
  "data": {
    "putaway_task": "PUT-20260119-0001",
    "status": "In Progress", // Status NOT updated
    "stock_updated": false,
    "retry_available": true // User can retry
  }
}
```

**Response (Idempotent - Already Completed)**:
```json
{
  "ok": true,
  "step": "COMPLETE",
  "message": "Putaway task already completed (idempotent)",
  "data": {
    "putaway_task": "PUT-20260119-0001",
    "status": "Completed",
    "stock_updated": true,
    "already_completed": true
  }
}
```

**Behavior**:
- ✅ Validates task status ("In Progress" or "Open")
- ✅ Validates location was scanned
- ✅ Locks task row (prevents double completion)
- ✅ Updates stock atomically (MOVE pattern)
- ✅ Updates status to "Completed" ONLY after all stock updates succeed
- ✅ On error: Rollback, status remains "In Progress", user can retry
- ✅ Idempotent: If already completed, returns success (no duplicate updates)

---

## Workflow

### Two-Step Process:

```
Step 1: Scan Location
  ↓
POST /api/putaway/scan-transfer-carton { tc_id, location_id }
  ↓
Backend:
  - Creates/updates putaway task
  - Assigns location to lines
  - Sets status = "In Progress"
  - Does NOT update stock ✅
  ↓
Response: { status: "In Progress", stock_updated: false }

Step 2: Complete Put Away
  ↓
POST /api/putaway/complete { tc_id }
  ↓
Backend:
  - Validates task status ("In Progress")
  - Validates location was scanned
  - Locks task row
  - BEGIN TRANSACTION
  - Updates stock (MOVE pattern)
  - Updates status = "Completed"
  - COMMIT
  ↓
Response: { status: "Completed", stock_updated: true }
```

### Error Handling:

```
Step 2: Complete Put Away (with error)
  ↓
POST /api/putaway/complete { tc_id }
  ↓
Backend:
  - BEGIN TRANSACTION
  - Updates stock (MOVE pattern)
  - ERROR occurs (e.g., database error)
  - ROLLBACK ✅
  - Status remains "In Progress" ✅
  ↓
Response: { ok: false, status: "In Progress", retry_available: true }
  ↓
User can retry:
  ↓
POST /api/putaway/complete { tc_id } (retry)
  ↓
Backend:
  - BEGIN TRANSACTION
  - Updates stock (MOVE pattern)
  - Updates status = "Completed"
  - COMMIT ✅
  ↓
Response: { ok: true, status: "Completed", stock_updated: true }
```

---

## Transaction Safety

### Atomic Completion:

```javascript
BEGIN TRANSACTION
  ↓
Lock task row FOR UPDATE
  ↓
Validate task status ("In Progress")
  ↓
Validate location was scanned
  ↓
For each putaway line:
  - Determine from_location_id
  - Decrease stock at FROM location
  - Increase stock at TO location
  - Update carton stock
  - Create stock transaction
  ↓
Update task status = "Completed"
  ↓
COMMIT
```

**If ANY step fails**:
- ROLLBACK
- Status remains "In Progress"
- Stock unchanged
- User can retry

---

## Retry Guarantee

**Key Requirements Met**:
- ✅ If completion fails, task status remains "In Progress"
- ✅ Task NOT deleted/hidden
- ✅ Task remains in putaway list
- ✅ User can retry after fixing issue
- ✅ Idempotent (safe to retry multiple times)

**Mobile App Behavior**:
- Should NOT remove TC from list if `ok: false`
- Should show error message
- Should allow user to press "Complete" again
- Should remove TC from list ONLY when `ok: true` and `status: "Completed"`

---

## Testing

### Test 1: Two-Step Process
1. ✅ Scan location → Task status = "In Progress", stock NOT updated
2. ✅ Complete putaway → Stock updated, status = "Completed"

### Test 2: Error Handling & Retry
1. ✅ Simulate error during completion (throw error in stock update)
2. ✅ Verify: Transaction rolled back, status = "In Progress"
3. ✅ Retry completion → Should succeed

### Test 3: Idempotency
1. ✅ Complete putaway → Success
2. ✅ Complete again → Returns success (idempotent), no duplicate stock updates

### Test 4: Validation
1. ✅ Try to complete without scanning location → Error: "LOCATION_NOT_SCANNED"
2. ✅ Try to complete task with status "Completed" → Returns success (idempotent)

---

## Summary

✅ **Implemented**:
1. ✅ Disabled auto-complete in `scanTransferCarton`
2. ✅ Enhanced `completePutaway` with atomic transaction
3. ✅ Added task locking (prevents double completion)
4. ✅ Added validation (status, location)
5. ✅ Moved status update to END (after all stock updates)
6. ✅ Added error handling with rollback
7. ✅ Added retry guarantee (status remains "In Progress" on error)
8. ✅ Added idempotency (returns success if already completed)

✅ **Result**:
- ✅ Strict two-step workflow (scan → complete)
- ✅ Atomic stock updates (all or nothing)
- ✅ Retry guarantee (user can retry if completion fails)
- ✅ Idempotent (safe to retry)
- ✅ Proper error handling (rollback on error)

---

**END**
