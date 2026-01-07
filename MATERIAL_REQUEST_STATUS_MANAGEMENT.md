# Material Request Status Management

## Problem
1. Picked quantities showing 0.00 even though items are scanned
2. Status shows "Picked" before all items are picked and transfer carton is sealed

## Solution: Line-Based Status Management

### Status Flow
```
Draft → Submitted → In Progress → Picked → Dispatched → Completed
```

### Key Rules:
1. **Status updates based on line items:**
   - Each item line has its own `picked_qty` that gets updated as items are scanned
   - Header status reflects the overall progress

2. **Status transitions:**
   - **Submitted** → **In Progress**: When any item starts being picked (`picked_qty > 0`)
   - **In Progress** → **Picked**: Only when:
     - ✅ All items are fully picked (`picked_qty >= requested_qty` for all items)
     - ✅ Transfer carton is sealed

3. **Status "Picked" is set ONLY when:**
   - All items have `picked_qty >= requested_qty`
   - Transfer carton status is "Sealed"

## Implementation Changes

### 1. Picking Endpoint (`POST /api/material-requests/:title/pick-items`)

**Before:**
- Set status to "Picked" when all items are picked

**After:**
- Only sets status to "In Progress" when picking starts
- Does NOT set status to "Picked" (waiting for transfer carton seal)

### 2. Event Handler (`processMaterialRequestPicking`)

**Before:**
- Set status to "Picked" when all items are picked

**After:**
- Only sets status to "In Progress" when picking starts
- Does NOT set status to "Picked" (waiting for transfer carton seal)

### 3. Transfer Carton Seal (`POST /api/transfer-cartons/seal`)

**New Logic:**
- When transfer carton is sealed, check if it's a Material Request
- If Material Request:
  - Check if all items are fully picked
  - If yes, set Material Request status to "Picked"
  - If no, keep status as "In Progress"

## Workflow Example

### Step 1: Material Request Created
- Status: **Draft**
- All items: `picked_qty = 0`

### Step 2: Material Request Submitted
- Status: **Submitted**
- All items: `picked_qty = 0`

### Step 3: First Item Scanned
```
POST /api/material-requests/MR-0001/pick-items
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 20.00,
      "source_bin": "A1-R01-L1-B1"
    }
  ]
}
```
- Status: **In Progress** (updated from Submitted)
- Item 1: `picked_qty = 20.00`
- Items 2-5: `picked_qty = 0.00`

### Step 4: More Items Scanned
- Status: **In Progress** (remains)
- Items gradually get `picked_qty` updated

### Step 5: All Items Scanned
- Status: **In Progress** (still, waiting for seal)
- All items: `picked_qty >= requested_qty`

### Step 6: Transfer Carton Sealed
```
POST /api/transfer-cartons/seal
{
  "tc_id": "TC-MR-0001-001",
  "sealed_by": "USER-001"
}
```
- Transfer Carton status: **Sealed**
- Material Request status: **Picked** (updated because all items are picked AND carton is sealed)

## API Endpoints

### Pick Items
```
POST /api/material-requests/:title/pick-items
```
- Updates `picked_qty` for each item
- Updates `total_picked_qty` (recalculated from items)
- Reduces stock from source bins
- Updates status: Submitted → In Progress (if first pick)

### Seal Transfer Carton
```
POST /api/transfer-cartons/seal
```
- Seals transfer carton
- If Material Request and all items picked: Updates status to "Picked"

## Database Updates

### tabMaterialRequestItem
- `picked_qty` updated incrementally as items are scanned
- Each line item tracks its own picking progress

### tabMaterialRequest
- `total_picked_qty` recalculated from sum of all item `picked_qty`
- `status` updated based on:
  - Picking progress (Submitted → In Progress)
  - Transfer carton seal (In Progress → Picked)

## Verification Queries

### Check Material Request Status
```sql
SELECT 
  title,
  status,
  total_requested_qty,
  total_picked_qty,
  (SELECT COUNT(*) FROM tabMaterialRequestItem WHERE parent_title = tabMaterialRequest.title) as total_items,
  (SELECT COUNT(*) FROM tabMaterialRequestItem WHERE parent_title = tabMaterialRequest.title AND picked_qty >= requested_qty) as fully_picked_items
FROM tabMaterialRequest
WHERE title = 'MR-0001';
```

### Check Item Picking Progress
```sql
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  (requested_qty - picked_qty) as pending_qty,
  CASE 
    WHEN picked_qty >= requested_qty THEN 'Complete'
    WHEN picked_qty > 0 THEN 'In Progress'
    ELSE 'Pending'
  END as picking_status
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0001'
ORDER BY item_code;
```

### Check Transfer Carton Status
```sql
SELECT 
  tc_id,
  status,
  transfer_order,
  sealed_by,
  sealed_on
FROM tabTransferCarton
WHERE transfer_order = 'MR-0001';
```

## Important Notes

1. **Status "Picked" requires BOTH:**
   - All items fully picked
   - Transfer carton sealed

2. **total_picked_qty is recalculated:**
   - Always calculated from sum of item `picked_qty`
   - More accurate than incrementing

3. **Line items are the source of truth:**
   - Each item's `picked_qty` is updated individually
   - Header `total_picked_qty` is derived from items

4. **Stock reduction happens immediately:**
   - Stock is reduced when items are picked
   - Status update happens separately

## Files Modified

1. ✅ `wms-api/src/modules/material-request/materialRequestController.js`
   - Updated `pickMaterialRequestItems` to not set status to "Picked"
   - Recalculate `total_picked_qty` from items

2. ✅ `wms-api/src/modules/events/eventController.js`
   - Updated `processMaterialRequestPicking` to not set status to "Picked"
   - Recalculate `total_picked_qty` from items

3. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - Updated `sealTransferCarton` to check Material Request and set status to "Picked" when all items are picked

