# Transfer In Putaway Process - Complete Guide

**Date**: 2026-01-20  
**Status**: ✅ **COMPLETE DOCUMENTATION**

---

## 🎯 Overview

This guide covers the complete Transfer In Putaway process, including all API endpoints, sample JSON requests/responses, and detailed stock update mechanism.

**Key Difference from ASN**: Transfer In items **always** go to Putaway (no sorting step).

---

## 📋 Transfer In Putaway Workflow

### Complete Flow Diagram

```
1. Transfer In Created
   ↓
2. Submit Transfer In
   POST /api/transfer-in/:title/submit
   ↓
3. Receive Items
   POST /api/transfer-in/:title/receive-line
   ↓
4. Complete Receiving (Optional)
   POST /api/transfer-in/:title/complete-receiving
   → Creates Putaway Task automatically
   ↓
5. Validate Carton (Optional)
   POST /api/transfer-in/:title/validate-carton
   → Returns box_id and putaway_task
   ↓
6. Scan Location for Putaway
   POST /api/putaway/scan-transfer-carton
   → Assigns location to putaway lines
   → Triggers stock updates automatically
   ↓
7. Stock Updated
   → tabStockLedger updated
   → tabTransactionHistory created
   → tabItem.stock_qty updated
```

---

## 🔌 API Endpoints

### 1. Create Transfer In

**Endpoint**: `POST /api/transfer-in`

**Purpose**: Create a new Transfer In document

**Request**:
```json
{
  "from_warehouse": "WH-SHOWROOM-01",
  "to_warehouse": "WH-MAIN",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2.0
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 2.0
    }
  ]
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Transfer In created successfully",
  "data": {
    "title": "INSLIP-123457",
    "status": "Draft",
    "from_warehouse": "WH-SHOWROOM-01",
    "to_warehouse": "WH-MAIN",
    "items_count": 2
  }
}
```

---

### 2. Submit Transfer In

**Endpoint**: `POST /api/transfer-in/:title/submit`

**Purpose**: Submit Transfer In (Draft → Submitted)

**Request**:
```
POST /api/transfer-in/INSLIP-123457/submit
```

**Response**:
```json
{
  "ok": true,
  "message": "Transfer In submitted successfully",
  "data": {
    "title": "INSLIP-123457",
    "status": "Submitted"
  }
}
```

---

### 3. Receive Item (Cartonized)

**Endpoint**: `POST /api/transfer-in/:title/receive-line`

**Purpose**: Receive items by carton (recommended for Transfer In)

**Request**:
```json
{
  "carton_id": "CTN-TI-123457-20260120-120530-456",
  "received_by": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Items received successfully",
  "data": {
    "transfer_in": "INSLIP-123457",
    "carton_id": "CTN-TI-123457-20260120-120530-456",
    "items_received": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "received_qty": 2.0,
        "status": "Received"
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "received_qty": 2.0,
        "status": "Received"
      }
    ],
    "transfer_in_status": "Received"
  }
}
```

**What Happens**:
- ✅ Updates `tabTransferInItem.received_qty` for all items in carton
- ✅ Updates `tabTransferInItem.status` to "Received"
- ✅ Updates `tabTransferIn.status` to "Received" (if all items received)
- ✅ **Auto-creates Putaway Task** if all items received and Transfer In is completed

---

### 4. Receive Item (Loose)

**Endpoint**: `POST /api/transfer-in/:title/receive-line`

**Purpose**: Receive individual items (loose, not in carton)

**Request**:
```json
{
  "item_code": "SKU-HAT-301-BLU-OS",
  "received_qty": 2.0,
  "received_by": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Item received successfully",
  "data": {
    "transfer_in": "INSLIP-123457",
    "item_code": "SKU-HAT-301-BLU-OS",
    "received_qty": 2.0,
    "status": "Received"
  }
}
```

---

### 5. Complete Receiving

