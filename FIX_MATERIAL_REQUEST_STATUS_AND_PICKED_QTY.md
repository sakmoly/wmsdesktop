# Fix Material Request Status and Picked Quantity Display

## Problem
1. Material Request header shows status "Picked" even though all item lines show `picked_qty = 0.00`
2. Item lines are not showing picked quantities (stuck at 0.00)
3. Status is changing to "Picked" incorrectly

## Root Causes
1. Status was set to "Picked" somewhere (possibly manually or from old code) even though no items were picked
2. The mobile app might not be calling the pick-items endpoint, so `picked_qty` is never updated
3. Status validation was missing - no check to prevent "Picked" when `total_picked_qty = 0`

## Solution Implemented

### 1. Status Validation and Auto-Fix

**In GET endpoints (`getMaterialRequests` and `getMaterialRequestByTitle`):**
- ✅ Calculate `total_picked_qty` from actual item `picked_qty` values (more accurate)
- ✅ Check if status is "Picked" but `total_picked_qty = 0`
- ✅ Auto-fix: Reset status to "In Progress" or "Submitted" if incorrectly set to "Picked"
- ✅ Return corrected status and `total_picked_qty` to client

**In PICK endpoint (`pickMaterialRequestItems`):**
- ✅ Check if status is "Picked" but no items are picked
- ✅ Auto-fix: Reset status to "In Progress" or "Submitted"

**In SEAL endpoint (`sealTransferCarton`):**
- ✅ Validate that `total_picked_qty > 0` before setting status to "Picked"
- ✅ Only set status to "Picked" when:
  - All items are fully picked (`picked_qty >= requested_qty` for all items)
  - `total_picked_qty > 0` (safety check)
  - Transfer carton is sealed

### 2. Accurate Total Picked Quantity

**Always calculate from items:**
- `total_picked_qty` is now calculated from sum of all item `picked_qty` values
- More accurate than using database `total_picked_qty` field directly
- Ensures consistency between items and header

## Code Changes

### GET Material Requests (List)
```javascript
// Calculate actual total_picked_qty from items
const actualTotalPicked = items.reduce((sum, item) => sum + item.picked_qty, 0);

// Fix status if incorrectly set to "Picked"
if (status === 'Picked' && actualTotalPicked === 0) {
  const correctStatus = row.status === 'Submitted' ? 'Submitted' : 'In Progress';
  await connection.execute(`
    UPDATE tabMaterialRequest
    SET status = ?,
        updated_at = NOW()
    WHERE title = ?
  `, [correctStatus, row.title]);
  status = correctStatus;
}

return {
  ...
  total_picked_qty: actualTotalPicked, // Use calculated value
  status: status // Use corrected status
};
```

### GET Single Material Request
```javascript
// Same validation and auto-fix logic
const actualTotalPicked = items.reduce((sum, item) => sum + item.picked_qty, 0);

if (status === 'Picked' && actualTotalPicked === 0) {
  // Auto-fix status
}
```

### PICK Items Endpoint
```javascript
// Fix incorrect status when picking items
if (newTotalPicked === 0 && newStatus === 'Picked') {
  newStatus = materialRequest.status === 'Submitted' ? 'Submitted' : 'In Progress';
  await connection.execute(`
    UPDATE tabMaterialRequest
    SET status = ?,
        updated_at = NOW()
    WHERE title = ?
  `, [newStatus, title]);
}
```

### SEAL Transfer Carton
```javascript
// Validate total_picked_qty > 0 before setting status to "Picked"
const totalPickedQty = parseFloat(mrCheck[0].total_picked_qty) || 0;

if (fullyPickedItems === totalItems && totalItems > 0 && totalPickedQty > 0) {
  // Set status to "Picked"
} else if (status === 'Picked' && totalPickedQty === 0) {
  // Reset status to "In Progress"
}
```

## How It Works Now

### Scenario 1: Status Incorrectly Set to "Picked" (No Items Picked)
1. User opens Material Request details
2. API detects: `status = "Picked"` but `total_picked_qty = 0`
3. API auto-fixes: Updates status to "In Progress" or "Submitted"
4. Returns corrected status and `total_picked_qty = 0`

### Scenario 2: Items Are Picked
1. Mobile app calls `POST /api/material-requests/MR-0001/pick-items`
2. API updates `picked_qty` for each item
3. API recalculates `total_picked_qty` from items
4. API updates status: "Submitted" → "In Progress" (if first pick)
5. Returns updated `picked_qty` values

### Scenario 3: All Items Picked + Transfer Carton Sealed
1. All items have `picked_qty >= requested_qty`
2. Transfer carton is sealed
3. API validates: All items picked AND `total_picked_qty > 0`
4. API sets status to "Picked"
5. Returns status "Picked"

## Verification

### Check Current Status
```sql
SELECT 
  title,
  status,
  total_requested_qty,
  total_picked_qty,
  (SELECT COALESCE(SUM(picked_qty), 0) FROM tabMaterialRequestItem WHERE parent_title = tabMaterialRequest.title) as calculated_picked_qty
FROM tabMaterialRequest
WHERE title = 'MR-0001';
```

### Check Item Picking Status
```sql
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  (requested_qty - picked_qty) as pending_qty
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0001'
ORDER BY item_code;
```

### Fix Incorrect Status (Manual SQL)
```sql
-- Reset status if incorrectly set to "Picked" but no items are picked
UPDATE tabMaterialRequest mr
SET status = CASE 
  WHEN status = 'Submitted' THEN 'Submitted'
  ELSE 'In Progress'
END,
updated_at = NOW()
WHERE status = 'Picked'
  AND (SELECT COALESCE(SUM(picked_qty), 0) FROM tabMaterialRequestItem WHERE parent_title = mr.title) = 0;
```

## Expected Behavior

### Before Fix:
- ❌ Status: "Picked"
- ❌ Total Picked: 0.00
- ❌ All items: `picked_qty = 0.00`

### After Fix:
- ✅ Status: "In Progress" or "Submitted" (auto-corrected)
- ✅ Total Picked: 0.00 (calculated from items)
- ✅ All items: `picked_qty = 0.00` (accurate)

### When Items Are Picked:
- ✅ Status: "In Progress"
- ✅ Total Picked: 40.00 (sum of item picked_qty)
- ✅ Items: `picked_qty` updated individually

## Next Steps

1. **Restart API Server** to load the fixes
2. **Refresh Desktop App** to see corrected status
3. **Test Picking** - Call `POST /api/material-requests/MR-0001/pick-items` to update picked quantities
4. **Verify** - Check that status and picked_qty are now accurate

## Important Notes

1. **Status auto-fixes on GET requests** - No manual intervention needed
2. **total_picked_qty is always calculated from items** - More accurate
3. **Status "Picked" requires validation** - Must have items picked AND carton sealed
4. **Mobile app must call pick-items endpoint** - Otherwise picked_qty stays at 0

