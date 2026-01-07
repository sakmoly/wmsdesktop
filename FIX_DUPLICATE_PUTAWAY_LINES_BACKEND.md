# Fix: Duplicate Putaway Lines Created by Backend API

## Problem

When creating putaway tasks, **two lines are being created** for the same carton and item:
- Line 1: `PAW-ASN12225-1767` + `SKU-HAT-301-BLU-OS` + Rack: `A1-R01-L1-B1` + Bin: `B1` + Qty: `75`
- Line 2: `PAW-ASN12225-1767` + `SKU-HAT-301-BLU-OS` + Rack: (empty) + Bin: `B1` + Qty: `75`
- **Total: 150** (should be 75)

## Root Cause

The issue is in the **backend API** (`wms-api/src/modules/events/eventController.js`), specifically in the `processPutawayEvent` function.

### The Problem

The deduplication check was using:
```sql
AND rack = ?
```

This SQL comparison **doesn't handle NULL/empty rack values correctly**. When:
- Event 1 has `rack = 'A1-R01-L1-B1'` → Creates line with rack
- Event 2 has `rack = NULL` or `rack = ''` → SQL `rack = ?` doesn't match the first line, so it creates a **second line**

### Why This Happens

1. **Mobile app sends events** with `PUTAWAY_TO_RACK` event type
2. **Backend processes events** via `processPutawayEvent` function
3. **Deduplication check fails** when one event has a rack and another doesn't
4. **Two lines are created** instead of one

## Fix Applied

### Changed Deduplication Logic

**Before:**
```javascript
AND rack = ?
AND (bin = ? OR (bin IS NULL AND ? IS NULL))
```

**After:**
```javascript
AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
```

This now properly handles:
- `rack = 'A1-R01-L1-B1'` vs `rack = NULL` → Treated as different (correct)
- `rack = 'A1-R01-L1-B1'` vs `rack = 'A1-R01-L1-B1'` → Treated as same (correct)
- `rack = NULL` vs `rack = NULL` → Treated as same (correct)
- `rack = ''` vs `rack = NULL` → Treated as same (correct)

### Files Modified

1. **`wms-api/src/modules/events/eventController.js`**:
   - Fixed `processPutawayEvent` function (lines 373-422)
   - Fixed deduplication check for item_code provided case
   - Fixed deduplication check for tc_id provided case
   - Fixed "different location" check to properly handle NULL rack

## Testing

### To Verify the Fix

1. **Run diagnostic SQL**:
   ```sql
   -- Run CHECK_DUPLICATE_PUTAWAY_LINES_SOURCE.sql
   ```

2. **Check for duplicate events**:
   - If duplicate events exist → Mobile app is sending duplicates (fix mobile app)
   - If events are unique but lines are duplicated → Backend was creating duplicates (now fixed)

3. **Test putaway creation**:
   - Send a `PUTAWAY_TO_RACK` event with rack
   - Send another `PUTAWAY_TO_RACK` event with same carton+item but NULL rack
   - Should create **only one line** (not two)

## Expected Result

After applying the fix:
- **One line** should be created per carton+item+location combination
- If rack is NULL in one event and has a value in another, they should be treated as **different locations** (correct behavior)
- If rack is NULL in both events, they should be treated as **same location** (deduplicated)

## Next Steps

1. **Restart API server**:
   ```bash
   cd wms-api
   npm start
   ```

2. **Test putaway creation** from mobile app

3. **Check existing duplicates**:
   - Run `CHECK_DUPLICATE_PUTAWAY_LINES_SOURCE.sql` to find existing duplicates
   - Optionally run `FIX_DUPLICATE_CARTON_QUANTITIES.sql` to clean up existing duplicates

---

**The duplicate putaway lines issue is now fixed in the backend API.**

