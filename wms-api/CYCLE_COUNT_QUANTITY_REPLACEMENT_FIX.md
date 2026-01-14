# Cycle Count Quantity Replacement Fix

## Issue
When scanning the same item with different carton IDs, the system was **replacing the quantity** of an existing line instead of creating a **new line** for each carton.

**Example:**
- Scan `SKU-SHOES-101-BLK-43` with carton `STOCK-1112`, qty=5 → Creates line with carton `STOCK-1112`, qty=5
- Scan `SKU-SHOES-101-BLK-43` with carton `STOCK-1113`, qty=2 → **Replaces** qty to 2 in the same line (WRONG)
- **Expected:** Should create a **new line** with carton `STOCK-1113`, qty=2

## Root Cause

Even though carton_id matching was improved, the system was still finding and updating an existing line when it should have created a new line. The issue was:

1. **SQL Query Matching**: The query might have been matching a line incorrectly
2. **Multiple Safety Checks Needed**: Needed verification at multiple points in the flow
3. **Timing of Safety Check**: The safety check was happening AFTER line creation, making it too late

## Fixes Applied

### 1. Enhanced SQL Query with Strict Carton ID Matching (Lines 1656-1697)

**Before:**
```javascript
if (cartonId) {
  findQuery += ' AND carton_id = ?';
  findParams.push(cartonId);
}
```

**After:**
```javascript
if (cartonId && cartonId.trim() !== '') {
  // Request has carton_id - ONLY match lines with this exact carton_id
  // This prevents matching lines with NULL or different carton_id
  findQuery += ' AND carton_id = ?';
  findParams.push(cartonId.trim());
  console.log(`[Cycle Count] 🔍 Strategy 2: Searching for line with carton_id="${cartonId.trim()}" (strict match)`);
} else {
  // Request has no carton_id - ONLY match lines with NULL or empty carton_id
  findQuery += ' AND (carton_id IS NULL OR carton_id = "" OR TRIM(carton_id) = "")';
  console.log(`[Cycle Count] 🔍 Strategy 2: Searching for line with NULL/empty carton_id (strict match)`);
}
```

**Improvements:**
- ✅ Trims carton_id to handle whitespace
- ✅ Stricter NULL/empty handling
- ✅ Added debug logging to track query execution

### 2. Carton ID Verification in Strategy 2 (Lines 1724-1775)

**Added comprehensive verification:**
```javascript
// CRITICAL: Verify carton_id matches exactly - if different, DO NOT use this line
let cartonIdMatches = true;

if (hasCartonIdColumn) {
  const foundCartonIdNormalized = foundCartonId ? String(foundCartonId).trim() : null;
  const requestCartonIdNormalized = requestCartonId ? String(requestCartonId).trim() : null;
  
  // Carton IDs match if:
  // 1. Both are null/empty (no carton specified)
  // 2. Both have the same non-null value
  // Carton IDs DON'T match if:
  // 3. One is null and the other is not null
  // 4. Both are not null but different values
  
  if (foundCartonIdNormalized === null && requestCartonIdNormalized === null) {
    cartonIdMatches = true;
  } else if (foundCartonIdNormalized !== null && requestCartonIdNormalized !== null) {
    cartonIdMatches = foundCartonIdNormalized === requestCartonIdNormalized;
  } else {
    cartonIdMatches = false; // One null, one not null
  }
  
  if (!cartonIdMatches) {
    console.log(`[Cycle Count] ⚠️ Carton ID mismatch! Will create NEW line`);
    lineRows = []; // Clear so new line is created
  }
}

// Only use existing line if carton_id matches
if (lineRows.length > 0 && cartonIdMatches) {
  lineId = lineRows[0].id;
  // ... use existing line
}
```

**Improvements:**
- ✅ Comprehensive carton_id comparison logic
- ✅ Clears `lineRows` if carton_id doesn't match
- ✅ Only sets `lineId` if carton_id matches

### 3. Carton ID Check in Strategy 1 (Lines 1585-1630)

**Added carton_id verification for line_id-based lookups:**
```javascript
// Include carton_id in SELECT if column exists
const cartonIdSelect = hasCartonIdForStrategy1 ? ', carton_id' : '';
[lineRows] = await connection.execute(`
  SELECT id, parent_title, expected_qty${cartonIdSelect}
  FROM tabCycleCountLine 
  WHERE id = ? AND parent_title = ?
`, [providedId, title]);

// Verify carton_id matches if both are provided
if (hasCartonIdForStrategy1 && cartonId) {
  // ... verify carton_id matches
  if (!cartonIdMatches) {
    lineRows = []; // Clear so Strategy 2 can find/create correct line
  }
}
```

**Improvements:**
- ✅ Verifies carton_id even when line_id is provided
- ✅ Falls back to Strategy 2 if carton_id doesn't match

### 4. Final Safety Check Before Line Creation (Strategy 3.5) (Lines 1780-1820)