**Endpoint**: `POST /api/transfer-in/:title/complete-receiving`

**Purpose**: Mark Transfer In as completed and create putaway task

**Request**:
```
POST /api/transfer-in/INSLIP-123457/complete-receiving
```

**Response**:
```json
{
  "ok": true,
  "message": "Transfer In receiving completed successfully",
  "data": {
    "transfer_in": "INSLIP-123457",
    "status": "Received",
    "putaway_task": "PUT-20260120-0001"
  }
}
```

**What Happens**:
- ✅ Marks Transfer In as completed (`is_completed = 1`)
- ✅ Updates status to "Received"
- ✅ **Creates Putaway Task** automatically
- ✅ Creates boxes in `tabSortBox` (if needed)
- ✅ Creates `tabPutawayLine` records for each item

---

### 6. Validate Carton

**Endpoint**: `POST /api/transfer-in/:title/validate-carton`

**Purpose**: Validate carton and get box_id/putaway_task for putaway

**Request**:
```json
{
  "carton_id": "CTN-TI-123457-20260120-120530-456"
}
```

**Response**:
```json
{
  "ok": true,
  "validated": {
    "carton_id": "CTN-TI-123457-20260120-120530-456",
    "box_id": "CTN-TI-123457-20260120-120530-456",
    "putaway_task": "PUT-20260120-0001",
    "ready_for_putaway": true
  },
  "message": "Carton validated successfully"
}
```

**What Happens**:
- ✅ Validates carton exists in `tabSortBox`
- ✅ Checks if putaway task exists
- ✅ **Auto-creates putaway task** if Transfer In is "Received" or "Receiving" and task doesn't exist
- ✅ Returns `box_id` (same as `carton_id` for Transfer In)
- ✅ Returns `putaway_task` title

---

### 7. Get Putaway Tasks

**Endpoint**: `GET /api/putaway/tasks`

**Purpose**: Get list of putaway tasks (filter by Transfer In)

**Request**:
```
GET /api/putaway/tasks?status=In Progress&source_type=TransferIn&transfer_in=INSLIP-123457
```

**Response**:
```json
{
  "ok": true,
  "tasks": [
    {
      "title": "PUT-20260120-0001",
      "status": "In Progress",
      "source_type": "TransferIn",
      "transfer_in": "INSLIP-123457",
      "warehouse": "WH-MAIN",
      "created_at": "2026-01-20T12:05:30.000Z",
      "items": [
        {
          "item_code": "SKU-HAT-301-BLU-OS",
          "qty": 2.0,
          "carton_id": "CTN-TI-123457-20260120-120530-456",
          "location_id": null,
          "rack": null,
          "bin": null
        },
        {
          "item_code": "SKU-HAT-301-GRN-OS",
          "qty": 2.0,
          "carton_id": "CTN-TI-123457-20260120-120530-456",
          "location_id": null,
          "rack": null,
          "bin": null
        }
      ]
    }
  ]
}
```

---

### 8. Scan Location for Putaway ⭐ **CRITICAL**

**Endpoint**: `POST /api/putaway/scan-transfer-carton`

**Purpose**: Assign location to putaway task and trigger stock updates

**Request** (using box_id):
```json
{
  "box_id": "CTN-TI-123457-20260120-120530-456",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-150526"
}
```

**Request** (using putaway_task):
```json
{
  "putaway_task": "PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Location ID 'A1-R02-L1-B2' assigned to all items in putaway task PUT-20260120-0001",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "location_id": "A1-R02-L1-B2",
    "rack": "A1-R02-L1",
    "bin": "B2",
    "items_count": 2,
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "carton_id": "CTN-TI-123457-20260120-120530-456",
        "qty": 2.0,
        "rack": "A1-R02-L1",
        "bin": "B2",
        "location_id": "A1-R02-L1-B2"
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "carton_id": "CTN-TI-123457-20260120-120530-456",
        "qty": 2.0,
        "rack": "A1-R02-L1",
        "bin": "B2",
        "location_id": "A1-R02-L1-B2"
      }
    ]
  }
}
```

