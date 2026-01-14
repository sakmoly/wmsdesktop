# Transfer Carton Quantity Sum Fix

## Issue

The backend was not correctly summing quantities when the same item was scanned multiple times with the same `carton_id` and `tc_id`. The query was grouping by `item_code, box_id` only, which could cause issues when:
- Same item is scanned multiple times with the same `carton_id`
- Multiple events exist for the same item+carton+tc combination

## Root Cause

The original query was:
```sql
GROUP BY item_code, box_id
```

This doesn't properly handle cases where:
- Same item is scanned multiple times with the same `carton_id` and `tc_id`
- We need to SUM all `qty` values from all events, not just use the latest value

## Fix Applied

### Backend API (`wms-api/src/modules/transfer-cartons/transferCartonController.js`)

**Updated Query (Exact Match to User Requirement):**
```sql
SELECT 
  item_code,
  carton_id,
  tc_id,
  COALESCE(box_id, carton_id) as source_carton,
  SUM(qty) as total_qty,
  MAX(event_time) as latest_event_time,
  MAX(user_id) as latest_user_id
FROM tabWmsScanEvent
WHERE tc_id = ?
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
  AND item_code IS NOT NULL
  AND qty > 0
GROUP BY item_code, carton_id, tc_id
ORDER BY latest_event_time DESC
```

**Key Changes:**
1. ✅ Added `carton_id` and `tc_id` to SELECT clause
2. ✅ **GROUP BY item_code, carton_id, tc_id** (exactly as per user requirement)
3. ✅ This ensures proper summing when same item is scanned multiple times with same carton_id and tc_id
4. ✅ Removed `box_id` from GROUP BY to sum all quantities for same item+carton+tc regardless of box

**Fallback Query (for Material Requests without tc_id):**
Also updated to use the same GROUP BY pattern:
```sql
GROUP BY item_code, carton_id, tc_id
```

### Desktop App (`Services/TransferCartonService.cs`)

**Updated Query (Exact Match to User Requirement):**
```sql
SELECT 
  item_code,
  carton_id,
  tc_id,
  COALESCE(box_id, carton_id) as source_carton,
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

**Key Changes:**
1. ✅ Added `carton_id` and `tc_id` to SELECT clause
2. ✅ **GROUP BY item_code, carton_id, tc_id** (exactly as per user requirement)
3. ✅ Added `AND qty > 0` filter to exclude zero quantities
4. ✅ Removed `box_id` from GROUP BY to sum all quantities for same item+carton+tc regardless of box

## How It Works Now

### Example Scenario:

**Mobile app scans the same item 3 times:**
1. Event 1: `item_code="SKU-001"`, `carton_id="CTN-001"`, `tc_id="TC-001"`, `qty=1`
2. Event 2: `item_code="SKU-001"`, `carton_id="CTN-001"`, `tc_id="TC-001"`, `qty=1`
3. Event 3: `item_code="SKU-001"`, `carton_id="CTN-001"`, `tc_id="TC-001"`, `qty=1`

**Before Fix:**
- Query groups by `item_code, box_id` only
- If `box_id` is NULL or varies, might create separate groups
- Result: Could show `qty=1` (latest value) instead of `qty=3` (sum)

**After Fix:**
- Query groups by `item_code, carton_id, tc_id` (exactly as per user requirement)
- All 3 events are in the same group (same item_code, carton_id, and tc_id)
- Result: Shows `qty=3` (SUM of all events) ✅

## Testing

To verify the fix works:

1. **Create a transfer carton:**
   ```
   POST /api/transfer-cartons/create
   {
     "tc_id": "TC-TEST-001",
     "to_no": "MR-001",
     "store": "STORE-001",
     "user_id": "USER-001"
   }
   ```

2. **Send multiple packing events for the same item:**
   ```
   POST /api/events/batch
   {
     "events": [
       {
         "event_type": "PACK_ITEM_TO_TC",
         "tc_id": "TC-TEST-001",
         "item_code": "SKU-001",
         "carton_id": "CTN-001",
         "qty": 1,
         ...
       },
       {
         "event_type": "PACK_ITEM_TO_TC",
         "tc_id": "TC-TEST-001",
         "item_code": "SKU-001",
         "carton_id": "CTN-001",
         "qty": 1,
         ...
       },
       {
         "event_type": "PACK_ITEM_TO_TC",
         "tc_id": "TC-TEST-001",
         "item_code": "SKU-001",
         "carton_id": "CTN-001",
         "qty": 1,
         ...
       }
     ]
   }
   ```

3. **Get transfer carton contents:**
   ```
   GET /api/transfer-cartons/TC-TEST-001
   ```

4. **Expected Result:**
   ```json
   {
     "contents": [
       {
         "item_code": "SKU-001",
         "source_carton": "CTN-001",
         "qty": 3,  // ✅ SUM of all 3 events
         ...
       }
     ]
   }
   ```

## Summary

✅ **Fixed:** Backend now properly sums quantities using `GROUP BY item_code, carton_id, tc_id` (exactly as per user requirement)  
✅ **Fixed:** Desktop app query also updated to match  
✅ **Result:** Multiple scans of the same item with the same carton_id and tc_id now correctly show the sum of all quantities  
✅ **Query Matches User Requirement:** `GROUP BY item_code, carton_id, tc_id`

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-11  
**Files Changed:**
- `wms-api/src/modules/transfer-cartons/transferCartonController.js`
- `Services/TransferCartonService.cs`
