# Transfer In Item Status Implementation

## Summary

Added `status` column to `tabTransferInItem` table to track the picking/receiving status of individual Transfer In items. Status is set to "Picking" when receiving starts and "Received" when picking is complete or carton is closed.

## Database Schema

### Migration Script

**File**: `wms-api/add-status-column-to-transfer-in-item.js`

**Run Migration**:
```bash
cd wms-api
node add-status-column-to-transfer-in-item.js
```

**SQL Changes**:
```sql
ALTER TABLE tabTransferInItem
ADD COLUMN status VARCHAR(50) DEFAULT 'Pending' AFTER received_qty,
ADD INDEX idx_status (status);
```

### Updated Table Schema

```sql
CREATE TABLE tabTransferInItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  carton_id VARCHAR(100) NULL,
  received_qty DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Pending',  -- ✅ NEW COLUMN
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_status (status),  -- ✅ NEW INDEX
  FOREIGN KEY (parent_title) REFERENCES tabTransferIn(title) ON DELETE CASCADE
);
```

## Status Values

### Item-Level Status:

- **Pending**: `received_qty = 0` (not yet started receiving)
- **Picking**: `0 < received_qty < qty` (currently being picked/received)
- **Received**: `received_qty >= qty` (fully received, picking complete)

### Status Computation Logic:

```javascript
function computeTransferInItemStatus(receivedQty, expectedQty) {
  if (receivedQty >= expectedQty && expectedQty > 0) {
    return 'Received';
  } else if (receivedQty > 0) {
    return 'Picking';
  } else {
    return 'Pending';
  }
}
```

## Implementation Details

### 1. GET Endpoints

**Files**: 
- `wms-api/src/modules/transfer-in/transferInController.js`
- `getTransferIns()` - Line ~89-104
- `getTransferInByTitle()` - Line ~188-203

**Changes**:
- ✅ SELECT query includes `status` field
- ✅ Returns `status` in API response
- ✅ Computes status if not present (backward compatibility)

**API Response**:
```json
{
  "title": "INSLIP-123465",
  "status": "Received",
  "items": [
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 2.00,
      "received_qty": 2.00,
      "carton_id": "CTN-555445",
      "status": "Received"  // ✅ NEW FIELD
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 4.00,
      "received_qty": 2.00,
      "carton_id": "CTN-555445",
      "status": "Picking"  // ✅ NEW FIELD - partially received
    }
  ]
}
```

### 2. CREATE Transfer In

**File**: `wms-api/src/modules/transfer-in/transferInController.js`
**Function**: `createTransferIn()` - Line ~374-390

**Changes**:
- ✅ INSERT statements include `status` field (default: 'Pending')
- ✅ Checks if status column exists before including it

### 3. Receive-Line API

**File**: `wms-api/src/modules/transfer-in/transferInController.js`
**Function**: `receiveTransferInLine()` - Line ~600-680

**Changes**:
- ✅ Updates `status` when `received_qty` changes
- ✅ Sets status to "Picking" when receiving starts (`received_qty > 0`)
- ✅ Sets status to "Received" when fully received (`received_qty >= qty`)
- ✅ Works for both cartonized and loose items

**Status Updates**:
- When receiving by carton: Sets status for all items in carton
- When receiving loose items: Sets status for individual item
- Status automatically computed based on `received_qty` vs `qty`

### 4. Event Processing

**File**: `wms-api/src/modules/events/eventController.js`
**Function**: `processTransferInReceiveEvent()` - Line ~1513-1565

**Changes**:
- ✅ Updates `status` when `received_qty` is updated via events
- ✅ Computes status based on `received_qty` vs `qty`
- ✅ Sets status to "Picking" or "Received" as appropriate

## Status Flow

### Normal Flow:

1. **Item Created**: Status = `Pending` (received_qty = 0)
2. **Receiving Starts**: Status = `Picking` (0 < received_qty < qty)
3. **Fully Received**: Status = `Received` (received_qty >= qty)

