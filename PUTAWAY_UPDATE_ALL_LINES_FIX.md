# Putaway: Update ALL Lines with Location Fix

**Date**: 2026-01-19  
**Issue**: Only some putaway lines get location updated when `PUTAWAY_TO_RACK` event is received

---

## Problem

When `PUTAWAY_TO_RACK` event is received:
- ✅ Event is processed
- ❌ Only ONE line gets location updated (the one matching `item_code` in event)
- ❌ Other lines in the same box remain with NULL/TBD locations
- ❌ Stock updates are skipped for lines without location

**Example:**
- Putaway task `PUT-20260119-0001` has 2 lines:
  - Line 1: `SKU-HAT-301-BLU-OS` → Location: **Empty** ❌
  - Line 2: `SKU-HAT-301-GRN-OS` → Location: `A1-R02-L1-B2` ✅

**Root Cause:**
- `processPutawayEvent` only updates lines for the specific `item_code` in the event
- If event doesn't have `item_code`, it processes items from `SORT_TO_BOX` events one by one
- But if the event has `item_code`, it only updates that one line
- **Missing**: Logic to update ALL lines for the box when location is provided

---

## Fix Applied

### Update ALL Lines for Box When Location Provided

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Added logic at the start of `processPutawayEvent` to update ALL lines for the box/carton when location is provided, regardless of `item_code`.

**Key Code:**
```javascript
// CRITICAL: If location is provided, update ALL lines for this box/carton with the location
// This ensures all items in the box get the same location when PUTAWAY_TO_RACK event is received
if (hasLocation && putawayTaskTitle && cartonIdForLine) {
  // Find ALL lines for this box/carton (regardless of item_code or location)
  const [allLinesForBox] = await connection.execute(
    `SELECT id, item_code, rack, bin, location_id FROM tabPutawayLine 
     WHERE parent_title = ? 
       AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))`,
    [putawayTaskTitle, cartonIdForLine, cartonIdForLine]
  );
  
  // Update ALL lines that don't have the correct location
  for (const line of allLinesForBox) {
    if (needsLocationUpdate) {
      await connection.execute(
        `UPDATE tabPutawayLine 
         SET rack = ?, bin = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [effectiveRack, effectiveBin, effectiveLocationId, line.id]
      );
    }
  }
}
```

**Applied to:**
1. When `item_code` is provided in event
2. When `item_code` is NOT provided (bulk update from `SORT_TO_BOX` events)

---

## Expected Flow After Fix

1. **PUTAWAY_TO_RACK event received** with `box_id` and `location_id`
2. **`processPutawayEvent` called**:
   - Finds putaway task ✅
   - **Finds ALL lines for the box** ✅
   - **Updates ALL lines with location from event** ✅
   - Then processes specific `item_code` if provided (for quantity updates)
3. **Result**: All lines in the box now have location populated ✅
4. **`processPutawayCompletionEvent` called**:
   - Finds ALL lines with valid locations ✅
   - **Processes stock updates for ALL lines** ✅

---

## Testing

### Test: PUTAWAY_TO_RACK Updates All Lines

**Scenario**: Putaway task has 2 lines, only one has location

**Before Fix**:
```sql
SELECT item_code, rack, bin, location_id FROM tabPutawayLine WHERE parent_title = 'PUT-20260119-0001';
```
- Line 1: `SKU-HAT-301-BLU-OS` → Location: **Empty** ❌
- Line 2: `SKU-HAT-301-GRN-OS` → Location: `A1-R02-L1-B2` ✅

**Send Event**:
```json
POST /api/events/batch
{
  "events": [{
    "event_type": "PUTAWAY_TO_RACK",
    "box_id": "PAW-ASN365425476-1768843905998",
    "location_id": "A1-R02-L1-B2",
    "rack": "A1-R02-L1",
    "bin": "B2"
  }]
}
```

**After Fix - Verify**:
```sql
SELECT item_code, rack, bin, location_id FROM tabPutawayLine WHERE parent_title = 'PUT-20260119-0001';
```
- Line 1: `SKU-HAT-301-BLU-OS` → Location: `A1-R02-L1-B2` ✅
- Line 2: `SKU-HAT-301-GRN-OS` → Location: `A1-R02-L1-B2` ✅

**Check Logs**:
- Should see: `[Putaway Event] Updated line ID X (item: SKU-HAT-301-BLU-OS) with location: ...`
- Should see: `[Putaway Event] Updated X putaway line(s) for box PAW-XXX with location from PUTAWAY_TO_RACK event`
- Should see: `✅ Stock posted for PUTAWAY:PUT-XXX: 2 items, 1 bin locations` (not 0)

---

## Status

✅ **Fix Applied**

1. ✅ `processPutawayEvent` now updates ALL lines for the box when location is provided
2. ✅ Applied to both cases: with `item_code` and without `item_code`
3. ✅ Location parsing (from `location_id`) done once and reused for all lines
4. ✅ Enhanced logging to show how many lines were updated

**Next Steps**:
1. Restart backend server
2. Test PUTAWAY_TO_RACK event
3. Verify ALL lines in putaway task have location populated
4. Verify stock updates are processed for all lines
