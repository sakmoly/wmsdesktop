# Putaway Stock Not Updating - Fix Summary

**Date**: 2026-01-19  
**Issue**: Stock, ledger, and audit trail not updating after putaway completion

---

## Problem

After implementing all fixes, stock quantity, ledger, and audit trail are still not updating when putaway is completed. Logs show:
- ✅ `PUTAWAY_TO_RACK` events are being inserted
- ✅ Putaway task and lines are created
- ❌ No logs from `completePutaway` function (stock update loop not running)
- ❌ Stock, ledger, and audit trail remain empty

---

## Root Cause

The issue is that `processPutawayEvent` function (which updates putaway lines with location) was only being called when `tc_id` was present. However, after the normalization fix, PUTAWAY events now use `box_id` (not `tc_id`), so:

1. `PUTAWAY_TO_RACK` events are inserted ✅
2. But `processPutawayEvent` is NOT called (because it requires `tc_id`) ❌
3. So putaway lines are NOT updated with location ❌
4. When `completePutaway` is called, it can't find lines with location ❌
5. Stock updates are skipped ❌

---

## Fixes Applied

### Fix 1: Update Event Processing Condition

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Updated condition to call `processPutawayEvent` when `box_id` is present (for PUTAWAY events), not just `tc_id`.

**Before**:
```javascript
if (event_type.toUpperCase().includes('PUTAWAY') && tc_id && rack) {
  await processPutawayEvent(...);
}
```

**After**:
```javascript
const putawayBoxId = normalizedBoxId || tc_id; // Use normalized box_id for putaway
if (event_type.toUpperCase().includes('PUTAWAY') && putawayBoxId && rack) {
  await processPutawayEvent({
    box_id: normalizedBoxId, // Pass box_id explicitly
    tc_id: putawayBoxId, // For backward compatibility
    ...
  });
}
```

---

### Fix 2: Update processPutawayEvent to Support box_id

**File**: `wms-api/src/modules/events/eventController.js`

**Changes**:
1. Support both `box_id` and `tc_id`
2. Find ASN from `tabsortbox` (for box-based putaway) instead of only `tabTransferCarton`
3. Use `box_id` as `carton_id` when creating putaway lines

**Key Changes**:
```javascript
// Priority 1: Get ASN from tabsortbox (for box-based putaway)
if (box_id) {
  const [sortBox] = await connection.execute(
    `SELECT advance_shipping_notice FROM tabsortbox WHERE box_id = ?`,
    [box_id]
  );
  if (sortBox.length > 0) {
    asnNo = sortBox[0].advance_shipping_notice;
  }
}

// Use box_id as carton_id for putaway lines
const cartonIdForLine = box_id || carton_id || putawayId;
```

---

### Fix 3: Update processPutawayCompletionEvent to Find Task from box_id

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Updated to find putaway task from putaway lines using `box_id`, not just from `tabTransferCarton`.

**Before**:
```javascript
if (!putawayTaskTitle && tc_id) {
  // Only looked in tabTransferCarton
}
```

**After**:
```javascript
if (!putawayTaskTitle && putawayId) {
  // Priority 1: Find from putaway lines (using box_id/carton_id)
  const [taskFromLines] = await connection.execute(
    `SELECT DISTINCT parent_title FROM tabPutawayLine 
     WHERE carton_id = ? OR box_id = ?`,
    [putawayId, putawayId]
  );
  
  // Priority 2: Find from tabsortbox ASN (for box-based putaway)
  if (box_id) { ... }
  
  // Priority 3: Fallback to tabTransferCarton (backward compatibility)
  if (tc_id) { ... }
}
```

---

### Fix 4: Get Items from SORT_TO_BOX Events

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: When no `item_code` provided, get items from `SORT_TO_BOX` events (for putaway boxes) instead of only `PACK_BOX_TO_TC` events.

**Before**:
```javascript
if (tc_id) {
  // Only looked in PACK_BOX_TO_TC events
}
```

**After**:
```javascript
if (box_id) {
  // Get items from SORT_TO_BOX events (for putaway boxes)
  const [boxItemEvents] = await connection.execute(
    `SELECT item_code, box_id, carton_id, SUM(qty) as total_qty 
     FROM tabWmsScanEvent 
     WHERE box_id = ? AND event_type = 'SORT_TO_BOX' ...`,
    [box_id]
  );
} else if (tc_id) {
  // Fallback: Get from PACK_BOX_TO_TC events
}
```

---

## Expected Flow After Fix

1. **Mobile sends `PUTAWAY_TO_RACK` event** with `box_id` and `location_id`
2. **Event normalization** populates missing `item_code`, `store`, `carton_id` from `SORT_TO_BOX` events ✅
3. **Event inserted** with all fields populated ✅
4. **`processPutawayEvent` called** (now works with `box_id`) ✅
5. **Putaway lines updated** with location (`rack`, `bin`, `location_id`) ✅
6. **Mobile calls `/api/putaway/complete`** with `box_id` and `location_id`
7. **`completePutaway` finds task** from putaway lines using `box_id` ✅
8. **Stock updates processed** for all lines with valid locations ✅
9. **Stock ledger updated** ✅
10. **Transaction history created** ✅
11. **Audit trail created** ✅
12. **Task marked Completed** ✅
13. **Box marked Closed** ✅

---

## Testing

### Test 1: Verify PUTAWAY_TO_RACK Updates Lines

**Send Event**:
```json
POST /api/events/batch
{
  "events": [{
    "event_type": "PUTAWAY_TO_RACK",
    "box_id": "PAW-ASN365425474-1768843217388",
    "location_id": "A1-R02-L1-B2",
    "rack": "A1-R02-L1",
    "bin": "B2",
    ...
  }]
}
```

**Verify**:
```sql
SELECT parent_title, item_code, carton_id, rack, bin, location_id
FROM tabPutawayLine
WHERE carton_id = 'PAW-ASN365425474-1768843217388';
```

**Expected**: Lines should have `rack`, `bin`, and `location_id` populated

---

### Test 2: Complete Putaway

**Request**:
```json
POST /api/putaway/complete
{
  "box_id": "PAW-ASN365425474-1768843217388",
  "location_id": "A1-R02-L1-B2"
}
```

**Check Logs**:
- Should see: `[Putaway] Starting stock update loop for X line(s)`
- Should see: `[Putaway] ✅ Stock update completed for SKU-XXX`
- Should see: `[Putaway] ✅ Inserted audit trail entry for SKU-XXX`

**Verify Database**:
```sql
-- Stock ledger
SELECT * FROM tabstockledger 
WHERE item_code LIKE 'SKU-HAT%' 
  AND location_id = 'A1-R02-L1-B2';

-- Transaction history
SELECT * FROM tabtransactionhistory 
WHERE trx_type = 'PUTAWAY_COMPLETE' 
  AND box_id = 'PAW-ASN365425474-1768843217388';
```

---

## Status

✅ **Fixes Applied**

1. ✅ Event processing now works with `box_id`
2. ✅ `processPutawayEvent` finds ASN from `tabsortbox`
3. ✅ Putaway lines updated with location from `PUTAWAY_TO_RACK` events
4. ✅ `processPutawayCompletionEvent` finds task from putaway lines
5. ✅ Items retrieved from `SORT_TO_BOX` events for putaway boxes

**Next Steps**:
1. Restart backend server
2. Test complete putaway flow
3. Verify stock, ledger, and audit trail updates
