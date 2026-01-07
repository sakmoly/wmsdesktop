# Material Request Item Status Field Implementation

## Summary

Added `status` column to `tabMaterialRequestItem` table and updated all code to use the status field from the database instead of computing it on-the-fly.

## Changes Made

### 1. Database Schema

**Added `status` column to `tabMaterialRequestItem`:**
```sql
ALTER TABLE tabMaterialRequestItem
ADD COLUMN status VARCHAR(50) DEFAULT 'Pending' AFTER picked_qty,
ADD INDEX idx_status (status);
```

**Updated table creation scripts:**
- `wms-api/create-material-request-tables.js`
- `wms-api/run-material-request-mock-data.js`
- `wms-api/run-material-request-mock-data-with-items.js`

### 2. Migration Script

Created `wms-api/add-status-column-to-material-request-item.js` to:
- Add `status` column to existing tables
- Update existing records based on `picked_qty`:
  - `picked_qty >= requested_qty` → Status: 'Picked'
  - `picked_qty > 0` → Status: 'In Progress'
  - `picked_qty = 0` → Status: 'Pending'

### 3. API Code Updates

#### GET Endpoints (`getMaterialRequests` and `getMaterialRequestByTitle`)
- ✅ Updated SELECT query to include `status` field
- ✅ Use `status` from database instead of computing it
- ✅ Return `status` in API response

#### PICK Items Endpoint (`pickMaterialRequestItems`)
- ✅ Compute status based on `picked_qty` vs `requested_qty`
- ✅ Update both `picked_qty` and `status` in database
- ✅ Status values: 'Pending', 'In Progress', 'Picked'

#### Event Handler (`processMaterialRequestPicking`)
- ✅ Compute status based on `picked_qty` vs `requested_qty`
- ✅ Update both `picked_qty` and `status` in database

#### CREATE Material Request (`createMaterialRequest`)
- ✅ INSERT statements include `status` field (default: 'Pending')

#### Excel Import Service (`ExcelImportService.cs`)
- ✅ INSERT statements include `status` field (default: 'Pending')

## Status Values

### Item-Level Status:
- **Pending**: `picked_qty = 0`
- **In Progress**: `0 < picked_qty < requested_qty`
- **Picked**: `picked_qty >= requested_qty`

### Status Computation Logic:
```javascript
let itemStatus = 'Pending';
if (newPickedQty >= requestedQty && requestedQty > 0) {
  itemStatus = 'Picked';
} else if (newPickedQty > 0) {
  itemStatus = 'In Progress';
}
```

## Database Schema

### tabMaterialRequestItem
```sql
CREATE TABLE tabMaterialRequestItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  requested_qty DECIMAL(10,2) NOT NULL,
  picked_qty DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Pending',  -- ✅ NEW COLUMN
  pending_qty DECIMAL(10,2) AS (requested_qty - picked_qty) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_status (status),  -- ✅ NEW INDEX
  FOREIGN KEY (parent_title) REFERENCES tabMaterialRequest(title) ON DELETE CASCADE
);
```

## API Response

### GET Material Request
```json
{
  "title": "MR-0001",
  "status": "In Progress",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 20.00,
      "picked_qty": 20.00,
      "pending_qty": 0.00,
      "status": "Picked"  // ✅ From database
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.00,
      "picked_qty": 5.00,
      "pending_qty": 15.00,
      "status": "In Progress"  // ✅ From database
    }
  ]
}
```

## Usage Instructions

### 1. Run Migration Script
```bash
cd wms-api
node add-status-column-to-material-request-item.js
```

This will:
- Add `status` column to `tabMaterialRequestItem`
- Update existing records based on `picked_qty`
- Add index on `status` column

### 2. Restart API Server
```bash
pm2 restart wms-api
# or
npm start
```

### 3. Verify Status Updates
When items are picked, the `status` field is automatically updated:
- `picked_qty` changes → `status` is computed and updated
- Status is stored in database
- Status is returned in API responses

## Files Modified

1. ✅ `wms-api/add-status-column-to-material-request-item.js` (NEW)
2. ✅ `wms-api/src/modules/material-request/materialRequestController.js`
   - GET endpoints: Read status from database
   - PICK endpoint: Update status field
   - CREATE endpoint: Include status in INSERT
3. ✅ `wms-api/src/modules/events/eventController.js`
   - Event handler: Update status field
4. ✅ `wms-api/create-material-request-tables.js`
   - Table creation: Include status column
5. ✅ `wms-api/run-material-request-mock-data.js`
   - Table creation: Include status column
6. ✅ `wms-api/run-material-request-mock-data-with-items.js`
   - Table creation: Include status column
   - INSERT statements: Include status field
7. ✅ `Services/ExcelImportService.cs`
   - INSERT statements: Include status field

## Benefits

1. **Status is stored in database** - Can be queried and indexed
2. **Better performance** - No need to compute status on every query
3. **Query capabilities** - Can filter/sort by status
4. **Data consistency** - Status is explicitly stored and maintained

## Next Steps

1. Run migration script to add column to existing database
2. Restart API server
3. Test picking items - status should update correctly
4. Verify status is stored and returned in API responses