**What Happens**:
1. ✅ Validates `box_id` exists in `tabSortBox` (for Transfer In, `box_id = carton_id`)
2. ✅ Validates `location_id` exists in `tabLocation`
3. ✅ Updates all `tabPutawayLine` records with `location_id`, `rack`, `bin`
4. ✅ **Automatically triggers stock updates** via `processPutawayCompletionEvent`
5. ✅ Updates `tabStockLedger` (MOVE pattern: decrease from staging, increase at target)
6. ✅ Creates `tabTransactionHistory` records
7. ✅ Updates `tabItem.stock_qty` (if stock posting enabled)

---

### 9. Manual Stock Update Trigger

**Endpoint**: `POST /api/putaway/trigger-stock-update`

**Purpose**: Manually trigger stock updates for putaway task (if location already assigned)

**Request**:
```json
{
  "putaway_task": "PUT-20260120-0001",
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Stock updates triggered for putaway task PUT-20260120-0001",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "warehouse": "WH-MAIN",
    "location_id": "A1-R02-L1-B2",
    "items_updated": 2
  }
}
```

---

## 📊 Stock Update Mechanism

### How Stock Updates Work

Stock updates are triggered automatically when location is scanned via `POST /api/putaway/scan-transfer-carton`.

**Same mechanism as ASN Putaway** - uses the exact same `processPutawayCompletionEvent()` function.

---

### Step-by-Step Stock Update Process

#### Step 1: Location Scan Triggers Stock Update

When `POST /api/putaway/scan-transfer-carton` is called:

1. **Updates Putaway Lines**:
   ```sql
   UPDATE tabPutawayLine
   SET location_id = 'A1-R02-L1-B2',
       rack = 'A1-R02-L1',
       bin = 'B2',
       updated_at = NOW()
   WHERE parent_title = 'PUT-20260120-0001'
   ```

2. **Calls `processPutawayCompletionEvent`**:
   ```javascript
   await processPutawayCompletionEvent(connection, {
     event_type: 'PUTAWAY_TO_RACK',
     putaway_task: 'PUT-20260120-0001',
     box_id: 'CTN-TI-123457-20260120-120530-456',
     carton_id: 'CTN-TI-123457-20260120-120530-456',
     location_id: 'A1-R02-L1-B2',
     rack: 'A1-R02-L1',
     bin: 'B2',
     user_id: 'USER-150526',
     store: 'WH-MAIN'  // From tabTransferIn.to_warehouse
   });
   ```

---

#### Step 2: Process Putaway Completion Event

**Function**: `processPutawayCompletionEvent()` in `wms-api/src/modules/events/eventController.js`

**What It Does**:

1. **Gets Warehouse from Transfer In**:
   ```sql
   SELECT to_warehouse, warehouse
   FROM tabTransferIn
   WHERE title = 'INSLIP-123457'
   ```
   **Uses**: `to_warehouse` (destination warehouse)

2. **Gets Putaway Lines**:
   ```sql
   SELECT item_code, qty, carton_id, location_id, rack, bin
   FROM tabPutawayLine
   WHERE parent_title = 'PUT-20260120-0001'
     AND item_code IS NOT NULL
     AND qty > 0
   ```

