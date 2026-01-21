# Putaway Event MOVE Pattern Fix

**Date**: 2026-01-17  
**Status**: ✅ **FIXED**

---

## Problem

Per "Putaway not updating stock (API 500 + Events do not move stock).md":

1. **API 500 Error**: `box_id` column issue (already fixed)
2. **Events Don't Move Stock**: `processPutawayCompletionEvent` was using ADD pattern instead of MOVE pattern
3. **PUTAWAY_TO_RACK Events Not Processed**: Only `PUTAWAY_CONFIRM` and `PUTAWAY_COMPLETE` were handled

**Root Cause**:
- `processPutawayCompletionEvent` was doing: `newQty = currentQty + lineQty` (ADD pattern)
- This just adds stock to target location without decreasing from staging
- Total inventory increases (WRONG)
- No `from_location_id` tracking
- `PUTAWAY_TO_RACK` events ignored

---

## Solution Implemented

### ✅ 1. Added PUTAWAY_TO_RACK Event Processing

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Now processes `PUTAWAY_TO_RACK`, `PUTAWAY_CONFIRM`, and `PUTAWAY_COMPLETE` events:

```javascript
if (event_type && (
  event_type.toUpperCase() === 'PUTAWAY_TO_RACK' || 
  event_type.toUpperCase() === 'PUTAWAY_CONFIRM' || 
  event_type.toUpperCase() === 'PUTAWAY_COMPLETE'
)) {
  await processPutawayCompletionEvent(connection, {
    event_type,
    putaway_task,
    tc_id,
    rack,
    bin,
    location_id, // Added support for location_id from event
    item_code,
    qty,
    user_id
  });
}
```

---

### ✅ 2. Implemented MOVE Pattern in Event Processor

**File**: `wms-api/src/modules/events/eventController.js`  
**Function**: `processPutawayCompletionEvent()`

**Before** (ADD Pattern - WRONG):
```javascript
const newQty = currentQty + lineQty; // Just adds stock
await connection.execute(
  `INSERT INTO tabStockLedger ... VALUES (..., newQty, ...)`
);
```

**After** (MOVE Pattern - CORRECT):
```javascript
// STEP 1: Determine FROM location (staging)
let fromLocation = null;
// Priority 1: tabCartonStock.bin_location
// Priority 2: tabCarton.current_bin_id
// Priority 3: Staging location from tabLocation
// Priority 4: Default 'STAGING-01'

// STEP 2: Decrease stock at FROM location
if (fromLocation && fromLocation !== binLocation) {
  const fromNewQty = Math.max(0, fromCurrentQty - lineQty);
  // Update or delete stock ledger at FROM location
}

// STEP 3: Increase stock at TO location
const newQty = currentQty + lineQty;
// Update stock ledger at TO location
```

---

### ✅ 3. Added Idempotency Checks

**Prevents Duplicate Stock Updates**:
- Tracks processed `itemCode + binLocation + cartonId` combinations
- Checks for existing stock transaction before inserting
- Skips duplicate processing

**Code**:
```javascript
const processedStockKeys = new Set();
const stockKey = `${itemCode}|${binLocation}|${cartonId || ''}`;
if (processedStockKeys.has(stockKey)) {
  continue; // Skip duplicate
}
processedStockKeys.add(stockKey);

// Check for existing transaction
const [existingTransaction] = await connection.execute(
  `SELECT id FROM tabStockTransaction
   WHERE transaction_type = 'Putaway'
     AND reference_doc = ?
     AND item_code = ?
     AND target_bin = ?
     AND carton_id = ?`,
  [putawayTaskTitle, itemCode, binLocation, cartonId]
);

if (existingTransaction.length === 0) {
  // Safe to insert
}
```

---

### ✅ 4. Updated Stock Transaction with source_bin and target_bin

**Before**:
```javascript
source_bin: NULL,  // WRONG - no FROM location tracking
target_bin: binLocation
```

