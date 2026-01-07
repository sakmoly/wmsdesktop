# Material Request Item-Level Status Management

## Problem
1. Material Request header status changes to "Picked" when one carton/item is sealed
2. Status should be tracked at item level, not changed when one item/carton completes
3. `picked_qty` not updating correctly at item level

## Solution: Item-Level Status Tracking

### Key Changes:
1. **Status is tracked at item level** - Each item has its own status (Pending, In Progress, Picked)
2. **Header status computed from items** - Material Request header status is derived from all item statuses
3. **Header status "Picked" only when ALL items are fully picked** - Not when one carton/item is sealed
4. **No automatic status change on seal** - Transfer carton seal does NOT change Material Request status

## Item-Level Status

Each Material Request item has a status computed from `picked_qty`:
- **Pending**: `picked_qty = 0`
- **In Progress**: `picked_qty > 0` but `picked_qty < requested_qty`
- **Picked**: `picked_qty >= requested_qty`

## Header Status Computation

Material Request header status is computed from item-level statuses:
- **Submitted** → **In Progress**: When any item starts being picked (`picked_qty > 0`)
- **In Progress** → **Picked**: Only when ALL items have status "Picked" (`picked_qty >= requested_qty` for ALL items)
- **In Progress**: Remains when some items are picked but not all

## Implementation Details

### 1. GET Endpoints (List & Detail)

**Item-Level Status in Response:**
```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 20.00,
      "picked_qty": 20.00,
      "pending_qty": 0.00,
      "status": "Picked"  // Item-level status
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.00,
      "picked_qty": 5.00,
      "pending_qty": 15.00,
      "status": "In Progress"  // Item-level status
    }
  ]
}
```

**Header Status Computation:**
- Calculates item-level status for each item
- Computes header status from item statuses:
  - If ALL items are "Picked" → Header status = "Picked"
  - If some items are "In Progress" → Header status = "In Progress"
  - If no items are picked → Header status = "Submitted" or "In Progress"

### 2. Pick Items Endpoint

**Status Updates:**
- Updates `picked_qty` for each item (incremental)
- Recalculates `total_picked_qty` from items
- Computes header status from all items:
  - If ALL items fully picked → Status = "Picked"
  - If some items picked → Status = "In Progress"
  - Does NOT set status to "Picked" when one item is completed

### 3. Transfer Carton Seal

**NO Status Update:**
- Transfer carton seal does NOT change Material Request status
- Status remains computed from item-level data
- Individual carton/item completion does NOT trigger header status change

## Workflow Example

### Step 1: Material Request Created
- Header Status: **Submitted**
- Item 1: `picked_qty = 0`, Status: **Pending**
- Item 2: `picked_qty = 0`, Status: **Pending**
- Item 3: `picked_qty = 0`, Status: **Pending**

### Step 2: First Item Scanned (Item 1: 20/20)
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
- Header Status: **In Progress** (picking started)
- Item 1: `picked_qty = 20`, Status: **Picked** ✅
- Item 2: `picked_qty = 0`, Status: **Pending**
- Item 3: `picked_qty = 0`, Status: **Pending**

### Step 3: Transfer Carton Sealed (Item 1)
```
POST /api/transfer-cartons/seal
{
  "tc_id": "TC-MR-0001-001",
  "sealed_by": "USER-001"
}
```
- Header Status: **In Progress** (NO CHANGE - item-level status tracking)
- Item 1: `picked_qty = 20`, Status: **Picked**
- Item 2: `picked_qty = 0`, Status: **Pending**
- Item 3: `picked_qty = 0`, Status: **Pending**

### Step 4: Second Item Scanned (Item 2: 20/20)
- Header Status: **In Progress** (still - not all items picked)
- Item 1: `picked_qty = 20`, Status: **Picked**
- Item 2: `picked_qty = 20`, Status: **Picked** ✅
- Item 3: `picked_qty = 0`, Status: **Pending**

### Step 5: Third Item Scanned (Item 3: 20/20)
- Header Status: **Picked** ✅ (ALL items fully picked)
- Item 1: `picked_qty = 20`, Status: **Picked**
- Item 2: `picked_qty = 20`, Status: **Picked**
- Item 3: `picked_qty = 20`, Status: **Picked** ✅

## API Response Examples

### GET Material Request (with item-level status)
```json
{
  "title": "MR-0001",
  "status": "In Progress",
  "total_requested_qty": 60.00,
  "total_picked_qty": 40.00,
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 20.00,
      "picked_qty": 20.00,
      "pending_qty": 0.00,
      "status": "Picked"
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.00,
      "picked_qty": 20.00,
      "pending_qty": 0.00,
      "status": "Picked"
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "requested_qty": 20.00,
      "picked_qty": 0.00,
      "pending_qty": 20.00,
      "status": "Pending"
    }
  ]
}
```

## Database Updates

### tabMaterialRequestItem
- `picked_qty` updated incrementally as items are scanned
- Status is computed (not stored) from `picked_qty`:
  - `picked_qty = 0` → Status: "Pending"
  - `0 < picked_qty < requested_qty` → Status: "In Progress"
  - `picked_qty >= requested_qty` → Status: "Picked"

### tabMaterialRequest
- `total_picked_qty` recalculated from sum of all item `picked_qty`
- `status` computed from item-level statuses:
  - All items "Picked" → Status: "Picked"
  - Some items "In Progress" → Status: "In Progress"
  - No items picked → Status: "Submitted" or "In Progress"

## Important Notes

1. **Item-level status is computed, not stored** - Derived from `picked_qty` vs `requested_qty`
2. **Header status computed from items** - Not changed when one carton is sealed
3. **Status "Picked" requires ALL items fully picked** - Not when one item/carton completes
4. **Transfer carton seal does NOT change status** - Status remains item-level tracked
5. **picked_qty is incremental** - Each pick adds to existing `picked_qty`

## Files Modified

1. ✅ `wms-api/src/modules/material-request/materialRequestController.js`
   - Added item-level status computation in GET endpoints
   - Updated pick-items endpoint to compute header status from all items
   - Header status "Picked" only when ALL items fully picked

2. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - Removed logic that updates Material Request status on seal
   - Status remains computed from item-level data

## Verification Queries

### Check Item-Level Status
```sql
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  (requested_qty - picked_qty) as pending_qty,
  CASE 
    WHEN picked_qty >= requested_qty THEN 'Picked'
    WHEN picked_qty > 0 THEN 'In Progress'
    ELSE 'Pending'
  END as item_status
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0001'
ORDER BY item_code;
```

### Check Header Status Computation
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

