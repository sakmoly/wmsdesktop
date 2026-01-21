# Putaway Duplicate Event Prevention

**Date**: 2026-01-17  
**Status**: ✅ **IMPLEMENTED**

---

## Problem

**Issue**: When users click "Complete Putaway" multiple times, the mobile app sends duplicate `PUTAWAY_TO_RACK` events, causing stock to be updated multiple times (0 → 5 → 10 → 15 → 20).

**Root Cause**: 
- No idempotency checks to prevent duplicate processing
- Events processed independently without coordination
- Stock ledger updated multiple times for the same putaway task

---

## Solution Implemented

### ✅ Multi-Layer Duplicate Prevention

**Three layers of protection** to prevent duplicate processing even if the user clicks multiple times:

---

### Layer 1: Early Event Filtering (Before Insert)

**Location**: `wms-api/src/modules/events/eventController.js` (lines ~417-464)

**What It Does**:
- Checks if a `PUTAWAY_TO_RACK` event for the same `tc_id` has already been processed
- Verifies if stock transactions already exist for the putaway task
- Verifies if the putaway task is already marked as "Completed"
- **Skips the event BEFORE inserting it into the database**

**Code**:
```javascript
// CRITICAL: Prevent duplicate PUTAWAY_TO_RACK events for the same task
if ((event_type === 'PUTAWAY_TO_RACK' || event_type === 'PUTAWAY_CONFIRM' || event_type === 'PUTAWAY_COMPLETE') && tc_id) {
  // Find putaway task from tc_id
  // Check if stock transactions already exist
  // Check if task is already completed
  if (existingTransactions.length > 0 || taskStatus[0].status === 'Completed') {
    console.log(`⏭️ Skipping duplicate ${event_type} event...`);
    continue; // Skip this event - already processed
  }
}
```

**Result**: Duplicate events are filtered out before they're even saved to the database.

---

### Layer 2: Row-Level Locking (During Processing)

**Location**: `wms-api/src/modules/events/eventController.js` (lines ~1078-1116)

**What It Does**:
- Uses `FOR UPDATE` row lock on the putaway task
- Ensures only ONE process can handle the task at a time
- Prevents concurrent processing of the same task
- Checks idempotency WITHIN the locked transaction

**Code**:
```javascript
// BEGIN TRANSACTION with row lock
await connection.beginTransaction();

try {
  // Lock the putaway task row to prevent concurrent processing
  const [taskStatus] = await connection.execute(
    `SELECT status FROM tabPutawayTask WHERE title = ? FOR UPDATE`,
    [putawayTaskTitle]
  );
  
  // IDEMPOTENCY CHECK 1: Skip if task is already marked as Completed
  if (taskStatus[0].status === 'Completed') {
    await connection.rollback();
    return; // Task already completed
  }
  
  // IDEMPOTENCY CHECK 2: Check if stock has already been moved
  const [existingTransactions] = await connection.execute(
    `SELECT id FROM tabStockTransaction 
     WHERE transaction_type = 'Putaway' AND reference_doc = ? 
     LIMIT 1`,
    [putawayTaskTitle]
  );
  
  if (existingTransactions.length > 0) {
    await connection.rollback();
    return; // Stock already moved
  }
  
  // Process stock updates...
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
}
```

