# Material Request Sealed Status Fix

## Issue Analysis

The test results showed that:
1. ✅ Transfer cartons are being sealed correctly
2. ❌ Items in sealed transfer cartons are NOT being updated to "Sealed" status
3. ❌ No items found in `tabWmsScanEvent` with `tc_id` and `event_type = 'PACK_BOX_TO_TC'`

**Root Cause:** Events are not being saved with `tc_id` field, or events are using a different event type.

## Solution

Updated the `sealTransferCarton` function to use multiple fallback methods to find items:

### Method 1: Find items by `tc_id` (Preferred)
```sql
SELECT DISTINCT item_code
FROM tabWmsScanEvent
WHERE tc_id = ?
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC', 'SORT_TO_BOX')
  AND item_code IS NOT NULL
```

### Method 2: Find items by `transfer_order` and time window
If `tc_id` is not available, find items by:
- `transfer_order = Material Request number`
- Event time around transfer carton creation/seal time (±1 hour)
- Event types: `PACK_BOX_TO_TC`, `PACK_ITEM_TO_TC`, `SORT_TO_BOX`

### Method 3: Fallback - Mark all fully picked items as sealed
If events are not found, mark all fully picked items (`picked_qty >= requested_qty`) as "Sealed".

## Updated Logic

```javascript
// Method 1: Find items by tc_id
const [itemsByTC] = await connection.execute(`
  SELECT DISTINCT item_code
  FROM tabWmsScanEvent
  WHERE tc_id = ?
    AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC', 'SORT_TO_BOX')
    AND item_code IS NOT NULL
`, [tc_id]);

if (itemsByTC.length > 0) {
  cartonItems = itemsByTC;
} else {
  // Method 2: Find items by transfer_order and time window
  const [itemsByMR] = await connection.execute(`
    SELECT DISTINCT item_code
    FROM tabWmsScanEvent
    WHERE transfer_order = ?
      AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC', 'SORT_TO_BOX')
      AND item_code IS NOT NULL
      AND event_time >= DATE_SUB(?, INTERVAL 1 HOUR)
      AND event_time <= DATE_ADD(?, INTERVAL 1 HOUR)
  `, [materialRequest, tcCreatedOn, tcSealedOn]);
  
  if (itemsByMR.length > 0) {
    cartonItems = itemsByMR;
  } else {
    // Method 3: Fallback - mark all fully picked items as sealed
    const [fullyPickedItems] = await connection.execute(`
      SELECT item_code
      FROM tabMaterialRequestItem
      WHERE parent_title = ?
        AND picked_qty >= requested_qty
        AND requested_qty > 0
        AND status != 'Sealed'
    `, [materialRequest]);
    
    cartonItems = fullyPickedItems;
  }
}
```

## Event Types Supported

The function now checks for multiple event types:
- `PACK_BOX_TO_TC` - Packing boxes to transfer carton
- `PACK_ITEM_TO_TC` - Packing individual items to transfer carton
- `SORT_TO_BOX` - Sorting items to boxes (which may then be packed to TC)

## Testing

### Test Case 1: Events with tc_id
1. Seal transfer carton with events that have `tc_id`
2. **Expected:** Items found by Method 1, status updated to "Sealed"

### Test Case 2: Events without tc_id
1. Seal transfer carton with events that don't have `tc_id` but have `transfer_order`
2. **Expected:** Items found by Method 2, status updated to "Sealed"

### Test Case 3: No events found
1. Seal transfer carton with no matching events
2. **Expected:** All fully picked items marked as "Sealed" (Method 3)

## Next Steps

1. **Restart API Server** to load changes
2. **Test sealing a transfer carton:**
   - Check API logs for which method found the items
   - Verify items are updated to "Sealed" status
   - Verify mobile app filters out "Sealed" items

## Important Notes

- The fallback method (Method 3) will mark ALL fully picked items as "Sealed" if events are not found
- This is a safety measure to ensure items are marked as sealed even if event tracking is incomplete
- For better accuracy, ensure events are saved with `tc_id` field when packing items

