# Putaway Stock Update Fix - Complete Implementation

**Date**: 2026-01-19  
**Issue**: Putaway task completed successfully, but stock, ledger, and history not updated

---

## Problem Analysis

### Root Cause:
1. **`scanTransferCarton` is now validation-only** - It doesn't create putaway lines
2. **`completePutaway` queries `tabPutawayLine`** - If no lines exist, `putawayLines` is empty
3. **Stock update loop processes `linesToProcess`** - If empty, no stock updates happen
4. **Task is marked as "Completed"** - Even though no stock was updated

### Why This Happens:
- Mobile app calls `scanTransferCarton` → Only validates (no lines created)
- Mobile app calls `completePutaway` → Queries for lines → Finds none → No stock updates → Marks task as "Completed"

---

## Solution Implemented

### 1. Create Putaway Task if It Doesn't Exist

**Location**: `wms-api/src/modules/putaway/putawayController.js` - `completePutaway` function

**Logic Added:**
- If task doesn't exist AND `tc_id` or `box_id` is provided → Create task
- Get ASN from `tabTransferCarton` or `tabSortBox`
- Generate new task title (format: `PUT-YYYYMMDD-####`)
- Set appropriate `source_type` (ASN or Transfer In)

### 2. Create Putaway Lines from Events if They Don't Exist

**Location**: `wms-api/src/modules/putaway/putawayController.js` - After querying putaway lines

**Logic Added:**
- If `putawayLines.length === 0` AND `tc_id` or `box_id` is provided:
  1. **Get items from `SORT_TO_BOX` events** (for `box_id`)
  2. **Get items from `PACK_BOX_TO_TC` events** (for `tc_id` or `box_id`)
  3. **Create putaway lines** with location from `headerLocationInfo` (if provided)
  4. **Re-query putaway lines** after creation
  5. **Continue with stock updates** using newly created lines

---

## Code Changes

### Change 1: Create Task if Missing

```javascript
if (tasks.length === 0) {
  // If task doesn't exist but we have tc_id or box_id, create the task
  if (tc_id || box_id) {
    // Get ASN from transfer carton or box
    // Generate new task title
    // Create task with appropriate source_type
    // Continue processing
  } else {
    // Return error if no way to create task
  }
}
```

### Change 2: Create Lines from Events

```javascript
if (putawayLines.length === 0 && (tc_id || box_id)) {
  // Get items from SORT_TO_BOX events (for box_id)
  // Get items from PACK_BOX_TO_TC events (for tc_id)
  // Create putaway lines with location
  // Re-query putaway lines
  // Continue with stock updates
}
```

---

## Flow After Fix

### Before Fix:
1. Scan → Validates only (no lines created)
2. Complete → Queries lines → Finds none → No stock updates → Marks "Completed" ❌

### After Fix:
1. Scan → Validates only (no lines created) ✅
2. Complete → Queries lines → Finds none → **Creates lines from events** → **Updates stock** → Marks "Completed" ✅

---

## Event Sources Used

### For ASN Putaway (box_id):
- **Primary**: `SORT_TO_BOX` events where `box_id = ?`
- **Fallback**: `PACK_BOX_TO_TC` events where `box_id = ?`

### For Transfer In Putaway (tc_id):
- **Primary**: `PACK_BOX_TO_TC` events where `tc_id = ?`

### Event Query:
```sql
SELECT item_code, box_id, carton_id, SUM(qty) as total_qty
FROM tabWmsScanEvent
WHERE event_type = 'SORT_TO_BOX'  -- or 'PACK_BOX_TO_TC'
  AND box_id = ?  -- or tc_id = ?
  AND item_code IS NOT NULL
GROUP BY item_code, box_id, carton_id
```

---

## Location Assignment

When creating putaway lines:
- **If `location_id` provided in request** → Use it for all lines
- **If not provided** → Set rack/bin to 'TBD' (will be updated later)

---

## Testing Scenarios

### Test Case 1: ASN Putaway with box_id (No Existing Lines)
**Request:**
```json
{
  "box_id": "PAW-ASN365425473-1768829978799",
  "location_id": "A1-R02-L1-B2",
  "performed_by": "USER-001"
}
```

**Expected:**
1. ✅ Task created (if doesn't exist)
2. ✅ Lines created from `SORT_TO_BOX` events
3. ✅ Stock updated at location `A1-R02-L1-B2`
4. ✅ Stock ledger updated
5. ✅ Transaction history created
6. ✅ Task marked as "Completed"

### Test Case 2: Transfer In Putaway with tc_id (No Existing Lines)
**Request:**
```json
{
  "tc_id": "CTN-TI-0001-20260116-161713-261",
  "location_id": "A1-R02-L1-B2",
  "performed_by": "USER-001"
}
```

**Expected:**
1. ✅ Task created (if doesn't exist)
2. ✅ Lines created from `PACK_BOX_TO_TC` events
3. ✅ Stock updated
4. ✅ Task marked as "Completed"

### Test Case 3: Lines Already Exist
**Request:**
```json
{
  "putaway_task": "PUT-20260119-0002",
  "location_id": "A1-R02-L1-B2",
  "performed_by": "USER-001"
}
```

**Expected:**
1. ✅ Uses existing lines
2. ✅ Updates stock
3. ✅ Task marked as "Completed"

---

## Logging Added

The implementation includes comprehensive logging:
- `logger.info("No putaway lines found - creating from box/carton contents")`
- `logger.info("Found X items from SORT_TO_BOX events for box Y")`
- `logger.info("Created putaway line: item_code (qty: X, carton: Y)")`
- `logger.info("Created X putaway line(s) from events")`
- `logger.warn("No items found in events for X - cannot create putaway lines")`

---

## Error Handling

### If No Items Found in Events:
```json
{
  "ok": false,
  "error": {
    "code": "NO_ITEMS_FOUND",
    "message": "No items found for PAW-ASN365425473-1768829978799. Items must be sorted into box or packed into transfer carton before putaway.",
    "details": "Please ensure SORT_TO_BOX or PACK_BOX_TO_TC events exist for PAW-ASN365425473-1768829978799"
  }
}
```

**Action**: User must complete sorting/packing before putaway can proceed.

---

## Summary

### Changes Made:
1. ✅ **Create putaway task** if it doesn't exist (when `tc_id` or `box_id` provided)
2. ✅ **Create putaway lines** from events if they don't exist
3. ✅ **Use header location_id** when creating lines
4. ✅ **Re-query lines** after creation to ensure stock updates process them
5. ✅ **Comprehensive logging** for debugging

### Result:
- ✅ Stock updates now work even when scan step is validation-only
- ✅ Ledger updates correctly
- ✅ Transaction history created
- ✅ Task marked as "Completed" only after stock updates succeed

---

**Status**: ✅ **FIX IMPLEMENTED**

The putaway completion endpoint now:
1. Creates task if missing
2. Creates lines from events if missing
3. Updates stock, ledger, and history correctly
4. Marks task as "Completed" only after all updates succeed
