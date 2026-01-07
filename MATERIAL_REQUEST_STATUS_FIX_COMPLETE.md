# Material Request Status Fix - Complete

## Issue
Material Request header status was showing "Picked" even when not all items were fully picked (Total Picked Qty: 80/100, one item still pending).

## Root Cause
The status computation logic was checking `item.status === 'Picked'` but not verifying that `picked_qty >= requested_qty` for all items. Also, it wasn't correcting the status when it was incorrectly set to "Picked".

## Solution Applied

### 1. Changed Status Check Logic
**Before:**
```javascript
const allItemsPicked = items.length > 0 && items.every(item => item.status === 'Picked');
```

**After:**
```javascript
// Check if all items are fully picked based on picked_qty >= requested_qty (not just status)
const allItemsFullyPicked = items.length > 0 && items.every(item => item.picked_qty >= item.requested_qty && item.requested_qty > 0);
```

### 2. Added Status Correction Logic
Added logic to fix status when it's incorrectly set to "Picked":

```javascript
// Fix status if it's "Picked" but not all items are fully picked
else if (status === 'Picked' && !allItemsFullyPicked) {
  status = 'In Progress';
  await connection.execute(`
    UPDATE tabMaterialRequest
    SET status = ?,
        updated_at = NOW()
    WHERE title = ?
  `, [status, title]);
  const pendingItems = items.filter(item => item.picked_qty < item.requested_qty);
  console.log(`⚠️  Fixed Material Request ${title} status from "Picked" to "In Progress" (not all items fully picked: ${pendingItems.length} item(s) still pending)`);
}
```

### 3. Updated Status Setting Logic
Changed all status checks to use `allItemsFullyPicked` instead of `allItemsPicked`:

```javascript
// Status "Picked" only when ALL items are fully picked (picked_qty >= requested_qty) AND ALL transfer cartons are sealed
if (allItemsFullyPicked && items.length > 0 && sealedTCs === totalTCs && totalTCs > 0 && status !== 'Picked') {
  status = 'Picked';
  // ...
} else if (!allItemsFullyPicked && status === 'Picked') {
  // Not all items are fully picked but status is "Picked" - should be "In Progress"
  status = 'In Progress';
  // ...
}
```

## Status Rules (Final)

### Status "Picked" Requirements:
1. ✅ ALL items have `picked_qty >= requested_qty`
2. ✅ ALL transfer cartons are sealed (status = 'Sealed' or 'Dispatched')

### Status "In Progress":
- Some items are picked but not all
- All items are picked but not all transfer cartons are sealed
- Status was incorrectly set to "Picked" but not all items are fully picked

### Status "Submitted":
- No items picked yet

## Updated Functions

1. ✅ `getMaterialRequests` - Fixed status computation and correction
2. ✅ `getMaterialRequestByTitle` - Fixed status computation and correction
3. ✅ `pickMaterialRequestItems` - Already uses `fullyPickedItems === totalItems` (correct)

## Testing

### Test Case 1: Not All Items Picked
- **Scenario:** 4/5 items fully picked, 1 item pending
- **Expected:** Status = "In Progress" (NOT "Picked")

### Test Case 2: All Items Picked, Not All Sealed
- **Scenario:** 5/5 items fully picked, but only some transfer cartons sealed
- **Expected:** Status = "In Progress" (NOT "Picked")

### Test Case 3: All Items Picked, All Sealed
- **Scenario:** 5/5 items fully picked, all transfer cartons sealed
- **Expected:** Status = "Picked" ✅

### Test Case 4: Status Correction
- **Scenario:** Status is "Picked" but not all items are fully picked
- **Expected:** Status automatically corrected to "In Progress"

## Next Steps

1. **Restart API Server** to load changes
2. **Test:** Fetch Material Requests - status should be corrected automatically
3. **Verify:** Status should be "In Progress" when not all items are fully picked

