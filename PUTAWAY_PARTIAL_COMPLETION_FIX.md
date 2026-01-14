# Putaway Partial Completion Fix

## Issue
The validation was checking **ALL putaway lines** in the database, including lines that were **NOT included in the request**. This prevented partial completion of putaway tasks.

**Example:**
- Putaway task has 3 items: `SKU-HAT-301-BLU-OS`, `SKU-HAT-301-GRN-OS`, `SKU-HAT-301-RED-OS`
- User sends request to complete only 2 items: `SKU-HAT-301-BLU-OS` and `SKU-HAT-301-GRN-OS`
- Validation failed because `SKU-HAT-301-RED-OS` (not in request) was missing `carton_id`

## Root Cause
The code was:
1. Loading ALL lines from database into `putawayLines` array
2. Processing items from request and updating/adding to `putawayLines`
3. Validating ALL lines in `putawayLines` array (including lines not in request)

## Fix Applied

### 1. Filter Validation to Requested Items Only
**Location:** Before final carton_id validation

**Change:**
- If items are provided in request, **only validate lines that match requested items**
- If no items provided, validate all lines (full completion)

**Code:**
```javascript
// Only validate lines that match items in the request (partial completion)
let linesToValidate = putawayLines;
if (items && Array.isArray(items) && items.length > 0) {
  const requestedItemCodes = new Set(items.map(item => item.item_code));
  linesToValidate = putawayLines.filter(line => requestedItemCodes.has(line.item_code));
  console.log(`[Putaway] Partial completion: Validating ${linesToValidate.length} line(s) from request`);
}
```

### 2. Filter Stock Processing to Requested Items Only
**Location:** After validation, before stock updates

**Change:**
- Filter `putawayLines` to only include lines matching requested items
- This ensures stock is only updated for items being completed

**Code:**
```javascript
// Update putawayLines to only include lines being processed (for stock updates)
if (items && Array.isArray(items) && items.length > 0) {
  const requestedItemCodes = new Set(items.map(item => item.item_code));
  putawayLines = putawayLines.filter(line => requestedItemCodes.has(line.item_code));
  console.log(`[Putaway] Filtered putawayLines: only processing items from request`);
}
```

## Result

### Before Fix:
- ❌ Could not complete putaway if ANY line in task was missing `carton_id`
- ❌ Required all items to be completed at once
- ❌ Validation checked items not in request

### After Fix:
- ✅ Can complete putaway with only requested items (partial completion)
- ✅ Other items in task are not validated/processed
- ✅ Stock only updated for items in request
- ✅ Task can be completed in multiple steps

## Example

**Request:**
```json
{
  "putaway_task": "PUT-20260114-0007",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 10,
      "carton_id": "BOX-12345"
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 5,
      "carton_id": "BOX-12345"
    }
  ]
}
```

**Task has 3 items:**
- `SKU-HAT-301-BLU-OS` ✅ (in request, has carton_id)
- `SKU-HAT-301-GRN-OS` ✅ (in request, has carton_id)
- `SKU-HAT-301-RED-OS` ❌ (NOT in request, missing carton_id)

**Result:**
- ✅ Validation passes (only checks requested items)
- ✅ Stock updated for `SKU-HAT-301-BLU-OS` and `SKU-HAT-301-GRN-OS`
- ✅ `SKU-HAT-301-RED-OS` is not processed (can be completed later)

## Files Modified

1. `wms-api/src/modules/putaway/putawayController.js`
   - Added filtering for validation (only requested items)
   - Added filtering for stock processing (only requested items)
   - Added logging for partial vs full completion

## Testing

1. **Test Partial Completion:**
   - Create putaway task with 3 items
   - Complete only 2 items (with carton_id)
   - Verify task completes successfully
   - Verify only 2 items have stock updated

2. **Test Full Completion:**
   - Complete putaway task without items in request
   - Verify all items in task are validated
   - Verify all items have stock updated

3. **Test Mixed Carton ID:**
   - Create putaway task with some items having carton_id, some missing
   - Complete only items with carton_id
   - Verify task completes successfully
   - Verify items without carton_id are not processed
