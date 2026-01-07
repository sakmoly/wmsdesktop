# Fix: Duplicate Line in scanTransferCarton

## Problem

When calling `POST /api/putaway/scan-transfer-carton`, duplicate lines are being created even when a line already exists for the same item+carton combination.

## Root Cause

The code was checking if a line exists with the same location, but if a line exists with a **different location**, it was still creating a new line instead of updating the existing one. This caused duplicates.

## Fix Applied

**Before:**
```javascript
if (existingDifferentLocation.length > 0) {
  console.warn(`[Putaway] WARNING: Carton ${boxId} with item ${itemCode} already put away to different location...`);
  // Still create the line, but log a warning ❌
}

// Insert new line
await connection.execute(`INSERT INTO tabPutawayLine ...`);
```

**After:**
```javascript
if (existingDifferentLocation.length > 0) {
  console.warn(`[Putaway] WARNING: Carton ${boxId} with item ${itemCode} already put away to different location...`);
  // Update the existing line with new location instead of creating duplicate ✅
  await connection.execute(
    `UPDATE tabPutawayLine
     SET rack = ?, bin = ?, qty = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [rack, binValue, qty, existingDifferentLocation[0].id]
  );
  console.log(`[Putaway] Updated existing line ID ${existingDifferentLocation[0].id} with new location`);
} else {
  // No existing line found - safe to insert new line
  console.log(`[Putaway] Inserting new line: ${itemCode} @ ${rack}/${binValue}`);
  await connection.execute(`INSERT INTO tabPutawayLine ...`);
}
```

## Behavior Now

1. **If line exists with same location**: Updates quantity if different ✅
2. **If line exists with different location**: Updates the existing line with new location (no duplicate) ✅
3. **If no line exists**: Creates new line ✅

## Location Format

The location in `stock_updates` is correctly formatted as `rack-bin`:
- `rack`: "A1-R01-L1-B1"
- `bin`: "B1"
- `location`: "A1-R01-L1-B1-B1" ✅ (correct format)

This is **not** an error - it's the correct format for `bin_location` in `tabStockLedger`.

## Testing

After restarting the API server, test with:
```json
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TC-1767130908455",
  "rack": "A1-R01-L1-B1",
  "bin": "B1",
  "user_id": "USER-786249"
}
```

**Expected Result:**
- ✅ Only **one line** in `tabPutawayLine` for this item+carton
- ✅ If called again with same item+carton, it should **update** the existing line
- ✅ Console logs will show "Updated existing line" instead of "Inserting new line"

---

**The fix ensures that duplicate lines are not created when the same item+carton is scanned multiple times or with different locations.**