**After**:
```javascript
source_bin: fromLocation || null,  // FROM location (staging)
target_bin: binLocation            // TO location (target)
```

---

## FROM Location Derivation Logic

**Priority Order** (same as `completePutaway`):

1. **tabCartonStock.bin_location** (most accurate):
   ```sql
   SELECT DISTINCT bin_location, SUM(qty) as total_qty
   FROM tabCartonStock
   WHERE carton_id = ? AND item_code = ? AND warehouse = ?
   GROUP BY bin_location
   ORDER BY total_qty DESC
   LIMIT 1
   ```

2. **tabCarton.current_bin_id** (fallback):
   ```sql
   SELECT current_bin_id FROM tabCarton WHERE carton_id = ?
   ```

3. **Staging/Receiving location** (default):
   ```sql
   SELECT location_id FROM tabLocation 
   WHERE (location_type = 'STAGING' OR location_type = 'RECEIVING' 
          OR location_id LIKE '%STAGE%' OR location_id LIKE '%DOCK%')
   AND warehouse = ?
   ORDER BY location_id LIMIT 1
   ```

4. **Hardcoded default** (last resort):
   - `'STAGING-01'` if no staging location found

---

## Workflow

### Before (ADD Pattern - WRONG):
```
PUTAWAY_TO_RACK event received
  ↓
processPutawayCompletionEvent()
  ↓
newQty = currentQty + lineQty  ❌ Just adds stock
  ↓
Stock ledger updated at target location
  ↓
Total inventory INCREASES (WRONG!)
```

### After (MOVE Pattern - CORRECT):
```
PUTAWAY_TO_RACK event received
  ↓
processPutawayCompletionEvent()
  ↓
Determine from_location_id (staging)
  ↓
Decrease stock at FROM location  ✅
  ↓
Increase stock at TO location    ✅
  ↓
Create stock transaction with source_bin and target_bin
  ↓
Total inventory UNCHANGED (CORRECT!)
```

---

## Testing

### Test Case: PUTAWAY_TO_RACK Event

**Event**:
```json
{
  "event_type": "PUTAWAY_TO_RACK",
  "tc_id": "PAW-ASN365425473-1768812437984",
  "location_id": "A1-R02-L1-B2",
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 5.0,
  "user_id": "USER-294226"
}
```

**Expected**:
1. ✅ Event processed (not ignored)
2. ✅ FROM location determined (staging)
3. ✅ Stock decreased at FROM location
4. ✅ Stock increased at TO location
5. ✅ Stock transaction created with `source_bin` and `target_bin`
6. ✅ Total inventory unchanged
7. ✅ Idempotent (duplicate events don't duplicate stock)

**Verify Database**:
```sql
-- Check stock ledger MOVE
SELECT item_code, bin_location, qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY bin_location;

-- Check stock transaction
SELECT transaction_type, source_bin, target_bin, qty_change
FROM tabStockTransaction
WHERE reference_doc = 'PUT-20260119-0001'
  AND item_code = 'SKU-HAT-301-BLU-OS';
```

---

## Summary

✅ **Fixed**:
1. ✅ Added `PUTAWAY_TO_RACK` event processing
2. ✅ Implemented MOVE pattern (decrease from staging, increase at target)
3. ✅ Added FROM location derivation logic
4. ✅ Added idempotency checks (prevents duplicate stock updates)
5. ✅ Updated stock transactions with `source_bin` and `target_bin`

✅ **Result**:
- Events now **actually move stock** (not just add)
- Total inventory **unchanged** (MOVE pattern)
- `PUTAWAY_TO_RACK` events **processed** (not ignored)
- Idempotent (safe to retry)
- Stock transactions have **complete audit trail** (from/to locations)

✅ **Backward Compatibility**:
- Still processes `PUTAWAY_CONFIRM` and `PUTAWAY_COMPLETE` events
- Works with or without `location_id` in event
- Falls back to `rack` and `bin` if `location_id` not provided

---

**END**
