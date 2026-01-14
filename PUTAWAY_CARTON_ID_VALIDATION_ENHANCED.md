# Putaway Carton ID Validation - Enhanced

## Summary
Enhanced validation to prevent completing putaway tasks without `carton_id` at multiple stages, with clear error messages and automatic refresh of carton_id values.

## Validations Added

### 1. Early Validation (Request Items)
**Location:** Before processing items from request body

**Validation:**
- If items are provided in the request body, **all items must have `carton_id` (or `box_id`)**
- Rejects completion immediately if any item is missing `carton_id`
- Provides clear error message listing which items are missing `carton_id`

**Code:**
```javascript
if (items && Array.isArray(items) && items.length > 0) {
  const itemsWithoutCartonId = items.filter((item) => {
    const cartonId = item.box_id || item.carton_id;
    return !cartonId || (typeof cartonId === 'string' && cartonId.trim() === '');
  });
  
  if (itemsWithoutCartonId.length > 0) {
    // Return error with list of items missing carton_id
  }
}
```

### 2. Final Validation (All Putaway Lines)
**Location:** After processing all items and before stock updates

**Validation:**
- Validates that **all putaway lines** (from database + request) have `carton_id`
- This catches cases where lines exist in database without `carton_id`
- Rejects completion if any line is missing `carton_id`

**Code:**
```javascript
const linesWithoutCartonId = putawayLines.filter((line) => {
  const cartonId = line.carton_id;
  return !cartonId || (typeof cartonId === 'string' && cartonId.trim() === '');
});

if (linesWithoutCartonId.length > 0) {
  // Return error with list of items missing carton_id
}
```

### 3. Carton ID Refresh
**Location:** After deduplication, before final validation

**Enhancement:**
- If items were provided in request and updated putaway lines, refresh `carton_id` from database
- Ensures we use the latest `carton_id` values after updates
- Updates `putawayLines` array with refreshed values

**Code:**
```javascript
if (items && Array.isArray(items) && items.length > 0) {
  const [refreshedLines] = await connection.execute(
    `SELECT item_code, rack, bin, carton_id FROM tabPutawayLine 
     WHERE parent_title = ? AND item_code IS NOT NULL AND qty > 0`,
    [putaway_task]
  );
  
  // Update putawayLines with refreshed carton_id values
  for (const refreshedLine of refreshedLines) {
    const existingLine = putawayLines.find(/* match by item_code, rack, bin */);
    if (existingLine && refreshedLine.carton_id) {
      existingLine.carton_id = refreshedLine.carton_id;
    }
  }
}
```

### 4. Prefer Non-Null Carton ID
**Location:** During deduplication

**Enhancement:**
- When deduplicating lines, prefer non-null `carton_id` if available
- If existing line has NULL `carton_id` but duplicate has value, update existing line

**Code:**
```javascript
// Update carton_id if existing doesn't have one but new one does
if (!existing.carton_id && line.carton_id) {
  existing.carton_id = line.carton_id;
  console.log(`[Putaway] Updated carton_id for ${line.item_code} from NULL to ${line.carton_id}`);
}
```

## Error Messages

### Error 1: Items in Request Missing Carton ID
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot complete putaway: some items in request are missing carton ID",
    "details": "Items without carton_id: SKU-HAT-301-RED-OS. Please provide carton_id (or box_id) for all items in the request."
  }
}
```

### Error 2: Putaway Lines Missing Carton ID
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot complete putaway: some items are missing carton ID",
    "details": "Items without carton_id: SKU-HAT-301-RED-OS. Please ensure all items have a carton_id before completing putaway. Carton ID is required for proper inventory tracking."
  }
}
```

## Workflow

1. **User attempts to complete putaway task**
2. **Early Validation:** If items provided in request, validate all have `carton_id`
   - ❌ If missing → Return error immediately
   - ✅ If all have `carton_id` → Continue
3. **Process Items:** Update/create putaway lines with `carton_id` from request
4. **Deduplicate:** Merge duplicate lines, prefer non-null `carton_id`
5. **Refresh:** Query database for latest `carton_id` values after updates
6. **Final Validation:** Validate all putaway lines have `carton_id`
   - ❌ If missing → Return error with item codes
   - ✅ If all have `carton_id` → Proceed with stock updates
7. **Complete:** Update stock ledger and carton stock with `carton_id`

## Benefits

1. **Early Detection:** Catches missing `carton_id` before processing
2. **Data Integrity:** Ensures all lines have `carton_id` before stock updates
3. **Clear Guidance:** Error messages list exactly which items need `carton_id`
4. **Automatic Refresh:** Ensures latest `carton_id` values are used
5. **Smart Merging:** Prefers non-null `carton_id` when deduplicating

## Testing Scenarios

### Scenario 1: Items in Request Missing Carton ID
- **Action:** Send complete request with items missing `carton_id`
- **Expected:** Error returned immediately, task not completed
- **Error:** Lists items missing `carton_id`

### Scenario 2: Database Lines Missing Carton ID
- **Action:** Complete putaway task where lines in DB have NULL `carton_id`
- **Expected:** Error returned before stock updates, task not completed
- **Error:** Lists items missing `carton_id`

### Scenario 3: Items in Request Update Carton ID
- **Action:** Send complete request with items that have `carton_id`
- **Expected:** Lines updated with `carton_id`, task completes successfully
- **Result:** Stock ledger and carton stock updated with `carton_id`

### Scenario 4: Mixed (Some Have Carton ID, Some Don't)
- **Action:** Complete putaway with some items having `carton_id` and some missing
- **Expected:** Error returned listing only items missing `carton_id`
- **Error:** Clear list of which items need `carton_id`

## Files Modified

1. `wms-api/src/modules/putaway/putawayController.js`
   - Added early validation for items in request
   - Enhanced deduplication to prefer non-null `carton_id`
   - Added refresh logic to get latest `carton_id` from database
   - Final validation already existed (enhanced with better error messages)

## Related Fixes

- **Transfer IN Putaway Carton ID Fix:** Ensures `carton_id` is set during receive
- **ASN Putaway Carton ID Fix:** Ensures `carton_id` is set during receive
- **Putaway Completion:** Handles `carton_id` correctly in stock updates
