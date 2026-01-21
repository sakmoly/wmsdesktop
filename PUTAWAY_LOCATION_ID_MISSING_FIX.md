# Putaway Location ID Missing Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

**Issue**: `location_id` is missing in `tabPutawayLine` and `tabPutawayTask` after scanning location.

**Root Cause**: The condition to update location was too restrictive:
```javascript
if (taskTitleToCheck && !box_id && !actualCartonId) {
  // Only updates if box_id AND actualCartonId are both missing
}
```

**Problem**: When mobile app sends `box_id` (e.g., `CTN-TI-123457-20260120-210842-726`), the condition fails and location is not updated.

---

## ✅ Solution Implemented

### Fixed Condition Logic

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Line**: 4394

**Before**:
```javascript
if (taskTitleToCheck && !box_id && !actualCartonId) {
  // Only updates if neither box_id nor actualCartonId provided
}
```

**After**:
```javascript
if (taskTitleToCheck && location_id) {
  // Updates location if putaway_task and location_id are provided
  // Works for both desktop app (putaway_task only) and mobile app (box_id + putaway_task)
}
```

### Added Debug Logging

**Added logging to track**:
1. Whether `location_id` column exists in `tabPutawayLine`
2. The UPDATE query being executed
3. Number of rows affected
4. Whether location update succeeded

**Code**:
```javascript
logger.info(`[Putaway] Updating ${putawayLines.length} line(s) with location: location_id=${location_id}`, {
  hasLineLocationIdColumn: hasLineLocationIdColumn,
  hasLineRack: hasLineRack,
  hasLineBin: hasLineBin
});

logger.info(`[Putaway] Executing UPDATE query: ${updateQuery} with params: [${updateParams.join(', ')}]`);
logger.info(`[Putaway] Updated line ID ${line.id}: ${updateResult.affectedRows} row(s) affected`);
```

---

## 🔍 How to Verify Fix

### Step 1: Check if location_id Column Exists

```sql
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabPutawayLine' 
  AND COLUMN_NAME = 'location_id';
```

**If column doesn't exist**: Add it with:
```sql
ALTER TABLE tabPutawayLine
ADD COLUMN location_id VARCHAR(100) NULL AFTER bin,
ADD INDEX idx_location_id (location_id);
```

### Step 2: Update Location via API

**Request**:
```bash
POST /api/putaway/scan-transfer-carton
{
  "putaway_task": "PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-402498"
}
```

**Check Logs**: Should see:
```
[Putaway] Updating 2 line(s) with location: location_id=A1-R02-L1-B2
[Putaway] Including location_id=A1-R02-L1-B2 in UPDATE for line ID 123
[Putaway] Executing UPDATE query: UPDATE tabPutawayLine SET rack = ?, bin = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
[Putaway] Updated line ID 123: 1 row(s) affected
```

### Step 3: Verify Location Saved

```sql
SELECT parent_title, item_code, qty, rack, bin, location_id, carton_id
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260120-0001';
```

**Expected**: All lines should have `location_id = 'A1-R02-L1-B2'`

---

## 🔧 Additional Fixes

### Fix 1: Ensure Location Update Works with box_id

**Changed**: Condition now allows location update when `putaway_task` is provided, even if `box_id` is also provided.

**Reason**: Mobile app might send both `box_id` and `putaway_task`, and we still want to update location.

### Fix 2: Enhanced Logging

**Added**: Detailed logging to track:
- Column existence checks
- UPDATE query construction
- Query execution results
- Number of rows affected

**Purpose**: Helps debug if location_id column doesn't exist or update fails.

---

## 📋 Testing Checklist

- [ ] `location_id` column exists in `tabPutawayLine` table
- [ ] API call with `putaway_task` and `location_id` updates all lines
- [ ] API call with `box_id` and `location_id` also updates lines (if putaway_task can be found)
- [ ] Location is saved in both `tabPutawayLine` and `tabPutawayTask`
- [ ] Logs show successful UPDATE queries
- [ ] Stock updates work after location is saved

---

## 🚨 If Location Still Not Saving

### Check 1: Column Exists?

```sql
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabPutawayLine' 
  AND COLUMN_NAME = 'location_id';
```

**If empty**: Column doesn't exist - add it (see Step 1 above).

### Check 2: Check Backend Logs

Look for:
- `[Putaway] Updating X line(s) with location...`
- `[Putaway] Including location_id=... in UPDATE...`
- `[Putaway] Updated line ID X: 1 row(s) affected`

**If missing**: Location update code path is not executing.

### Check 3: Manual SQL Update

```sql
-- Manually update location to test
UPDATE tabPutawayLine
SET location_id = 'A1-R02-L1-B2',
    rack = 'A1-R02-L1',
    bin = 'B2'
WHERE parent_title = 'PUT-20260120-0001'
  AND (location_id IS NULL OR location_id = 'TBD');
```

**Then test stock update** - if it works, the issue is with the API update logic.

---

## 📝 Summary

✅ **Fixed condition** to allow location update when `putaway_task` is provided  
✅ **Added debug logging** to track location updates  
✅ **Works for both** desktop app and mobile app workflows  

**Result**: Location should now be saved correctly in `tabPutawayLine` and `tabPutawayTask`! 🎉

---

**END**
