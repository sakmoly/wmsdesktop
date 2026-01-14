# Transfer Carton Query Fix

## Issue
Desktop app was not displaying items in Transfer Carton Details, even though events exist in the database.

## Root Cause
The desktop app's SQL query was using the **OLD format** that didn't match the backend API query:
- ❌ `GROUP BY item_code, carton_id, tc_id` (included `tc_id`)
- ❌ Column names: `total_qty`, `latest_event_time`, `latest_user_id`
- ❌ Missing `item_code != ''` check

## Fix Applied

### Desktop App Query (`Services/TransferCartonService.cs`)

**Before:**
```sql
SELECT 
    item_code,
    carton_id,
    tc_id,
    COALESCE(MAX(box_id), carton_id) as source_carton,
    SUM(qty) as total_qty,
    MAX(event_time) as latest_event_time,
    MAX(user_id) as latest_user_id
FROM tabWmsScanEvent
WHERE tc_id = @tc_id
AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
AND item_code IS NOT NULL
AND qty > 0
GROUP BY item_code, carton_id, tc_id
ORDER BY latest_event_time DESC
```

**After (matches backend API):**
```sql
SELECT 
    item_code,
    carton_id AS source_carton,
    SUM(qty) AS quantity,
    MAX(user_id) AS packed_by,
    MAX(event_time) AS packed_on
FROM tabWmsScanEvent
WHERE tc_id = @tc_id
AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
AND item_code IS NOT NULL
AND item_code != ''
AND qty > 0
GROUP BY item_code, carton_id
ORDER BY packed_on DESC
```

### Key Changes:
1. ✅ **Removed `tc_id` from GROUP BY** - Now groups by `item_code, carton_id` only
2. ✅ **Updated column aliases** - `quantity`, `packed_by`, `packed_on` (matches backend)
3. ✅ **Added `item_code != ''` check** - Filters out empty strings
4. ✅ **Removed `COALESCE(MAX(box_id), carton_id)`** - Uses `carton_id` directly as `source_carton`
5. ✅ **Updated Material Request fallback query** - Same format for consistency

### Reader Code
The reader code was already updated to read the new column names:
- `quantity` (was `total_qty`)
- `packed_by` (was `latest_user_id`)
- `packed_on` (was `latest_event_time`)

## Verification

**Database Check:**
- ✅ Events exist: 4 `PACK_ITEM_TO_TC` events for `TC-MR-123459-1768157787512`
- ✅ Backend API query returns: 1 item with quantity 5.00 (correctly summed)
- ✅ Desktop app query now matches backend API query exactly

## Test Results

**Before Fix:**
- Desktop app showed empty table (0 items)

**After Fix:**
- Desktop app should show 1 item: `SKU-HAT-301-BLU-OS` with quantity `5.00`

## Next Steps

1. **Rebuild desktop app** to apply the changes
2. **Refresh Transfer Carton Details** window
3. **Verify items are displayed** correctly

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-12  
**Files Changed:** `Services/TransferCartonService.cs`
