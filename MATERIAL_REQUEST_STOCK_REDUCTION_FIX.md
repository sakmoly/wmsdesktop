# Material Request Stock Reduction Fix

## Problem
Material Request items are scanned and updated in the backend, but stock is not being reduced from the warehouse locations.

## Root Cause
When Material Request items are picked/scanned, the system updates `tabMaterialRequestItem.picked_qty` but does not reduce stock from `tabStockLedger`.

## Solution Implemented

### 1. New API Endpoint: `POST /api/material-requests/:title/pick-items`

**Purpose:** Dedicated endpoint for Material Request picking that updates picked quantities AND reduces stock.

**Request Body:**
```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "picked_qty": 20.00,
      "source_bin": "A1-R01-L1-B1"  // location_id where item was picked from
    }
  ],
  "warehouse": "WH-MAIN"  // Optional, defaults to from_warehouse
}
```

**What it does:**
1. ✅ Updates `tabMaterialRequestItem.picked_qty` for each item
2. ✅ Updates `tabMaterialRequest.total_picked_qty`
3. ✅ **Reduces stock from source bin** in `tabStockLedger`
4. ✅ Creates stock transaction log entry
5. ✅ Updates `tabItem.stock_qty` (aggregated total)
6. ✅ Updates Material Request status (In Progress → Picked)

### 2. Enhanced Event Handler for Material Request Picking

**Location:** `wms-api/src/modules/events/eventController.js`

**What it does:**
- Detects Material Request picking when `transfer_order` starts with "MR-"
- Automatically reduces stock when items are packed to Transfer Cartons
- Supports `location_id`, `rack`/`bin`, or `source_bin` fields

**Event Types Handled:**
- `PACK_BOX_TO_TC` - When boxes are packed to Transfer Carton
- `SORT_TO_BOX` - When items are sorted to boxes

**Stock Reduction Logic:**
- Gets current stock from `tabStockLedger` for `item_code` + `warehouse` + `source_bin`
- Validates sufficient stock available
- Decreases stock: `newQty = currentQty - pickedQty`
- Updates `tabStockLedger` with new quantity
- Creates `tabStockTransaction` log entry
- Updates `tabItem.stock_qty` to match ledger total

## Usage

### Option 1: Direct API Call (Recommended for Mobile App)

```javascript
// Mobile app calls this endpoint when items are picked
POST /api/material-requests/MR-0001/pick-items
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "picked_qty": 20.00,
      "source_bin": "A1-R01-L1-B1"
    },
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 15.00,
      "source_bin": "A1-R01-L2-B1"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Material Request items picked successfully",
  "data": {
    "material_request": "MR-0001",
    "status": "In Progress",
    "total_picked_qty": 35.00,
    "items_picked": 2,
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "source_bin": "A1-R01-L1-B1",
        "qty_reduced": 20.00,
        "qty_before": 165.00,
        "qty_after": 145.00
      }
    ]
  }
}
```

### Option 2: Through Events (Automatic)

When mobile app sends events with `transfer_order = "MR-0001"`:

```json
{
  "events": [
    {
      "event_type": "PACK_BOX_TO_TC",
      "transfer_order": "MR-0001",
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 20.00,
      "rack": "Rack 01",
      "bin": "B1",
      "location_id": "A1-R01-L1-B1",  // Preferred
      "tc_id": "TC-MR-0001-001"
    }
  ]
}
```

The event handler will automatically:
- Detect Material Request (transfer_order starts with "MR-")
- Update Material Request picked_qty
- Reduce stock from source bin
- Update stock ledger and transaction log

## Stock Reduction Details

### What Gets Updated:

1. **tabStockLedger:**
   - `qty` decreased by picked quantity
   - `last_transaction_type` = "Picking"
   - `last_transaction_ref` = Material Request number (e.g., "MR-0001")

2. **tabStockTransaction:**
   - New entry with `transaction_type` = "Picking"
   - `reference_doc_type` = "Material Request"
   - `qty_change` = negative (e.g., -20.00)
   - `qty_before` and `qty_after` recorded

3. **tabItem:**
   - `stock_qty` updated to sum of all locations
   - `updated_at` timestamp updated

4. **tabMaterialRequestItem:**
   - `picked_qty` increased by picked quantity
   - `updated_at` timestamp updated

5. **tabMaterialRequest:**
   - `total_picked_qty` updated
   - `status` updated (Submitted → In Progress → Picked)

## Validation

- ✅ Prevents picking more than requested quantity
- ✅ Validates sufficient stock available at source bin
- ✅ Prevents negative stock (except for cycle count)
- ✅ Updates status automatically when all items are picked

## Testing

To test stock reduction:

1. **Check current stock:**
   ```sql
   SELECT item_code, bin_location, qty 
   FROM tabStockLedger 
   WHERE item_code = 'SKU-HAT-301-GRN-OS' 
     AND warehouse = 'WH-MAIN';
   ```

2. **Pick items via API:**
   ```bash
   POST /api/material-requests/MR-0001/pick-items
   ```

3. **Verify stock reduced:**
   ```sql
   SELECT item_code, bin_location, qty 
   FROM tabStockLedger 
   WHERE item_code = 'SKU-HAT-301-GRN-OS' 
     AND warehouse = 'WH-MAIN';
   ```

4. **Check stock transaction log:**
   ```sql
   SELECT * FROM tabStockTransaction 
   WHERE reference_doc = 'MR-0001' 
   ORDER BY transaction_date DESC;
   ```

## Files Modified

1. ✅ `wms-api/src/modules/material-request/materialRequestController.js`
   - Added `pickMaterialRequestItems` function

2. ✅ `wms-api/src/routes/materialRequestRoutes.js`
   - Added route: `POST /api/material-requests/:title/pick-items`

3. ✅ `wms-api/src/modules/events/eventController.js`
   - Added Material Request detection in event handler
   - Added `processMaterialRequestPicking` function
   - Enhanced source_bin extraction from location_id, rack/bin

## Next Steps

1. **Mobile App Integration:**
   - Update mobile app to call `POST /api/material-requests/:title/pick-items` when items are scanned
   - Include `source_bin` (location_id) in the request
   - Or ensure events include `location_id` or `rack`/`bin` fields

2. **Verify Stock Reduction:**
   - Test picking items for Material Request
   - Verify stock is reduced in `tabStockLedger`
   - Verify `tabItem.stock_qty` is updated
   - Check stock transaction log

3. **Monitor:**
   - Check logs for stock reduction messages
   - Verify Material Request status updates correctly
   - Ensure no negative stock issues

## Important Notes

- Stock is reduced from the **source bin** (where items are picked from)
- Stock reduction happens **immediately** when items are picked
- Stock transaction log provides audit trail
- `tabItem.stock_qty` is automatically updated to match ledger total
- Material Request status updates automatically based on picking progress

