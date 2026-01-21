# Fix: Update tabTransferInItem.carton_id During Receiving

## Problem

When receiving items in multi-carton mode, `tabTransferInItem.carton_id` was not being updated, causing the desktop grid to show empty carton IDs even though items were received in cartons.

## Solution

Updated the event processing functions to also update `tabTransferInItem.carton_id` with the **last carton used** for each item, ensuring the desktop grid displays the carton ID.

## Changes Made

### 1. ✅ TRANSFER_IN_RECEIVE Event Processing

**File**: `wms-api/src/modules/events/eventController.js`
**Function**: `processTransferInReceiveEvent()`

**Added**: Update `tabTransferInItem.carton_id` after updating carton line in multi-carton mode.

```javascript
// After updating carton line in multi-carton mode:
if (hasCartonIdColumn && carton_id) {
  await connection.execute(`
    UPDATE tabTransferInItem
    SET carton_id = ?,
        updated_at = NOW()
    WHERE parent_title = ?
      AND item_code = ?
  `, [carton_id, transfer_in, item_code]);
  console.log(`✅ Updated tabTransferInItem.carton_id: ${item_code} = ${carton_id} (for desktop grid)`);
}
```

**Behavior**:
- Updates `tabTransferInItem.carton_id` with the carton from the current event
- Stores the **last carton used** for each item (if item is in multiple cartons, last one wins)
- Ensures desktop grid shows the carton ID

### 2. ✅ TRANSFER_IN_RECEIVE_ADJUST Event Processing

**File**: `wms-api/src/modules/events/eventController.js`
**Function**: `processTransferInReceiveAdjustEvent()`

**Added**: Update `tabTransferInItem.carton_id` after updating carton line.

```javascript
// After updating carton line:
if (hasCartonIdColumn && carton_id) {
  await connection.execute(`
    UPDATE tabTransferInItem
    SET carton_id = ?,
        updated_at = NOW()
    WHERE parent_title = ?
      AND item_code = ?
  `, [carton_id, transfer_in, item_code]);
  console.log(`✅ Updated tabTransferInItem.carton_id: ${item_code} = ${carton_id} (for desktop grid)`);
}
```

**Behavior**:
- Updates `tabTransferInItem.carton_id` when adjusting quantities in a carton
- Keeps desktop grid in sync with carton assignments

### 3. ✅ API Endpoint (Already Working)

**File**: `wms-api/src/modules/transfer-in/transferInController.js`
**Function**: `receiveTransferInLine()`

**Status**: Already updates `tabTransferInItem.carton_id` in Scenario A (Receive by Carton ID).

## Implementation Details

### Multi-Carton Mode

In multi-carton mode:
1. Carton information is stored in `tabTransferInCarton` and `tabTransferInCartonLine`
2. `tabTransferInItem.carton_id` is updated with the **last carton used** for display purposes
3. Desktop grid reads from `tabTransferInItem.carton_id` to show carton IDs

### Legacy Mode

In legacy mode:
- `tabTransferInItem.carton_id` is already updated directly (no change needed)

## SQL Update Pattern

The fix follows the user's requested pattern:

```sql
UPDATE tabTransferInItem
SET carton_id = ?
WHERE parent_title = ?
  AND item_code = ?;
```

This is executed:
- After each successful `TRANSFER_IN_RECEIVE` event (in multi-carton mode)
- After each successful `TRANSFER_IN_RECEIVE_ADJUST` event (in multi-carton mode)
- Already working in `receiveTransferInLine` API (Scenario A)

## Expected Behavior

### Before Fix:
- Items received in cartons via events
- `tabTransferInCartonLine` has carton information ✅
- `tabTransferInItem.carton_id` is NULL ❌
- Desktop grid shows empty carton ID ❌

### After Fix:
- Items received in cartons via events
- `tabTransferInCartonLine` has carton information ✅
- `tabTransferInItem.carton_id` is updated with last carton ✅
- Desktop grid shows carton ID ✅

## Testing

### Test Case 1: Receive Item in Carton

1. **Mobile App**: Scan item `SKU-001` with carton `CTN-001`
2. **Event**: `TRANSFER_IN_RECEIVE` event created
3. **Backend**: 
   - Creates/updates `tabTransferInCartonLine` ✅
   - Updates `tabTransferInItem.carton_id = 'CTN-001'` ✅
4. **Desktop**: Grid shows `carton_id = 'CTN-001'` ✅

### Test Case 2: Receive Same Item in Different Carton

1. **Mobile App**: Scan item `SKU-001` with carton `CTN-002` (different carton)
2. **Event**: `TRANSFER_IN_RECEIVE` event created
3. **Backend**:
   - Creates/updates `tabTransferInCartonLine` for `CTN-002` ✅
   - Updates `tabTransferInItem.carton_id = 'CTN-002'` (last carton wins) ✅
4. **Desktop**: Grid shows `carton_id = 'CTN-002'` ✅

### Test Case 3: Adjust Quantity in Carton

1. **Mobile App**: Edit quantity for item `SKU-001` in carton `CTN-001`
2. **Event**: `TRANSFER_IN_RECEIVE_ADJUST` event created
3. **Backend**:
   - Updates `tabTransferInCartonLine` ✅
   - Updates `tabTransferInItem.carton_id = 'CTN-001'` ✅
4. **Desktop**: Grid shows `carton_id = 'CTN-001'` ✅

## Files Modified

1. **wms-api/src/modules/events/eventController.js**
   - Added `tabTransferInItem.carton_id` update in `processTransferInReceiveEvent()` (multi-carton mode)
   - Added `tabTransferInItem.carton_id` update in `processTransferInReceiveAdjustEvent()` (multi-carton mode)

## Backward Compatibility

- ✅ Works with or without `carton_id` column in `tabTransferInItem`
- ✅ Works in both multi-carton mode and legacy mode
- ✅ No breaking changes to existing functionality

## Summary

**Issue**: Desktop grid not showing carton IDs because `tabTransferInItem.carton_id` wasn't updated in multi-carton mode.

**Fix**: Update `tabTransferInItem.carton_id` with the last carton used after each receive/adjust event.

**Result**: Desktop grid now displays carton IDs correctly.
