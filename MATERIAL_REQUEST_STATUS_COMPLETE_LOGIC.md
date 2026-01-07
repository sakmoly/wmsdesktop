# Material Request Status - Complete Logic Fix

## Issue
Status was being set to "Picked" when all items were fully picked, even if transfer cartons were not all sealed. Users can seal transfer cartons during picking, so status should only be "Picked" when ALL items are picked AND ALL transfer cartons are sealed.

## Requirements
1. Status "Picked" should only be set when:
   - ALL items have `picked_qty >= requested_qty` AND
   - ALL transfer cartons for the Material Request are sealed (status = 'Sealed' or 'Dispatched')

2. Status "In Progress" should be set when:
   - Some items are picked but not all, OR
   - All items are picked but not all transfer cartons are sealed

3. Users can seal transfer cartons at any time during picking without changing status to "Picked" unless both conditions are met.

## Changes Made

### 1. `sealTransferCarton` Function
**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Before:**
- Status was set to "Picked" when all items were fully picked, regardless of transfer carton sealing status.

**After:**
- Checks if all items are fully picked
- Checks if all transfer cartons are sealed
- Only sets status to "Picked" when BOTH conditions are met
- Sets status to "In Progress" if some items are picked (and status was "Submitted")

**Logic:**
```javascript
// Check if all items are fully picked
const [itemStatus] = await connection.execute(`
  SELECT 
    COUNT(*) as total_items,
    SUM(CASE WHEN picked_qty >= requested_qty AND requested_qty > 0 THEN 1 ELSE 0 END) as fully_picked_items,
    SUM(CASE WHEN picked_qty > 0 THEN 1 ELSE 0 END) as partially_picked_items
  FROM tabMaterialRequestItem
  WHERE parent_title = ?
`, [materialRequest]);

// Check if all transfer cartons are sealed
const [tcStatus] = await connection.execute(`
  SELECT 
    COUNT(*) as total_tcs,
    SUM(CASE WHEN status = 'Sealed' OR status = 'Dispatched' THEN 1 ELSE 0 END) as sealed_tcs
  FROM tabTransferCarton
  WHERE transfer_order = ? OR to_no = ?
`, [materialRequest, materialRequest]);

// Status "Picked" only when ALL items are fully picked AND ALL transfer cartons are sealed
if (fullyPickedItems === totalItems && totalItems > 0 && sealedTCs === totalTCs && totalTCs > 0) {
  newStatus = 'Picked';
} else if (partiallyPickedItems > 0 && currentStatus === 'Submitted') {
  newStatus = 'In Progress';
}
```

### 2. `pickMaterialRequestItems` Function
**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Before:**
- Status was set to "Picked" when all items were fully picked, regardless of transfer carton sealing status.

**After:**
- Checks if all items are fully picked
- Checks if all transfer cartons are sealed
- Only sets status to "Picked" when BOTH conditions are met
- If all items are picked but not all sealed, keeps status as "In Progress"

**Logic:**
```javascript
// Check if all transfer cartons are sealed
const [tcStatus] = await connection.execute(`
  SELECT 
    COUNT(*) as total_tcs,
    SUM(CASE WHEN status = 'Sealed' OR status = 'Dispatched' THEN 1 ELSE 0 END) as sealed_tcs
  FROM tabTransferCarton
  WHERE transfer_order = ? OR to_no = ?
`, [title, title]);

// Status "Picked" only when ALL items are fully picked AND ALL transfer cartons are sealed
if (fullyPickedItems === totalItems && totalItems > 0 && sealedTCs === totalTCs && totalTCs > 0) {
  newStatus = 'Picked';
} else if (fullyPickedItems === totalItems && totalItems > 0 && (sealedTCs < totalTCs || totalTCs === 0)) {
  // All items are picked but not all sealed - keep as "In Progress"
  newStatus = 'In Progress';
}
```

