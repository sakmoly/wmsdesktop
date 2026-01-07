# Material Request Item-Level Status: Computed, Not Stored

## Important Clarification

**There is NO `status` column in `tabMaterialRequestItem` table.**

Status is **computed on-the-fly** from `picked_qty` and `requested_qty` in the API response. This is the correct design because:

1. **Status is derived data** - It's computed from `picked_qty` vs `requested_qty`
2. **No redundancy** - Storing it would require keeping it in sync with `picked_qty`
3. **Always accurate** - Computed status is always correct, no risk of data inconsistency

## Database Schema

### tabMaterialRequestItem Table
```sql
CREATE TABLE tabMaterialRequestItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  requested_qty DECIMAL(10,2) NOT NULL,
  picked_qty DECIMAL(10,2) DEFAULT 0,          -- ✅ This is stored and updated
  pending_qty DECIMAL(10,2) AS (requested_qty - picked_qty) STORED,  -- Computed column
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- ❌ NO status column - status is computed in API
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabMaterialRequest(title) ON DELETE CASCADE
);
```

## Status Computation Logic

### Item-Level Status (Computed in API)

Status is computed in the API response based on `picked_qty` and `requested_qty`:

```javascript
// Status computation logic (in API response)
const requestedQty = parseFloat(item.requested_qty) || 0;
const pickedQty = parseFloat(item.picked_qty) || 0;

let itemStatus = 'Pending';
if (pickedQty >= requestedQty && requestedQty > 0) {
  itemStatus = 'Picked';      // Fully picked
} else if (pickedQty > 0) {
  itemStatus = 'In Progress'; // Partially picked
}
// else: itemStatus = 'Pending' (not picked)
```

### Status Rules:
- **Pending**: `picked_qty = 0`
- **In Progress**: `0 < picked_qty < requested_qty`
- **Picked**: `picked_qty >= requested_qty`

## How Status Works

### 1. Database Storage
- ✅ `picked_qty` is stored and updated in `tabMaterialRequestItem`
- ✅ `requested_qty` is stored in `tabMaterialRequestItem`
- ❌ `status` is NOT stored - it's computed

### 2. API Response
When you call GET endpoints, the API:
1. Reads `picked_qty` and `requested_qty` from database
2. Computes `status` on-the-fly
3. Returns status in JSON response

### 3. Status Updates
- **To update item status**: Update `picked_qty` (status is automatically computed)
- **Status changes automatically** when `picked_qty` changes
- No need to update status separately - it's derived from `picked_qty`

## API Response Example

```json
{
  "title": "MR-0001",
  "status": "In Progress",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 20.00,
      "picked_qty": 20.00,          // ✅ Stored in database
      "pending_qty": 0.00,           // ✅ Computed column in database
      "status": "Picked"             // ✅ Computed in API response
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.00,
      "picked_qty": 5.00,            // ✅ Stored in database
      "pending_qty": 15.00,          // ✅ Computed column in database
      "status": "In Progress"        // ✅ Computed in API response
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "requested_qty": 20.00,
      "picked_qty": 0.00,            // ✅ Stored in database
      "pending_qty": 20.00,          // ✅ Computed column in database
      "status": "Pending"            // ✅ Computed in API response
    }
  ]
}
```

## Updating Item Status

To update an item's status, you update `picked_qty`:

```javascript
// Update picked_qty (status is automatically computed)
POST /api/material-requests/MR-0001/pick-items
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 20.00,  // ✅ This updates the database
      "source_bin": "A1-R01-L1-B1"
    }
  ]
}
```

After this call:
- `picked_qty` in database: `0.00` → `20.00`
- Status in API response: `Pending` → `Picked` (automatically computed)

## Header Status Computation

Material Request header status is also computed from item-level statuses:

```javascript
// Header status computation
const allItemsPicked = items.every(item => item.status === 'Picked');
const someItemsPicked = items.some(item => item.picked_qty > 0);

if (allItemsPicked) {
  headerStatus = 'Picked';  // All items fully picked
} else if (someItemsPicked) {
  headerStatus = 'In Progress';  // Some items picked
} else {
  headerStatus = 'Submitted';  // No items picked
}
```

## Implementation Details

### GET Endpoints
- ✅ Read `picked_qty` and `requested_qty` from database
- ✅ Compute `status` for each item
- ✅ Return computed status in JSON response

### PICK Items Endpoint
- ✅ Updates `picked_qty` in database
- ✅ Status is automatically computed from new `picked_qty` value
- ✅ No need to update status separately

### Transfer Carton Seal
- ✅ Does NOT change Material Request status
- ✅ Status remains computed from item-level `picked_qty` values

## Why This Design?

### ✅ Advantages:
1. **No data redundancy** - Status is always derived from source data
2. **Always accurate** - No risk of status being out of sync with `picked_qty`
3. **Simpler updates** - Only need to update `picked_qty`, status follows automatically
4. **Less database storage** - No need to store redundant status field

### ❌ If We Stored Status:
1. **Data redundancy** - Status would duplicate information in `picked_qty`
2. **Sync issues** - Risk of status being out of sync with `picked_qty`
3. **Complex updates** - Need to update both `picked_qty` AND `status`
4. **More storage** - Extra column in database

## Summary

- **Status is computed, not stored**
- **To update status**: Update `picked_qty` (status is automatically computed)
- **Status is always accurate** - Derived from `picked_qty` vs `requested_qty`
- **No database column needed** - Status is computed in API response
- **This is the correct design** - No changes needed to database schema