3. **For Each Line** (MOVE Pattern):

   **A. Determine FROM Location (Staging)**:
   ```javascript
   // Priority 1: Get from tabCartonStock
   // Priority 2: Get from tabCarton.current_bin_id
   // Priority 3: Default to staging location (STAGING-01 or similar)
   ```

   **B. Decrease Stock at FROM Location**:
   ```sql
   INSERT INTO tabStockLedger (
     item_code,
     warehouse,
     bin_location,
     qty,
     last_transaction_type,
     last_transaction_ref,
     updated_at
   ) VALUES (
     'SKU-HAT-301-BLU-OS',
     'WH-MAIN',
     'STAGING-01',  -- FROM location
     0,  -- Decrease to 0 (or reduce by qty)
     'Putaway',
     'PUT-20260120-0001',
     NOW()
   )
   ON DUPLICATE KEY UPDATE
     qty = qty - 2.0,  -- Decrease by item qty
     last_transaction_type = 'Putaway',
     last_transaction_ref = 'PUT-20260120-0001',
     updated_at = NOW()
   ```

   **C. Increase Stock at TO Location (Target)**:
   ```sql
   INSERT INTO tabStockLedger (
     item_code,
     warehouse,
     bin_location,
     qty,
     last_transaction_type,
     last_transaction_ref,
     updated_at
   ) VALUES (
     'SKU-HAT-301-BLU-OS',
     'WH-MAIN',
     'A1-R02-L1-B2',  -- TO location
     2.0,  -- Add item qty
     'Putaway',
     'PUT-20260120-0001',
     NOW()
   )
   ON DUPLICATE KEY UPDATE
     qty = qty + 2.0,  -- Increase by item qty
     last_transaction_type = 'Putaway',
     last_transaction_ref = 'PUT-20260120-0001',
     updated_at = NOW()
   ```

   **D. Create Transaction History**:
   ```sql
   INSERT INTO tabTransactionHistory (
     transaction_type,
     warehouse,
     bin_location,
     location_id,
     item_code,
     carton_id,
     qty_change,
     reference_doc,
     transaction_date
   ) VALUES (
     'Putaway',
     'WH-MAIN',
     'A1-R02-L1-B2',
     'A1-R02-L1-B2',
     'SKU-HAT-301-BLU-OS',
     'CTN-TI-123457-20260120-120530-456',
     2.0,  -- Positive for stock increase
     'PUT-20260120-0001',
     NOW()
   )
   ```

4. **Commit Transaction**:
   ```javascript
   await connection.commit();
   ```

---

### Stock Update Tables

#### 1. tabStockLedger

**Purpose**: Real-time stock quantities by location

**Key Fields**:
- `item_code`: Item SKU
- `warehouse`: Warehouse code (from `tabTransferIn.to_warehouse`)
- `bin_location`: Location ID (e.g., "A1-R02-L1-B2")
- `qty`: Current quantity at this location
- `last_transaction_type`: "Putaway"
- `last_transaction_ref`: Putaway task title

**Example After Putaway**:
```sql
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001';
```

**Result**:
```
item_code           | warehouse | bin_location  | qty | last_transaction_type | last_transaction_ref
--------------------|-----------|---------------|-----|----------------------|---------------------
SKU-HAT-301-BLU-OS  | WH-MAIN   | A1-R02-L1-B2  | 2.0 | Putaway              | PUT-20260120-0001
SKU-HAT-301-GRN-OS  | WH-MAIN   | A1-R02-L1-B2  | 2.0 | Putaway              | PUT-20260120-0001
```

---

#### 2. tabTransactionHistory

**Purpose**: Complete audit trail of all stock movements

**Key Fields**:
- `transaction_type`: "Putaway"
- `warehouse`: Warehouse code (from `tabTransferIn.to_warehouse`)
- `bin_location`: Location ID
- `location_id`: Location ID (same as bin_location)
- `item_code`: Item SKU
- `carton_id`: Carton ID
- `qty_change`: Quantity change (+2.0 for putaway)
- `reference_doc`: Putaway task title

**Example After Putaway**:
```sql
SELECT 
  transaction_type,
  warehouse,
  bin_location,
  item_code,
  qty_change,
  reference_doc,
  created_at
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260120-0001'
ORDER BY created_at DESC;
```

