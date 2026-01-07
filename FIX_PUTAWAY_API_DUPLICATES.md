# Fix: PUTAWAY API Generating Duplicates

## Problem

The PUTAWAY API was generating duplicate putaway lines for the same carton ID. For example:
- `BOX-WHMAIN-133342` appeared twice with different locations
- Same carton+item combination was being processed multiple times

## Root Cause

The `processPutawayEvent` function in `eventController.js` was **not checking for location (rack/bin)** when checking for existing putaway lines. It only checked:
- `parent_title` (putaway task)
- `item_code`
- `carton_id`

This meant:
1. If the same carton+item was put away to **different locations**, it would **update** the existing line instead of creating a new one
2. If the same carton+item was put away to the **same location** multiple times, it would create **duplicates**

## Fixes Applied

### 1. Fixed `processPutawayEvent` - Item Code Provided
- ✅ Now checks for existing line with **same carton + item + location**
- ✅ Updates quantity if line exists with same location
- ✅ Warns if carton+item exists in different location before creating new line
- ✅ Only creates new line if no exact match exists

### 2. Fixed `processPutawayEvent` - Transfer Carton Processing
- ✅ Now checks for existing line with **same carton + item + location**
- ✅ Updates quantity if line exists with same location
- ✅ Warns if carton+item exists in different location before creating new line

### 3. Enhanced `completePutaway`
- ✅ Already had location check, but improved to include `qty` in SELECT

## Code Changes

### Before:
```javascript
// Only checked carton_id and item_code - NO location check!
const [existingLines] = await connection.execute(
  `SELECT id FROM tabPutawayLine 
   WHERE parent_title = ? AND item_code = ? 
   AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))`,
  [putawayTaskTitle, item_code, carton_id, carton_id]
);
```

### After:
```javascript
// Now checks carton_id + item_code + location (rack + bin)
const [existingLines] = await connection.execute(
  `SELECT id, qty FROM tabPutawayLine 
   WHERE parent_title = ? 
     AND item_code = ? 
     AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
     AND rack = ?
     AND (bin = ? OR (bin IS NULL AND ? IS NULL))`,
  [putawayTaskTitle, item_code, carton_id, carton_id, rack, bin || null, bin || null]
);
```

## Expected Behavior After Fix

1. **Same carton + item + location**: Updates existing line (no duplicate)
2. **Same carton + item + different location**: Creates new line (legitimate - box split)
3. **Different carton + same item + same location**: Creates new line (legitimate - different boxes)

## Next Steps

1. **Restart API Server** to apply the fixes:
   ```bash
   cd wms-api
   npm start
   ```

2. **Fix Existing Duplicates** in database:
   ```sql
   -- Run FIX_DUPLICATE_CARTON_QUANTITIES.sql
   ```

3. **Test** by scanning a transfer carton multiple times - should not create duplicates

## Verification

After restarting the API, test:
1. Scan the same transfer carton twice with the same location → Should update, not duplicate
2. Scan the same transfer carton with different locations → Should create separate lines (legitimate)
3. Check logs for warnings about different locations

## Files Modified

- ✅ `wms-api/src/modules/events/eventController.js` - Fixed `processPutawayEvent`
- ✅ `wms-api/src/modules/putaway/putawayController.js` - Enhanced `completePutaway`

---

**The API will no longer generate duplicates for the same carton+item+location combination.**