**Result**: Even if multiple events arrive simultaneously, only ONE will process the task (others will see it's already completed and skip).

---

### Layer 3: Stock Transaction Idempotency (During Stock Updates)

**Location**: `wms-api/src/modules/events/eventController.js` (lines ~1359-1398)

**What It Does**:
- Checks if a stock transaction already exists before creating a new one
- Prevents duplicate stock transaction records
- Uses unique key: `transaction_type + reference_doc + item_code + target_bin + carton_id`

**Code**:
```javascript
// Check for existing transaction to prevent duplicates (idempotency)
const [existingTransaction] = await connection.execute(
  `SELECT id FROM tabStockTransaction
   WHERE transaction_type = 'Putaway'
     AND reference_doc = ?
     AND item_code = ?
     AND target_bin = ?
     AND carton_id = ?`,
  [putawayTaskTitle, itemCode, binLocation, cartonId || null]
);

if (existingTransaction.length === 0) {
  // No duplicate - safe to insert
  await connection.execute(`INSERT INTO tabStockTransaction ...`);
} else {
  console.log(`[Putaway Event] ⏭️ Skipped duplicate stock transaction...`);
}
```

**Result**: Even if stock ledger is updated, duplicate transaction records are prevented.

---

## How It Works Together

### Scenario: User Clicks "Complete" 4 Times

**Event 1** (First Click):
1. ✅ Passes Layer 1 (no existing transactions)
2. ✅ Acquires row lock (Layer 2)
3. ✅ Passes idempotency checks (Layer 2)
4. ✅ Processes stock updates
5. ✅ Creates stock transactions (Layer 3)
6. ✅ Marks task as "Completed"
7. ✅ Commits transaction

**Event 2** (Second Click - Arrives 0.1s later):
1. ❌ **BLOCKED by Layer 1**: Stock transactions already exist → **SKIPPED**

**Event 3** (Third Click - Arrives 0.2s later):
1. ❌ **BLOCKED by Layer 1**: Task already completed → **SKIPPED**

**Event 4** (Fourth Click - Arrives 0.3s later):
1. ❌ **BLOCKED by Layer 1**: Task already completed → **SKIPPED**

**Result**: Only Event 1 is processed. Events 2, 3, and 4 are skipped.

---

## Edge Case: Concurrent Events (Same Millisecond)

**Scenario**: Two events arrive at the exact same time (before Event 1 completes).

**Event 1**:
1. ✅ Passes Layer 1 (no existing transactions yet)
2. ✅ Acquires row lock (Layer 2) - **LOCKS THE ROW**
3. ✅ Processes stock updates
4. ✅ Commits transaction

**Event 2** (Arrives at same time):
1. ✅ Passes Layer 1 (no existing transactions yet - Event 1 hasn't committed)
2. ⏳ **WAITS** for row lock (Event 1 has the lock)
3. ✅ Lock released (Event 1 committed)
4. ❌ **BLOCKED by Layer 2**: Task already completed → **SKIPPED**

**Result**: Even concurrent events are handled correctly. Only one processes, the other waits and then skips.

---

## Transaction Safety

### ✅ Proper Transaction Handling

**Before Fix**:
- Transaction started but not properly committed
- Code outside try-catch block
- Errors could leave transaction open

**After Fix**:
- ✅ All processing wrapped in try-catch
- ✅ Transaction committed on success
- ✅ Transaction rolled back on error
- ✅ Row-level locking prevents race conditions

**Code Structure**:
```javascript
await connection.beginTransaction();

try {
  // Lock row
  // Check idempotency
  // Process stock updates
  // Mark task as completed
  await connection.commit(); // ✅ Commit on success
} catch (error) {
  await connection.rollback(); // ✅ Rollback on error
  throw error;
}
```

---

## Testing

### Test Case 1: Multiple Clicks (Sequential)

**Steps**:
1. User clicks "Complete Putaway" 5 times quickly
2. Mobile app sends 5 `PUTAWAY_TO_RACK` events

**Expected**:
- ✅ Only first event processes stock
- ✅ Events 2-5 are skipped (Layer 1)
- ✅ Stock updated only once (0 → 5, not 0 → 25)
- ✅ Task marked as "Completed" once
- ✅ Only 1 stock transaction created per item

**Verify**:
```sql
-- Check stock ledger (should be 5, not 25)
SELECT qty FROM tabStockLedger 
WHERE item_code = 'SKU-HAT-301-BLU-OS' AND bin_location = 'Rack 02-B2';

-- Check stock transactions (should be 1 per item, not 5)
SELECT COUNT(*) FROM tabStockTransaction 
WHERE transaction_type = 'Putaway' AND reference_doc = 'PUT-20260119-0001';

-- Check task status (should be Completed)
SELECT status FROM tabPutawayTask WHERE title = 'PUT-20260119-0001';
```

---

### Test Case 2: Concurrent Events (Same Time)

**Steps**:
1. Simulate 3 events arriving at the exact same time
2. All 3 try to process the same putaway task

**Expected**:
- ✅ One event acquires row lock and processes
- ✅ Other 2 events wait for lock
- ✅ When lock released, other 2 see task is completed and skip
- ✅ Stock updated only once

**Verify**:
- Check backend logs for "Skipping duplicate" messages
- Verify only one set of stock updates

---

### Test Case 3: Network Retry

**Steps**:
1. User clicks "Complete Putaway" once
2. Network is slow, mobile app retries 3 times
3. All 4 requests arrive at backend

**Expected**:
- ✅ First request processes successfully
- ✅ Retry requests 2-4 are skipped (Layer 1)
- ✅ Stock updated only once

---

## Backend Logs

### Success (First Event):
```
✅ Inserted event: PUTAWAY_TO_RACK (3382eb10...)
[Putaway Event] ✅ Processed putaway completion event: Updated stock for putaway task PUT-20260119-0001
[Putaway Event] ✅ Created stock transaction: SKU-HAT-301-BLU-OS from STAGE-01 to Rack 02-B2
```

### Skipped (Duplicate Events):
```
⏭️ Skipping duplicate PUTAWAY_TO_RACK event: Task PUT-20260119-0001 already has stock transactions (tc_id: PAW-ASN365425473-1768818088781)
⏭️ Skipping duplicate PUTAWAY_TO_RACK event: Task PUT-20260119-0001 already completed (tc_id: PAW-ASN365425473-1768818088781)
[Putaway Event] ⏭️ Skipping duplicate processing: Task PUT-20260119-0001 already marked as Completed
```

---

## Summary

✅ **Three Layers of Protection**:
1. ✅ **Early Event Filtering** - Prevents duplicate events from being inserted
2. ✅ **Row-Level Locking** - Prevents concurrent processing
3. ✅ **Stock Transaction Idempotency** - Prevents duplicate transaction records

✅ **Transaction Safety**:
- ✅ Proper try-catch blocks
- ✅ Commit on success
- ✅ Rollback on error
- ✅ Row-level locking prevents race conditions

✅ **Result**:
- ✅ Duplicate events are safely ignored
- ✅ Stock updated only once (even with multiple clicks)
- ✅ No duplicate transaction records
- ✅ Task marked as "Completed" only once

---

**END**