### Example Timeline:

```
Time 0:  Item created
         received_qty = 0, status = "Pending"

Time 1:  User starts receiving (scans carton or item)
         received_qty = 2, qty = 4
         status = "Picking" ✅

Time 2:  User continues receiving
         received_qty = 3, qty = 4
         status = "Picking" ✅

Time 3:  User completes receiving (carton closed or all items received)
         received_qty = 4, qty = 4
         status = "Received" ✅
```

## API Response Examples

### GET /api/transfer-in/:title

```json
{
  "title": "INSLIP-123465",
  "status": "Received",
  "items": [
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 2.00,
      "received_qty": 2.00,
      "carton_id": "CTN-555445",
      "status": "Received"
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 4.00,
      "received_qty": 2.00,
      "carton_id": "CTN-555445",
      "status": "Picking"
    },
    {
      "item_code": "SKU-JACKET-201-BLK-M",
      "qty": 2.00,
      "received_qty": 0.00,
      "carton_id": null,
      "status": "Pending"
    }
  ]
}
```

## Backend Code Changes

### Files Modified:

1. **wms-api/src/modules/transfer-in/transferInController.js**
   - Added `computeTransferInItemStatus()` helper function
   - Updated `getTransferIns()` to include status
   - Updated `getTransferInByTitle()` to include status
   - Updated `createTransferIn()` to set status = 'Pending'
   - Updated `receiveTransferInLine()` to update status

2. **wms-api/src/modules/events/eventController.js**
   - Updated `processTransferInReceiveEvent()` to update status

3. **wms-api/add-status-column-to-transfer-in-item.js** (NEW)
   - Migration script to add status column

## Migration Steps

### 1. Run Migration Script

```bash
cd wms-api
node add-status-column-to-transfer-in-item.js
```

This will:
- ✅ Add `status` column to `tabTransferInItem`
- ✅ Set default value to 'Pending'
- ✅ Add index on `status` column
- ✅ Update existing records based on `received_qty`:
  - `received_qty = 0` → Status: 'Pending'
  - `0 < received_qty < qty` → Status: 'Picking'
  - `received_qty >= qty` → Status: 'Received'

### 2. Restart API Server

```bash
pm2 restart wms-api
# or
npm start
```

## Testing

### Test 1: Create Transfer In

1. Create Transfer In with items
2. Verify all items have `status = "Pending"`

### Test 2: Start Receiving

1. Receive items by carton or individually
2. Verify items have `status = "Picking"` when `0 < received_qty < qty`
3. Verify items have `status = "Received"` when `received_qty >= qty`

### Test 3: Check API Response

1. Call `GET /api/transfer-in/:title`
2. Verify `status` field is present in item objects
3. Verify status values are correct based on `received_qty`

## Status Behavior

### When Receiving by Carton:

- All items in carton are updated to `status = "Received"` (since `received_qty = qty` for all items)

### When Receiving Loose Items:

- Item status changes to `"Picking"` when first received (`received_qty > 0`)
- Item status changes to `"Received"` when fully received (`received_qty >= qty`)

### When Updating Quantity via Events:

- Status automatically updates based on new `received_qty`
- If `received_qty` increases but still < qty → Status = "Picking"
- If `received_qty` >= qty → Status = "Received"
- If `received_qty` decreases → Status may change from "Received" to "Picking"

## Notes

- Status is **automatically computed and updated** - no manual status updates needed
- Status is **derived from `received_qty` vs `qty`** - always accurate
- Backward compatible - if status column doesn't exist, status is computed on-the-fly
- Status updates happen in the same transaction as `received_qty` updates

## Mobile App Impact

**No changes required** - Status is automatically included in API responses. Mobile app can display status to show picking progress:

- **Pending**: Item not yet started
- **Picking**: Item currently being received (partially received)
- **Received**: Item fully received (ready for putaway)