**Result**:
```
transaction_type | warehouse | bin_location  | item_code          | qty_change | reference_doc    | created_at
-----------------|-----------|---------------|-------------------|------------|------------------|-------------------
Putaway          | WH-MAIN   | A1-R02-L1-B2  | SKU-HAT-301-BLU-OS| 2.0        | PUT-20260120-0001| 2026-01-20 12:10:00
Putaway          | WH-MAIN   | A1-R02-L1-B2  | SKU-HAT-301-GRN-OS| 2.0        | PUT-20260120-0001| 2026-01-20 12:10:00
```

---

#### 3. tabItem.stock_qty

**Purpose**: Total stock quantity for item (sum of all locations)

**Updated By**: Stock posting service (optional, can be disabled)

**Query**:
```sql
SELECT 
  code,
  name,
  stock_qty
FROM tabItem
WHERE code = 'SKU-HAT-301-BLU-OS';
```

**Result**:
```
code              | name                    | stock_qty
------------------|-------------------------|----------
SKU-HAT-301-BLU-OS| Baseball Cap Blue One Size | 2.0
```

---

## 🔄 Complete Transfer In Putaway Example

### Scenario

**Transfer In**: `INSLIP-123457`  
**From Warehouse**: `WH-SHOWROOM-01`  
**To Warehouse**: `WH-MAIN`  
**Items**: 
- `SKU-HAT-301-BLU-OS` × 2
- `SKU-HAT-301-GRN-OS` × 2  
**Target Location**: `A1-R02-L1-B2`

---

### Step 1: Create Transfer In

**Request**:
```json
POST /api/transfer-in
{
  "from_warehouse": "WH-SHOWROOM-01",
  "to_warehouse": "WH-MAIN",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2.0
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 2.0
    }
  ]
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Transfer In created successfully",
  "data": {
    "title": "INSLIP-123457",
    "status": "Draft"
  }
}
```

---

### Step 2: Submit Transfer In

**Request**:
```
POST /api/transfer-in/INSLIP-123457/submit
```

**Response**:
```json
{
  "ok": true,
  "message": "Transfer In submitted successfully",
  "data": {
    "title": "INSLIP-123457",
    "status": "Submitted"
  }
}
```

---

### Step 3: Receive Items (Cartonized)

**Request**:
```json
POST /api/transfer-in/INSLIP-123457/receive-line
{
  "carton_id": "CTN-TI-123457-20260120-120530-456",
  "received_by": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Items received successfully",
  "data": {
    "transfer_in": "INSLIP-123457",
    "carton_id": "CTN-TI-123457-20260120-120530-456",
    "items_received": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "received_qty": 2.0,
        "status": "Received"
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "received_qty": 2.0,
        "status": "Received"
      }
    ],
    "transfer_in_status": "Received"
  }
}
```

**What Happens**:
- ✅ Updates `tabTransferInItem.received_qty` for all items in carton
- ✅ Updates `tabTransferInItem.status` to "Received"
- ✅ Updates `tabTransferIn.status` to "Received"
- ✅ **Auto-creates Putaway Task** if all items received and Transfer In is completed

**Database State After This Step**:
```sql
-- tabTransferIn
title: INSLIP-123457
status: Received
to_warehouse: WH-MAIN

-- tabTransferInItem (2 rows)
Row 1: item_code=SKU-HAT-301-BLU-OS, qty=2.0, received_qty=2.0, status=Received, carton_id=CTN-TI-123457-20260120-120530-456
Row 2: item_code=SKU-HAT-301-GRN-OS, qty=2.0, received_qty=2.0, status=Received, carton_id=CTN-TI-123457-20260120-120530-456

-- tabPutawayTask (auto-created)
title: PUT-20260120-0001
status: In Progress
source_type: TransferIn
transfer_in: INSLIP-123457
warehouse: WH-MAIN

-- tabPutawayLine (2 rows)
Row 1: item_code=SKU-HAT-301-BLU-OS, qty=2.0, carton_id=CTN-TI-123457-20260120-120530-456, location_id=NULL
Row 2: item_code=SKU-HAT-301-GRN-OS, qty=2.0, carton_id=CTN-TI-123457-20260120-120530-456, location_id=NULL
```

