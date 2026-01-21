# Putaway Event Location Update Fix

**Date**: 2026-01-19  
**Issue**: `processPutawayCompletionEvent` shows "0 bin locations" because putaway lines don't have valid locations

---

## Problem

When `PUTAWAY_TO_RACK` event is received:
1. ✅ Event is inserted successfully
2. ✅ `processPutawayEvent` is called
3. ❌ But putaway lines are NOT updated with location from event
4. ❌ `processPutawayCompletionEvent` finds lines with NULL/TBD locations
5. ❌ Stock update is skipped (shows "0 bin locations")

**Root Cause:**
- `processPutawayEvent` only updates lines that already have the SAME location
- If lines have NULL/TBD locations, they don't match the query
- So existing lines are never updated with the new location from the event

---

## Fix Applied

### Fix 1: Update Existing Lines with NULL/TBD Locations

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Modified `processPutawayEvent` to:
1. First find existing lines for item/carton (regardless of location)
2. If line exists with same location → Update quantity if needed
3. If line exists with different/NULL location → Update it with new location from event
4. If no line exists → Create new line with location

**Key Changes:**
```javascript
// OLD: Only found lines with exact same location
const [existingLines] = await connection.execute(
  `SELECT id, qty FROM tabPutawayLine 
   WHERE parent_title = ? AND item_code = ? AND carton_id = ?
   AND rack = ? AND bin = ?`, // ❌ Won't find lines with NULL/TBD
  ...
);

// NEW: Find lines for item/carton (regardless of location)
const [existingLinesAnyLocation] = await connection.execute(
  `SELECT id, qty, rack, bin, location_id FROM tabPutawayLine 
   WHERE parent_title = ? AND item_code = ? AND carton_id = ?`, // ✅ Finds all lines
  ...
);

// Then update existing line with new location
if (existingLine) {
  await connection.execute(
    `UPDATE tabPutawayLine 
     SET rack = ?, bin = ?, location_id = ?, qty = ?
     WHERE id = ?`,
    [effectiveRack, effectiveBin, effectiveLocationId, qty, existingLine.id]
  );
}
```

---

### Fix 2: Parse location_id to Extract rack/bin

**Change**: Added logic to parse `location_id` (e.g., "A1-R02-L1-B2") to extract `rack` and `bin` if they're not provided directly.

**Code:**
```javascript
if (location_id && !effectiveRack && !effectiveBin) {
  // Parse location_id to get rack/bin
  const parts = location_id.split('-');
  if (parts.length >= 2) {
    effectiveRack = parts.slice(0, -1).join('-');
    effectiveBin = parts[parts.length - 1];
  }
}
```

---

### Fix 3: Enhanced Location Resolution in processPutawayCompletionEvent

**Change**: Updated `processPutawayCompletionEvent` to:
1. Include `location_id` column in query (if exists)
2. Use `location_id` from event as highest priority
3. Fallback to `location_id` from line
4. Fallback to `rack/bin` from line or event
5. Skip lines with TBD/invalid locations

**Code:**
```javascript
// Get location_id column if exists
const locationIdSelect = hasLineLocationId ? ", location_id" : ", NULL as location_id";
const [putawayLines] = await connection.execute(
  `SELECT item_code, qty, rack, bin, carton_id${locationIdSelect} 
   FROM tabPutawayLine ...`
);

// Priority: 1) location_id from event, 2) location_id from line, 3) rack/bin
let binLocation = location_id || lineLocationId || null;
if (!binLocation) {
  const effectiveRack = lineRack || rack || null;
  const effectiveBin = lineBin || bin || null;
  if (effectiveRack && effectiveBin) {
    binLocation = `${effectiveRack}-${effectiveBin}`;
  }
}

// Skip invalid locations
if (!binLocation || binLocation.trim() === '' || binLocation.includes('TBD')) {
  continue; // Skip this line
}
```

---

## Expected Flow After Fix

1. **PUTAWAY_TO_RACK event received** with `box_id` and `location_id`
2. **Event normalized** → `item_code`, `store`, `carton_id` populated from `SORT_TO_BOX` events ✅
3. **`processPutawayEvent` called**:
   - Finds ASN from `tabsortbox` (for `box_id`) ✅
   - Finds existing putaway lines for item/carton ✅
   - **Updates existing lines with location from event** ✅
   - Or creates new lines with location ✅
4. **`processPutawayCompletionEvent` called**:
   - Finds putaway task from lines ✅
   - Gets putaway lines (now with valid locations) ✅
   - **Processes stock updates for all lines** ✅
   - Updates stock ledger ✅
   - Creates transaction history ✅
   - Creates audit trail ✅

---

## Testing

### Test 1: PUTAWAY_TO_RACK Updates Existing Lines

**Scenario**: Putaway lines exist with NULL/TBD locations

**Send Event**:
```json
POST /api/events/batch
{
  "events": [{
    "event_type": "PUTAWAY_TO_RACK",
    "box_id": "PAW-ASN365425475-1768843905998",
    "location_id": "A1-R02-L1-B2",
    "rack": "A1-R02-L1",
    "bin": "B2"
  }]
}
```

**Verify**:
```sql
SELECT parent_title, item_code, carton_id, rack, bin, location_id
FROM tabPutawayLine
WHERE carton_id = 'PAW-ASN365425475-1768843905998';
```

**Expected**: Lines should have `rack`, `bin`, and `location_id` populated

**Check Logs**:
- Should see: `[Putaway Event] Updated existing line ID X with location: ...`
- Should see: `[Putaway Completion] Found putaway task ...`
- Should see: `✅ Stock posted for PUTAWAY:PUT-XXX: X items, X bin locations` (not 0)

---

### Test 2: Stock Updates Processed

**After PUTAWAY_TO_RACK event**, check logs:
- Should see: `✅ Stock posted for PUTAWAY:PUT-XXX: 1 items, 1 bin locations` (not 0)
- Should see: `✅ Rebuilt item stock summary for SKU-XXX: X` (not 0)

**Verify Database**:
```sql
-- Stock ledger should have entries
SELECT * FROM tabstockledger 
WHERE item_code = 'SKU-HAT-301-GRN-OS' 
  AND location_id = 'A1-R02-L1-B2';

-- Transaction history should have entries
SELECT * FROM tabStockTransaction 
WHERE transaction_type = 'Putaway' 
  AND reference_doc = 'PUT-20260119-0004';
```

---

## Status

✅ **Fixes Applied**

1. ✅ `processPutawayEvent` now updates existing lines with NULL/TBD locations
2. ✅ `processPutawayEvent` parses `location_id` to extract `rack/bin`
3. ✅ `processPutawayCompletionEvent` includes `location_id` in query
4. ✅ `processPutawayCompletionEvent` uses `location_id` from event as priority
5. ✅ `processPutawayCompletionEvent` skips lines with TBD/invalid locations

**Next Steps**:
1. Restart backend server
2. Test PUTAWAY_TO_RACK event
3. Verify putaway lines are updated with location
4. Verify stock updates are processed (not 0 bin locations)