### 3. `getMaterialRequests` Function
**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Before:**
- Status was computed from item-level status only.

**After:**
- Checks if all transfer cartons are sealed
- Only sets status to "Picked" when all items are picked AND all transfer cartons are sealed
- Corrects status from "Picked" to "In Progress" if all items are picked but not all sealed

### 4. `getMaterialRequestByTitle` Function
**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Before:**
- Status was computed from item-level status only.

**After:**
- Checks if all transfer cartons are sealed
- Only sets status to "Picked" when all items are picked AND all transfer cartons are sealed
- Corrects status from "Picked" to "In Progress" if all items are picked but not all sealed

## Status Flow

### Scenario 1: Items Picked, Transfer Cartons Not All Sealed
- **Items:** All items fully picked (5/5)
- **Transfer Cartons:** 2 created, 1 sealed, 1 not sealed
- **Status:** "In Progress" (NOT "Picked")

### Scenario 2: Items Picked, All Transfer Cartons Sealed
- **Items:** All items fully picked (5/5)
- **Transfer Cartons:** 2 created, 2 sealed
- **Status:** "Picked" ✅

### Scenario 3: Partial Pick, Transfer Cartons Sealed
- **Items:** 3/5 items fully picked
- **Transfer Cartons:** 2 created, 2 sealed
- **Status:** "In Progress" (NOT "Picked")

### Scenario 4: Seal Transfer Carton During Picking
- **Items:** 2/5 items fully picked
- **Transfer Carton:** 1 sealed
- **Status:** "In Progress" (remains "In Progress", does NOT change to "Picked")

## Testing

### Test Case 1: Seal Transfer Carton - All Items Picked, All TCs Sealed
1. Pick all items for Material Request
2. Create and seal all transfer cartons
3. **Expected:** Status = "Picked"

### Test Case 2: Seal Transfer Carton - All Items Picked, Not All TCs Sealed
1. Pick all items for Material Request
2. Create 2 transfer cartons, seal only 1
3. **Expected:** Status = "In Progress" (NOT "Picked")

### Test Case 3: Seal Transfer Carton - Partial Pick
1. Pick 3/5 items for Material Request
2. Seal 1 transfer carton
3. **Expected:** Status = "In Progress"

### Test Case 4: Pick Items - All Picked, Not All Sealed
1. Pick all items for Material Request
2. Create transfer cartons but don't seal all
3. **Expected:** Status = "In Progress" (NOT "Picked")

### Test Case 5: Pick Items - All Picked, All Sealed
1. Pick all items for Material Request
2. Create and seal all transfer cartons
3. **Expected:** Status = "Picked"

## API Behavior

### POST /api/transfer-cartons/seal
- Seals transfer carton
- Checks if all items are picked AND all transfer cartons are sealed
- Updates Material Request status to "Picked" only if both conditions are met
- Updates status to "In Progress" if some items are picked (and status was "Submitted")

### POST /api/material-requests/:title/pick-items
- Updates picked quantities
- Checks if all items are picked AND all transfer cartons are sealed
- Updates Material Request status to "Picked" only if both conditions are met
- Keeps status as "In Progress" if all items are picked but not all sealed

### GET /api/material-requests
- Computes status from item-level data AND transfer carton sealing status
- Corrects status if all items are picked but not all sealed (changes "Picked" to "In Progress")

### GET /api/material-requests/:title
- Computes status from item-level data AND transfer carton sealing status
- Corrects status if all items are picked but not all sealed (changes "Picked" to "In Progress")

## Next Steps

1. **Restart API Server** to load changes
2. **Test Scenarios:**
   - Pick all items, seal all transfer cartons → Status should be "Picked"
   - Pick all items, seal only some transfer cartons → Status should be "In Progress"
   - Pick some items, seal transfer cartons → Status should be "In Progress"
3. **Monitor Logs:**
   - Check for status update messages
   - Verify status corrections when all items are picked but not all sealed