---

### Step 4: Validate Carton (Optional)

**Request**:
```json
POST /api/transfer-in/INSLIP-123457/validate-carton
{
  "carton_id": "CTN-TI-123457-20260120-120530-456"
}
```

**Response**:
```json
{
  "ok": true,
  "validated": {
    "carton_id": "CTN-TI-123457-20260120-120530-456",
    "box_id": "CTN-TI-123457-20260120-120530-456",
    "putaway_task": "PUT-20260120-0001",
    "ready_for_putaway": true
  },
  "message": "Carton validated successfully"
}
```

**Note**: For Transfer In, `box_id = carton_id` (same value).

---

### Step 5: Scan Location for Putaway ⭐ **STOCK UPDATE HAPPENS HERE**

**Request**:
```json
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-TI-123457-20260120-120530-456",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Location ID 'A1-R02-L1-B2' assigned to all items in putaway task PUT-20260120-0001",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "location_id": "A1-R02-L1-B2",
    "rack": "A1-R02-L1",
    "bin": "B2",
    "items_count": 2
  }
}
```

**What Happens Behind the Scenes**:

1. **Updates Putaway Lines**:
   ```sql
   UPDATE tabPutawayLine
   SET location_id = 'A1-R02-L1-B2',
       rack = 'A1-R02-L1',
       bin = 'B2',
       updated_at = NOW()
   WHERE parent_title = 'PUT-20260120-0001'
   ```

2. **Triggers Stock Update** (via `processPutawayCompletionEvent`):

   **A. Gets Warehouse from Transfer In**:
   ```sql
   SELECT to_warehouse, warehouse
   FROM tabTransferIn
   WHERE title = 'INSLIP-123457'
   ```
   **Result**: `to_warehouse = 'WH-MAIN'`

   **B. For Item 1 (SKU-HAT-301-BLU-OS)**:
   
   **Decrease from Staging**:
   ```sql
   INSERT INTO tabStockLedger (
     item_code, warehouse, bin_location, qty,
     last_transaction_type, last_transaction_ref
   ) VALUES (
     'SKU-HAT-301-BLU-OS', 'WH-MAIN', 'STAGING-01', 0,
     'Putaway', 'PUT-20260120-0001'
   )
   ON DUPLICATE KEY UPDATE
     qty = GREATEST(0, qty - 2.0),
     last_transaction_type = 'Putaway',
     last_transaction_ref = 'PUT-20260120-0001'
   ```
   
   **Increase at Target Location**:
   ```sql
   INSERT INTO tabStockLedger (
     item_code, warehouse, bin_location, qty,
     last_transaction_type, last_transaction_ref
   ) VALUES (
     'SKU-HAT-301-BLU-OS', 'WH-MAIN', 'A1-R02-L1-B2', 2.0,
     'Putaway', 'PUT-20260120-0001'
   )
   ON DUPLICATE KEY UPDATE
     qty = qty + 2.0,
     last_transaction_type = 'Putaway',
     last_transaction_ref = 'PUT-20260120-0001'
   ```
   
   **Create Transaction History**:
   ```sql
   INSERT INTO tabTransactionHistory (
     transaction_type, warehouse, bin_location, location_id,
     item_code, carton_id, qty_change, reference_doc
   ) VALUES (
     'Putaway', 'WH-MAIN', 'A1-R02-L1-B2', 'A1-R02-L1-B2',
     'SKU-HAT-301-BLU-OS', 'CTN-TI-123457-20260120-120530-456', 2.0, 'PUT-20260120-0001'
   )
   ```

   **For Item 2 (SKU-HAT-301-GRN-OS)**: Same process

3. **Commits Transaction**:
   ```javascript
   await connection.commit();
   ```