**Added safety check BEFORE line creation:**
```javascript
// Strategy 3.5: FINAL SAFETY CHECK before creating/updating line
// If lineId was set but carton_id doesn't match, clear lineId to force new line creation
if (lineId) {
  // Check current carton_id of the line
  const [cartonIdCheck] = await connection.execute(`
    SELECT carton_id FROM tabCycleCountLine WHERE id = ?
  `, [lineId]);
  
  // Verify carton_ids match
  if (!cartonIdsMatch) {
    console.error(`[Cycle Count] ❌ CRITICAL: Carton ID mismatch. Clearing lineId to create NEW line`);
    lineId = null; // Clear lineId - this will trigger creation of new line in Strategy 4
    
    // Re-lookup expected_qty for the new carton
    expectedQty = await lookupExpectedQtyFromStock(...);
  }
}
```

**Improvements:**
- ✅ Final verification before any update
- ✅ Clears `lineId` if carton_ids don't match
- ✅ Forces creation of new line instead of update
- ✅ Re-looks up expected_qty for the new carton

### 5. Protected UPDATE Logic (Lines 1900-1950)

**Enhanced UPDATE protection:**
```javascript
// Only update carton_id if it matches or is initial assignment
if (currentCartonIdNormalized === null && requestCartonIdNormalized !== null) {
  // Initial assignment: line had no carton_id, now assigning one
  updateQuery += `, carton_id = ?`;
  updateParams.push(cartonId);
} else if (currentCartonIdNormalized === requestCartonIdNormalized) {
  // Carton IDs match - safe to update
  updateQuery += `, carton_id = ?`;
  updateParams.push(cartonId);
} else if (currentCartonIdNormalized !== null && requestCartonIdNormalized !== null && 
           currentCartonIdNormalized !== requestCartonIdNormalized) {
  // CRITICAL: Carton IDs are different - preserve existing, log error
  console.error(`[Cycle Count] ❌ ERROR: Attempted to update with different carton_id! Preserving existing.`);
  // Don't update carton_id - preserve the existing one
}
```

**Improvements:**
- ✅ Prevents updating carton_id with different value
- ✅ Only allows initial assignment or matching updates

## Expected Behavior After Fix

### Scenario: Scanning Same Item with Different Cartons

1. **First Scan**: `SKU-SHOES-101-BLK-43` with carton `STOCK-1112`, qty=5
   - ✅ Creates new line: `item_code=SKU-SHOES-101-BLK-43, carton_id=STOCK-1112, actual_qty=5`

2. **Second Scan**: `SKU-SHOES-101-BLK-43` with carton `STOCK-1113`, qty=2
   - ✅ Strategy 2 query: Searches for `carton_id=STOCK-1113` → Finds 0 lines
   - ✅ Strategy 3.5 safety check: If lineId was set, verifies carton_id → Clears lineId if mismatch
   - ✅ Strategy 4: Creates **NEW** line: `item_code=SKU-SHOES-101-BLK-43, carton_id=STOCK-1113, actual_qty=2`
   - ✅ **Does NOT** update the first line

3. **Result**: Two separate lines for the same item in different cartons
   - Line 1: `SKU-SHOES-101-BLK-43` in `STOCK-1112` = 5 qty
   - Line 2: `SKU-SHOES-101-BLK-43` in `STOCK-1113` = 2 qty

## Multiple Layers of Protection

The fix implements **4 layers of protection**:

1. **SQL Query Level**: Strict matching by exact carton_id
2. **Strategy 2 Verification**: Checks carton_id after query, clears match if different
3. **Strategy 1 Verification**: Checks carton_id even when line_id is provided
4. **Strategy 3.5 Safety Check**: Final verification before line creation, clears lineId if mismatch

## Testing

To verify the fix works:

1. **Create a cycle count task**
2. **Scan an item with carton A** (e.g., `STOCK-1112`, qty=5)
3. **Change carton in mobile app** (e.g., to `STOCK-1113`)
4. **Scan the same item again** (qty=2)
5. **Verify**: Two separate lines should exist, one for each carton with their respective quantities

### SQL Verification:
```sql
SELECT id, item_code, carton_id, actual_qty, bin_location
FROM tabCycleCountLine
WHERE parent_title = 'CC-A1-R02-L1-B2-MK9NE41Z'
  AND item_code = 'SKU-SHOES-101-BLK-43'
ORDER BY carton_id, id;
```

**Expected Result**: Multiple rows with different `carton_id` values and their respective `actual_qty` values

## Summary

✅ **Fixed**: SQL query now strictly matches by exact carton_id
✅ **Fixed**: Multiple verification points prevent using wrong line
✅ **Fixed**: Safety check clears lineId if carton_ids don't match
✅ **Fixed**: Different cartons now create separate lines with separate quantities
✅ **Protected**: UPDATE logic prevents replacing carton_id with different value
✅ **Debug**: Added comprehensive logging to track query execution and matching

---

**File Modified**: `wms-api/src/modules/cycle-count/cycleCountController.js`
**Function**: `updateCountLines` (POST `/api/cycle-count/:title/count`)
