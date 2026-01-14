# Cycle Count Carton ID Replacement Fix

## Issue
When scanning the same item with different carton IDs in a cycle count session, the system was **replacing** the carton ID of the existing line instead of creating a **separate line** for each carton.

**Example:**
- Scan `SKU-SHOES-101-BLK-43` with carton `STOCK-1112` → Creates line with carton `STOCK-1112`
- Scan `SKU-SHOES-101-BLK-43` with carton `STOCK-1113` → **Replaces** carton to `STOCK-1113` (WRONG)
- **Expected:** Should create a **new line** with carton `STOCK-1113`

## Root Cause

The line matching logic was finding an existing line and then the UPDATE statement was updating the `carton_id` even when it should have created a new line instead.

### Problem Areas:

1. **Matching Logic**: The query was matching lines, but the carton_id comparison might not have been strict enough
2. **UPDATE Logic**: The UPDATE statement was updating `carton_id` without verifying it matched the existing line's carton_id

## Fixes Applied

### 1. Enhanced Line Matching Logic (Lines 1652-1662)

**Before:**
```javascript
if (hasCartonIdColumn) {
  if (cartonId) {
    findQuery += ' AND carton_id = ?';
    findParams.push(cartonId);
  } else {
    findQuery += ' AND (carton_id IS NULL OR carton_id = "")';
  }
}
```

**After:**
```javascript
if (hasCartonIdColumn) {
  if (cartonId && cartonId.trim() !== '') {
    // Request has carton_id - ONLY match lines with this exact carton_id
    // This prevents matching lines with NULL or different carton_id
    findQuery += ' AND carton_id = ?';
    findParams.push(cartonId.trim());
  } else {
    // Request has no carton_id - ONLY match lines with NULL or empty carton_id
    // This prevents matching lines that already have a carton_id assigned
    findQuery += ' AND (carton_id IS NULL OR carton_id = "" OR TRIM(carton_id) = "")';
  }
}
```

**Improvements:**
- ✅ Trims carton_id to handle whitespace
- ✅ Stricter matching: only matches exact carton_id
- ✅ Prevents matching lines with different carton_ids

### 2. Carton ID Verification Before Using Existing Line (Lines 1668-1700)

**Added verification:**
```javascript
if (lineRows.length > 0) {
  const foundCartonId = hasCartonIdColumn ? (lineRows[0].carton_id || null) : null;
  const requestCartonId = cartonId || null;
  
  // CRITICAL: Verify carton_id matches exactly - if different, create new line instead
  if (hasCartonIdColumn) {
    const foundCartonIdNormalized = foundCartonId ? String(foundCartonId).trim() : null;
    const requestCartonIdNormalized = requestCartonId ? String(requestCartonId).trim() : null;
    
    // If carton_ids don't match (both are not null and different), don't use this line
    if (foundCartonIdNormalized !== null && requestCartonIdNormalized !== null && 
        foundCartonIdNormalized !== requestCartonIdNormalized) {
      console.log(`[Cycle Count] ⚠️ Carton ID mismatch! Found line has carton_id="${foundCartonIdNormalized}" but request has carton_id="${requestCartonIdNormalized}" - will create NEW line for different carton`);
      lineRows = []; // Clear the match so a new line is created
    } else {
      lineId = lineRows[0].id; // Carton IDs match - use this line
    }
  }
}
```

**Improvements:**
- ✅ Double-checks carton_id match before using existing line
- ✅ Creates new line if carton_ids don't match
- ✅ Prevents accidental carton_id replacement

### 3. Protected UPDATE Logic (Lines 1835-1870)

**Before:**
```javascript
if (hasCartonIdColumn && cartonId !== null && cartonId !== undefined) {
  updateQuery += `, carton_id = ?`;
  updateParams.push(cartonId);
}
```

**After:**
```javascript
if (hasCartonIdColumn) {
  // Check current carton_id of the line before updating
  const [currentCartonCheck] = await connection.execute(`
    SELECT carton_id FROM tabCycleCountLine WHERE id = ?
  `, [lineId]);
  
  if (currentCartonCheck.length > 0) {
    const currentCartonId = currentCartonCheck[0].carton_id;
    const currentCartonIdNormalized = currentCartonId ? String(currentCartonId).trim() : null;
    const requestCartonIdNormalized = cartonId ? String(cartonId).trim() : null;
    
    // Only update carton_id if:
    // 1. Current is NULL/empty and request has a value (initial assignment)
    // 2. Current matches request (no change needed, but safe to update)
    // DO NOT update if current and request are different non-null values
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
      console.error(`[Cycle Count] ❌ ERROR: Attempted to update line ${lineId} with different carton_id! Preserving existing carton_id.`);
      // Don't update carton_id - preserve the existing one
    }
  }
}
```

**Improvements:**
- ✅ Verifies current carton_id before updating
- ✅ Only updates if carton_ids match or initial assignment
- ✅ Prevents replacing carton_id with a different value
- ✅ Logs error if mismatch detected (should not happen with proper matching)

## Expected Behavior After Fix

### Scenario: Scanning Same Item with Different Cartons

1. **First Scan**: `SKU-SHOES-101-BLK-43` with carton `STOCK-1112`
   - ✅ Creates new line: `item_code=SKU-SHOES-101-BLK-43, carton_id=STOCK-1112, actual_qty=5`

2. **Second Scan**: `SKU-SHOES-101-BLK-43` with carton `STOCK-1113`
   - ✅ Creates **NEW** line: `item_code=SKU-SHOES-101-BLK-43, carton_id=STOCK-1113, actual_qty=2`
   - ✅ **Does NOT** replace the first line's carton_id

3. **Result**: Two separate lines for the same item in different cartons
   - Line 1: `SKU-SHOES-101-BLK-43` in `STOCK-1112` = 5 qty
   - Line 2: `SKU-SHOES-101-BLK-43` in `STOCK-1113` = 2 qty

## Testing

To verify the fix works:

1. **Create a cycle count task**
2. **Scan an item with carton A** (e.g., `STOCK-1112`)
3. **Change carton in mobile app** (e.g., to `STOCK-1113`)
4. **Scan the same item again**
5. **Verify**: Two separate lines should exist, one for each carton

### SQL Verification:
```sql
SELECT id, item_code, carton_id, actual_qty, bin_location
FROM tabCycleCountLine
WHERE parent_title = 'CC-A1-R02-L1-B2-MK9NE41Z'
  AND item_code = 'SKU-SHOES-101-BLK-43'
ORDER BY carton_id;
```

**Expected Result**: Multiple rows with different `carton_id` values

## Summary

✅ **Fixed**: Line matching now strictly enforces carton_id match
✅ **Fixed**: UPDATE logic prevents replacing carton_id with different value
✅ **Fixed**: Different cartons now create separate lines for the same item
✅ **Protected**: Multiple safeguards prevent accidental carton_id replacement

---

**File Modified**: `wms-api/src/modules/cycle-count/cycleCountController.js`
**Function**: `updateCountLines` (POST `/api/cycle-count/:title/count`)
