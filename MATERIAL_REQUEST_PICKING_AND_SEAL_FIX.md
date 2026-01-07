# Material Request Picking and Seal Status Fix

## Issues Fixed

### 1. Validation Error: "Already picked: 20, Requested: 20"

**Problem:**
The mobile app was sending duplicate pick requests or sending total quantity instead of incremental quantity, causing validation errors.

**Solution:**
- Added check to skip items that are already fully picked (instead of throwing error)
- Improved error message to show maximum additional quantity that can be picked
- Made validation more lenient for already-completed items

**Before:**
```javascript
if (newPickedQty > requestedQty) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: `Cannot pick ${pickedQty} for ${item_code}. Already picked: ${currentPickedQty}, Requested: ${requestedQty}`
    }
  });
}
```

**After:**
```javascript
// Check if already fully picked
if (currentPickedQty >= requestedQty && requestedQty > 0) {
  console.log(`ℹ️  Item ${item_code} already fully picked (${currentPickedQty}/${requestedQty}). Skipping.`);
  continue; // Skip this item - already fully picked
}

// Validate: Don't allow picking more than requested
if (newPickedQty > requestedQty) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: `Cannot pick ${pickedQty} for ${item_code}. Already picked: ${currentPickedQty}, Requested: ${requestedQty}. Maximum additional quantity: ${requestedQty - currentPickedQty}`
    }
  });
}
```

### 2. Status Not Updated When Transfer Carton is Sealed

**Problem:**
When sealing a Transfer Carton for a Material Request, the Material Request status was not being updated, even when all items were fully picked.

**Solution:**
Added logic to `sealTransferCarton` to:
1. Check if all Material Request items are fully picked
2. Update Material Request status to "Picked" if all items are fully picked
3. Update Material Request status to "In Progress" if some items are picked (and status was "Submitted")

**Implementation:**
```javascript
if (isMaterialRequest) {
  const materialRequest = transferOrder;
  
  // Check if all items are fully picked
  const [itemStatus] = await connection.execute(`
    SELECT 
      COUNT(*) as total_items,
      SUM(CASE WHEN picked_qty >= requested_qty AND requested_qty > 0 THEN 1 ELSE 0 END) as fully_picked_items,
      SUM(CASE WHEN picked_qty > 0 THEN 1 ELSE 0 END) as partially_picked_items
    FROM tabMaterialRequestItem
    WHERE parent_title = ?
  `, [materialRequest]);
  
  const totalItems = itemStatus[0].total_items || 0;
  const fullyPickedItems = itemStatus[0].fully_picked_items || 0;
  const partiallyPickedItems = itemStatus[0].partially_picked_items || 0;
  
  // Get current Material Request status
  const [mrStatus] = await connection.execute(`
    SELECT status
    FROM tabMaterialRequest
    WHERE title = ?
  `, [materialRequest]);
  
  if (mrStatus.length > 0) {
    const currentStatus = mrStatus[0].status;
    let newStatus = currentStatus;
    
    // Update status based on item picking progress
    if (fullyPickedItems === totalItems && totalItems > 0) {
      // All items are fully picked
      newStatus = 'Picked';
    } else if (partiallyPickedItems > 0 && currentStatus === 'Submitted') {
      // Some items are picked, but not all
      newStatus = 'In Progress';
    }
    
    // Update status if it changed
    if (newStatus !== currentStatus) {
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [newStatus, materialRequest]);
      
      console.log(`✅ Updated Material Request ${materialRequest} status from "${currentStatus}" to "${newStatus}" after sealing transfer carton ${tc_id}`);
    }
  }
}
```

## Status Flow

### Material Request Status Updates:

1. **When Items Are Picked** (via `pick-items` endpoint):
   - If any item has `picked_qty > 0` and status was "Submitted" → Update to "In Progress"
   - If all items have `picked_qty >= requested_qty` → Update to "Picked"

2. **When Transfer Carton is Sealed** (via `seal` endpoint):
   - Check all items in Material Request
   - If all items are fully picked → Update to "Picked"
   - If some items are picked and status was "Submitted" → Update to "In Progress"

## Testing

### Test Case 1: Duplicate Pick Request
**Scenario:** Mobile app tries to pick 20 when 20 is already picked

**Expected Behavior:**
- Item is skipped (no error)
- Log message: "Item SKU-HAT-301-GRN-OS already fully picked (20/20). Skipping."

### Test Case 2: Over-Picking
**Scenario:** Mobile app tries to pick 25 when 20 is already picked and requested is 20

**Expected Behavior:**
- Error returned: "Cannot pick 25 for SKU-HAT-301-GRN-OS. Already picked: 20, Requested: 20. Maximum additional quantity: 0"

### Test Case 3: Seal Transfer Carton
**Scenario:** Seal Transfer Carton when all items are fully picked

**Expected Behavior:**
- Material Request status updated to "Picked"
- Log message: "✅ Updated Material Request MR-0001 status from "In Progress" to "Picked" after sealing transfer carton TC-XXX"

### Test Case 4: Seal Transfer Carton (Partial Pick)
**Scenario:** Seal Transfer Carton when some items are picked

**Expected Behavior:**
- Material Request status updated to "In Progress" (if it was "Submitted")
- Log message: "ℹ️  Transfer carton TC-XXX sealed for Material Request MR-0001. Status remains "In Progress" (2/5 items fully picked)."

## API Changes

### POST /api/material-requests/:title/pick-items
- **Changed:** Now skips items that are already fully picked (instead of throwing error)
- **Changed:** Improved error message to show maximum additional quantity

### POST /api/transfer-cartons/seal
- **Added:** Material Request status update logic
- **Added:** Status check based on item-level picking progress

## Next Steps

1. **Restart API Server** to load changes
2. **Test with Mobile App:**
   - Try picking items that are already fully picked (should skip, not error)
   - Seal Transfer Carton and verify Material Request status updates
3. **Monitor Logs:**
   - Check for "already fully picked" messages
   - Check for "Updated Material Request status" messages