**Database State After This Step**:
```sql
-- tabPutawayLine (updated)
Row 1: item_code=SKU-HAT-301-BLU-OS, location_id=A1-R02-L1-B2, rack=A1-R02-L1, bin=B2
Row 2: item_code=SKU-HAT-301-GRN-OS, location_id=A1-R02-L1-B2, rack=A1-R02-L1, bin=B2

-- tabStockLedger (2 new rows at target location)
Row 1: item_code=SKU-HAT-301-BLU-OS, warehouse=WH-MAIN, bin_location=A1-R02-L1-B2, qty=2.0
Row 2: item_code=SKU-HAT-301-GRN-OS, warehouse=WH-MAIN, bin_location=A1-R02-L1-B2, qty=2.0

-- tabTransactionHistory (2 new rows)
Row 1: item_code=SKU-HAT-301-BLU-OS, qty_change=2.0, reference_doc=PUT-20260120-0001
Row 2: item_code=SKU-HAT-301-GRN-OS, qty_change=2.0, reference_doc=PUT-20260120-0001
```

---

## 📊 Stock Update Verification

### Verify Stock Ledger

```sql
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001'
ORDER BY item_code;
```

**Expected Result**:
```
item_code          | warehouse | bin_location  | qty | last_transaction_type | last_transaction_ref
-------------------|-----------|---------------|-----|----------------------|---------------------
SKU-HAT-301-BLU-OS | WH-MAIN   | A1-R02-L1-B2  | 2.0 | Putaway              | PUT-20260120-0001
SKU-HAT-301-GRN-OS | WH-MAIN   | A1-R02-L1-B2  | 2.0 | Putaway              | PUT-20260120-0001
```

---

### Verify Transaction History

```sql
SELECT 
  transaction_type,
  warehouse,
  bin_location,
  location_id,
  item_code,
  carton_id,
  qty_change,
  reference_doc,
  created_at
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260120-0001'
ORDER BY created_at DESC;
```

**Expected Result**:
```
transaction_type | warehouse | bin_location  | location_id  | item_code          | carton_id                              | qty_change | reference_doc    | created_at
------------------|-----------|---------------|--------------|-------------------|----------------------------------------|------------|------------------|-------------------
Putaway           | WH-MAIN   | A1-R02-L1-B2  | A1-R02-L1-B2 | SKU-HAT-301-BLU-OS| CTN-TI-123457-20260120-120530-456      | 2.0        | PUT-20260120-0001| 2026-01-20 12:10:00
Putaway           | WH-MAIN   | A1-R02-L1-B2  | A1-R02-L1-B2 | SKU-HAT-301-GRN-OS| CTN-TI-123457-20260120-120530-456      | 2.0        | PUT-20260120-0001| 2026-01-20 12:10:00
```

---

### Verify Item Stock Qty

```sql
SELECT 
  code,
  name,
  stock_qty
FROM tabItem
WHERE code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS');
```

**Expected Result**:
```
code              | name                    | stock_qty
------------------|-------------------------|----------
SKU-HAT-301-BLU-OS| Baseball Cap Blue One Size | 2.0
SKU-HAT-301-GRN-OS| Baseball Cap Green One Size| 2.0
```

---

## 🔑 Key Differences from ASN Putaway

### 1. Warehouse Source

**ASN Putaway**:
- Gets warehouse from `tabAdvanceShippingNotice.warehouse`

**Transfer In Putaway**:
- Gets warehouse from `tabTransferIn.to_warehouse` ✅
- **CRITICAL**: Uses `to_warehouse` (destination), not `warehouse` (source)

---

### 2. Box ID Format

**ASN Putaway**:
- Box ID: `PAW-ASN-*` or `BOX-WHMAIN-*` (from `tabSortBox`)

**Transfer In Putaway**:
- Box ID: `CTN-TI-*` (carton ID format: `CTN-TI-{transfer_in}-{date}-{time}-{random}`)
- **CRITICAL**: `box_id = carton_id` (same value)

