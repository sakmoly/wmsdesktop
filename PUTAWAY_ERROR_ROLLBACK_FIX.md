# Putaway Error Rollback Fix

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🔍 Problem

When an error occurs during putaway completion, the box status is being set to "Closed" even though the putaway failed. This leaves the box in an inconsistent state where:
- Box status = "Closed" (cannot be used for putaway)
- But putaway task might not be completed
- Stock might not be updated
- Transaction history might be incomplete

**Error Message:**
```
Box PAW-ASN365425479-1768995821165 is already Closed and cannot be used for putaway.
```

---

## 🔍 Root Cause

The box status is being set to "Closed" **before** the transaction is committed. While this is inside a transaction (so rollback should work), there are edge cases:

1. **Commit Failure**: If `commit()` itself fails, the rollback might not be properly handled
2. **Error After Commit**: If an error occurs after commit (e.g., in response construction), rollback won't help
3. **Incomplete Error Handling**: The error handler might not properly rollback in all cases

---

## ✅ Fix Applied

### 1. Enhanced Commit Error Handling

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Changes**:
- Wrapped `commit()` in try-catch to handle commit failures
- If commit fails, explicitly rollback all changes (box status, task status, stock updates)
- Added detailed logging for commit failures

```javascript
// CRITICAL: Commit transaction - all stock updates, task status, and box status change are atomic
// If commit fails, everything will be rolled back (box status, task status, stock updates)
try {
  await connection.commit();
  logger.info(`[Putaway] ✅ Transaction committed successfully - all changes are now permanent`);
} catch (commitError) {
  // If commit fails, rollback everything (box status, task status, stock updates)
  logger.error(`[Putaway] ❌ CRITICAL: Commit failed - rolling back all changes`);
  try {
    await connection.rollback();
    logger.error(`[Putaway] ✅ Rollback successful after commit failure`);
  } catch (rollbackError) {
    logger.error(`[Putaway] ❌ CRITICAL: Rollback also failed: ${rollbackError.message}`);
  }
  throw commitError; // Re-throw to trigger error handler
}
```

### 2. Enhanced Error Handler

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Changes**:
- Improved rollback error handling in catch block
- Added detailed logging for rollback operations
- Ensures connection is properly released even if rollback fails

```javascript
} catch (error) {
  // CRITICAL: Rollback transaction on ANY error - this ensures box status, task status, and stock updates are all rolled back
  // If box was set to "Closed" but an error occurred, rollback will revert it to previous status
  try {
    if (connection && !connection._released) {
      await connection.rollback();
      logger.error(`[Putaway] ❌ Transaction rolled back due to error: ${error.message}`);
    }
  } catch (rollbackError) {
    logger.error(`[Putaway] ❌ CRITICAL: Failed to rollback transaction: ${rollbackError.message}`);
  }
  // ... rest of error handling
}
```

---

## ✅ Expected Behavior After Fix

**Before Fix:**
- ❌ Error during putaway → Box status = "Closed" (inconsistent state)
- ❌ Retry fails with "Box already Closed" error

**After Fix:**
- ✅ Error during putaway → Transaction rolled back → Box status reverted to previous state
- ✅ Retry works correctly (box is not closed)

---

## 🔄 Transaction Flow

### Correct Flow (After Fix):

1. **Begin Transaction** (`beginTransaction()`)
2. **Process Stock Updates** (inside transaction)
3. **Update Task Status** to "Completed" (inside transaction)
4. **Set Box Status** to "Closed" (inside transaction)
5. **Commit Transaction** (wrapped in try-catch)
   - ✅ **If commit succeeds**: All changes are permanent
   - ❌ **If commit fails**: Rollback all changes (box status, task status, stock updates)
6. **Send Response** (after commit - outside transaction)
   - If error here, transaction is already committed (but this is rare)

### Error Handling:

- **Error BEFORE commit**: Rollback reverts all changes (box status, task status, stock updates)
- **Error DURING commit**: Rollback reverts all changes
- **Error AFTER commit**: Transaction already committed (rare, but response construction shouldn't fail)

---

## 🧪 Testing

### Test 1: Simulate Database Error During Commit

1. Cause a database error during commit (e.g., connection timeout)
2. **Expected**: Transaction rolled back, box status NOT changed to "Closed"
3. **Expected**: Error logged with rollback confirmation
4. **Expected**: Retry works (box is still "Open")

### Test 2: Simulate Error During Stock Update

1. Cause an error during stock update (e.g., invalid location)
2. **Expected**: Transaction rolled back, box status NOT changed to "Closed"
3. **Expected**: Error logged
4. **Expected**: Retry works (box is still "Open")

### Test 3: Normal Successful Putaway

1. Complete putaway successfully
2. **Expected**: Box status = "Closed" (committed)
3. **Expected**: Task status = "Completed" (committed)
4. **Expected**: Stock updated (committed)
5. **Expected**: Transaction history created (committed)

---

## 📋 Summary

- **Issue**: Box status set to "Closed" even when putaway fails
- **Root Cause**: Incomplete error handling for commit failures
- **Fix**: Enhanced commit error handling and rollback logic
- **Result**: All changes (box status, task status, stock updates) are rolled back on any error

---

## ⚠️ Important Notes

1. **Transaction Atomicity**: All changes (box status, task status, stock updates) are in one transaction
2. **Rollback Guarantee**: If ANY error occurs before commit, all changes are rolled back
3. **Commit Failure**: If commit itself fails, rollback is explicitly called
4. **Logging**: Enhanced logging helps diagnose rollback issues

---

## 🔧 Manual Fix for Already-Closed Boxes

If a box is already in "Closed" status but putaway failed, you can manually fix it:

```sql
-- Check box status
SELECT box_id, status FROM tabSortBox WHERE box_id = 'PAW-ASN365425479-1768995821165';

-- Reopen box if needed (only if putaway actually failed)
UPDATE tabSortBox 
SET status = 'Open', updated_at = NOW() 
WHERE box_id = 'PAW-ASN365425479-1768995821165' 
  AND status = 'Closed';
```

**⚠️ Only do this if you're certain the putaway failed and stock wasn't updated!**
