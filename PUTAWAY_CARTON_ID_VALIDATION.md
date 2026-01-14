# Putaway Task Carton ID Validation

## Issue
Putaway tasks were being completed without `carton_id`, causing inventory tracking issues. The desktop app showed empty Carton ID fields even after tasks were completed.

## Solution
Added validation to prevent completing putaway tasks that don't have `carton_id` for all items.

## Validation Added

### Location
**File:** `wms-api/src/modules/putaway/putawayController.js`

**Validation:**
- Before processing stock updates, the code now validates that **all putaway lines have a non-empty `carton_id`**
- If any line is missing `carton_id`, the completion is rejected with a clear error message

**Code Added:**
```javascript
// Validate that all putaway lines have carton_id before processing stock
// CRITICAL: Carton ID is required for proper inventory tracking
const linesWithoutCartonId = putawayLines.filter((line) => {
  const cartonId = line.carton_id;
  return !cartonId || (typeof cartonId === 'string' && cartonId.trim() === '');
});

if (linesWithoutCartonId.length > 0) {
  await connection.rollback();
  connection.release();
  console.error(
    `[Putaway] Validation failed: ${
      linesWithoutCartonId.length
    } items missing carton_id: ${linesWithoutCartonId
      .map((l) => l.item_code)
      .join(", ")}`
  );
  return res.status(400).json({
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Cannot complete putaway: some items are missing carton ID",
      details: `Items without carton_id: ${linesWithoutCartonId
        .map((l) => l.item_code)
        .join(", ")}. Please ensure all items have a carton_id before completing putaway. Carton ID is required for proper inventory tracking.`,
    },
  });
}
```

## Error Response

When validation fails, the API returns:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot complete putaway: some items are missing carton ID",
    "details": "Items without carton_id: SKU-HAT-301-RED-OS, SKU-SHOES-101-BLK-43. Please ensure all items have a carton_id before completing putaway. Carton ID is required for proper inventory tracking."
  }
}
```

## Impact

### Before Fix:
- ✅ Putaway tasks could be completed without `carton_id`
- ❌ Stock ledger updated without `carton_id`
- ❌ Carton stock not updated
- ❌ Item Location Breakdown showed empty Carton ID

### After Fix:
- ❌ Putaway tasks **cannot** be completed without `carton_id`
- ✅ Clear error message guides user to fix the issue
- ✅ Ensures data integrity for inventory tracking
- ✅ Prevents incomplete carton tracking

## Workflow

1. **User attempts to complete putaway task**
2. **Validation checks all lines for `carton_id`**
3. **If any line missing `carton_id`:**
   - Transaction is rolled back
   - Error response returned
   - Task status remains unchanged
4. **If all lines have `carton_id`:**
   - Stock updates proceed normally
   - Task is marked as Completed

## Related Fixes

This validation works in conjunction with:
- **Transfer IN Putaway Carton ID Fix:** Ensures `carton_id` is set during receive
- **ASN Putaway Carton ID Fix:** Ensures `carton_id` is set during receive
- **Putaway Completion:** Already handles `carton_id` correctly (no changes needed)

## Testing

1. **Test with missing carton_id:**
   - Create putaway task with items missing `carton_id`
   - Attempt to complete the task
   - Verify error is returned
   - Verify task status remains unchanged

2. **Test with valid carton_id:**
   - Create putaway task with all items having `carton_id`
   - Complete the task
   - Verify task completes successfully
   - Verify stock ledger and carton stock are updated with `carton_id`

3. **Test with partial carton_id:**
   - Create putaway task with some items having `carton_id` and some missing
   - Attempt to complete the task
   - Verify error lists only items missing `carton_id`
   - Verify task status remains unchanged

## Files Modified

1. `wms-api/src/modules/putaway/putawayController.js`
   - Added validation for missing `carton_id` before stock processing

## Next Steps

1. ✅ Validation code added
2. ⏳ Test with real putaway tasks
3. ⏳ Verify error messages are clear and helpful
4. ⏳ Monitor for any edge cases