---

### 3. Putaway Task Creation

**ASN Putaway**:
- Created after receiving (if no Transfer Order) OR after sorting (for remaining items)

**Transfer In Putaway**:
- Created automatically when all items are received AND Transfer In is completed
- Always created (no sorting step)

---

### 4. Stock Update Mechanism

**Same for Both**:
- ✅ Uses same `processPutawayCompletionEvent()` function
- ✅ Uses MOVE pattern (decrease from staging, increase at target)
- ✅ Updates same tables (`tabStockLedger`, `tabTransactionHistory`)
- ✅ Triggered automatically when location is scanned

---

## 🚨 Common Issues

### Issue 1: Stock Not Updating

**Symptoms**: Location scanned but stock ledger empty

**Causes**:
- ❌ Putaway lines don't have `location_id` set
- ❌ Transaction rolled back due to error
- ❌ Idempotency check preventing updates (task already completed)
- ❌ Wrong warehouse (using `warehouse` instead of `to_warehouse`)

**Solution**:
1. Check if putaway lines have location:
   ```sql
   SELECT location_id FROM tabPutawayLine 
   WHERE parent_title = 'PUT-20260120-0001' 
   LIMIT 1;
   ```
2. Check backend logs for errors
3. Verify warehouse:
   ```sql
   SELECT to_warehouse, warehouse 
   FROM tabTransferIn 
   WHERE title = 'INSLIP-123457';
   ```
4. Use manual trigger: `POST /api/putaway/trigger-stock-update`

---

### Issue 2: Wrong Warehouse in Stock Ledger

**Symptoms**: Stock shows at wrong warehouse

**Causes**:
- ❌ Using `tabTransferIn.warehouse` instead of `tabTransferIn.to_warehouse`

**Solution**:
- ✅ Code uses `to_warehouse` (destination warehouse)
- ✅ Verify in backend logs which warehouse is used

---

## 📋 Summary

### Transfer In Putaway Flow

1. ✅ Create Transfer In
2. ✅ Submit Transfer In
3. ✅ Receive items (by carton or loose)
4. ✅ Complete receiving (creates putaway task automatically)
5. ✅ Validate carton (optional - returns box_id and putaway_task)
6. ✅ **Scan location** → **Stock updates automatically**
7. ✅ Verify stock in ledger and transaction history

### Stock Update Mechanism

- ✅ **Triggered by**: `POST /api/putaway/scan-transfer-carton`
- ✅ **Function**: `processPutawayCompletionEvent()`
- ✅ **Pattern**: MOVE (decrease from staging, increase at target)
- ✅ **Warehouse**: From `tabTransferIn.to_warehouse`
- ✅ **Tables Updated**: `tabStockLedger`, `tabTransactionHistory`, `tabItem.stock_qty`
- ✅ **Transaction**: Single atomic transaction

---

## 🔄 Comparison: ASN vs Transfer In Putaway

| Aspect | ASN Putaway | Transfer In Putaway |
|--------|-------------|---------------------|
| **Warehouse Source** | `tabAdvanceShippingNotice.warehouse` | `tabTransferIn.to_warehouse` |
| **Box ID Format** | `PAW-ASN-*` or `BOX-WHMAIN-*` | `CTN-TI-*` |
| **Putaway Task Creation** | After receiving OR after sorting | After all items received |
| **Stock Update Function** | `processPutawayCompletionEvent()` | `processPutawayCompletionEvent()` ✅ **SAME** |
| **Stock Update Pattern** | MOVE (decrease staging, increase target) | MOVE (decrease staging, increase target) ✅ **SAME** |
| **Location Scan Endpoint** | `POST /api/putaway/scan-transfer-carton` | `POST /api/putaway/scan-transfer-carton` ✅ **SAME** |

**✅ Both use the exact same stock update mechanism!**

---

**END**
