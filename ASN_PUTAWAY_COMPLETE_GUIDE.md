# ASN Putaway Process - Complete Guide

**Date**: 2026-01-20  
**Status**: ✅ **COMPLETE DOCUMENTATION**

---

## 🎯 Overview

This guide covers the complete ASN (Advance Shipping Notice) Putaway process, including all API endpoints, sample JSON requests/responses, and detailed stock update mechanism.

---

## 📋 ASN Putaway Workflow

### Complete Flow Diagram

```
1. ASN Created
   ↓
2. Start Inbound Session
   POST /api/inbound/session/start
   ↓
3. Receive Items
   POST /api/inbound/receive
   ↓
4. Complete Inbound Session
   POST /api/inbound/session/complete
   → Creates Putaway Task automatically
   ↓
5. Scan Location for Putaway
   POST /api/putaway/scan-transfer-carton
   → Assigns location to putaway lines
   → Triggers stock updates automatically
   ↓
6. Stock Updated
   → tabStockLedger updated
   → tabTransactionHistory created
   → tabItem.stock_qty updated
```

---

## 🔌 API Endpoints

### 1. Start Inbound Session

**Endpoint**: `POST /api/inbound/session/start`

**Purpose**: Start an inbound receiving session for ASN

**Request**:
```json
{
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "warehouse": "WH-MAIN",
  "dock": "DOCK-01",
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "success": true,
  "session_id": "IB-20260120-000123",
  "message": "Inbound session started successfully"
}
```

---

### 2. Generate Carton ID

**Endpoint**: `POST /api/inbound/carton/generate`

**Purpose**: Generate a carton ID for ASN receiving

**Request**:
```json
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473"
}
```

**Response**:
```json
{
  "ok": true,
  "carton_id": "CTN-ASN-365425473-20260120-120530-456",
  "message": "Carton ID generated successfully"
}
```

---

### 3. Validate Carton

**Endpoint**: `POST /api/inbound/carton/validate`

**Purpose**: Validate carton before receiving items

**Request**:
```json
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "carton_id": "CTN-ASN-365425473-20260120-120530-456"
}
```

**Response**:
```json
{
  "ok": true,
  "validated": {
    "carton_id": "CTN-ASN-365425473-20260120-120530-456",
    "box_id": "CTN-ASN-365425473-20260120-120530-456",
    "putaway_task": "PUT-20260120-0001",
    "ready_for_putaway": true
  },
  "message": "Carton validated successfully"
}
```

---

### 4. Receive Item

**Endpoint**: `POST /api/inbound/receive`

**Purpose**: Receive individual items into carton

**Request**:
```json
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "carton_id": "CTN-ASN-365425473-20260120-120530-456",
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 2.0,
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Item received successfully",
  "data": {
    "carton_id": "CTN-ASN-365425473-20260120-120530-456",
    "item_code": "SKU-HAT-301-BLU-OS",
    "qty": 2.0,
    "total_received": 2.0
  }
}
```

---

### 5. Complete Inbound Session

**Endpoint**: `POST /api/inbound/session/complete`

**Purpose**: Complete inbound session and create putaway task

**Request**:
```json
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Inbound session completed successfully",
  "data": {
    "session_id": "IB-20260120-000123",
    "putaway_task": "PUT-20260120-0001",
    "items_count": 2,
    "warehouse": "WH-MAIN"
  }
}
```

**What Happens**:
- ✅ Creates `tabPutawayTask` with `source_type = "ASN"`
- ✅ Creates `tabPutawayLine` records for each item
- ✅ Creates boxes in `tabSortBox` (if needed)
- ✅ Status set to "In Progress"

---

### 6. Get Putaway Tasks

**Endpoint**: `GET /api/putaway/tasks`

**Purpose**: Get list of putaway tasks (filter by ASN)

**Request**:
```
GET /api/putaway/tasks?status=In Progress&source_type=ASN&advance_shipping_notice=ASN-365425473
```

**Response**:
```json
{
  "ok": true,
  "tasks": [
    {
      "title": "PUT-20260120-0001",
      "status": "In Progress",
      "source_type": "ASN",
      "advance_shipping_notice": "ASN-365425473",
      "warehouse": "WH-MAIN",
      "created_at": "2026-01-20T12:05:30.000Z",
      "items": [
        {
          "item_code": "SKU-HAT-301-BLU-OS",
          "qty": 2.0,
          "carton_id": "CTN-ASN-365425473-20260120-120530-456",
          "location_id": null,
          "rack": null,
          "bin": null
        },
        {
          "item_code": "SKU-HAT-301-GRN-OS",
          "qty": 2.0,
          "carton_id": "CTN-ASN-365425473-20260120-120530-456",
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

### 7. Scan Location for Putaway ⭐ **CRITICAL**

**Endpoint**: `POST /api/putaway/scan-transfer-carton`

**Purpose**: Assign location to putaway task and trigger stock updates

**Request**:
```json
{
  "box_id": "CTN-ASN-365425473-20260120-120530-456",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-150526"
}
```

**Alternative** (using putaway_task):
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
        "carton_id": "CTN-ASN-365425473-20260120-120530-456",
        "qty": 2.0,
        "rack": "A1-R02-L1",
        "bin": "B2",
        "location_id": "A1-R02-L1-B2"
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "carton_id": "CTN-ASN-365425473-20260120-120530-456",
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
1. ✅ Validates `box_id` exists in `tabSortBox`
2. ✅ Validates `location_id` exists in `tabLocation`
3. ✅ Updates all `tabPutawayLine` records with `location_id`, `rack`, `bin`
4. ✅ **Automatically triggers stock updates** via `processPutawayCompletionEvent`
5. ✅ Updates `tabStockLedger` (MOVE pattern: decrease from staging, increase at target)
6. ✅ Creates `tabTransactionHistory` records
7. ✅ Updates `tabItem.stock_qty` (if stock posting enabled)

---

### 8. Complete Putaway Task (Optional)

**Endpoint**: `POST /api/putaway/complete`

**Purpose**: Mark putaway task as completed

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
  "message": "Putaway task PUT-20260120-0001 completed successfully",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "status": "Completed",
    "items_count": 2
  }
}
```

**Note**: Stock updates are triggered automatically when location is scanned (Step 7), so this endpoint is mainly for status update.

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
     box_id: 'CTN-ASN-365425473-20260120-120530-456',
     carton_id: 'CTN-ASN-365425473-20260120-120530-456',
     location_id: 'A1-R02-L1-B2',
     rack: 'A1-R02-L1',
     bin: 'B2',
     user_id: 'USER-150526',
     store: 'WH-MAIN'
   });
   ```

---

#### Step 2: Process Putaway Completion Event

**Function**: `processPutawayCompletionEvent()` in `wms-api/src/modules/events/eventController.js`

**What It Does**:

1. **Gets Putaway Lines**:
   ```sql
   SELECT item_code, qty, carton_id, location_id, rack, bin
   FROM tabPutawayLine
   WHERE parent_title = 'PUT-20260120-0001'
     AND item_code IS NOT NULL
     AND qty > 0
   ```

2. **For Each Line** (MOVE Pattern):

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
     'CTN-ASN-365425473-20260120-120530-456',
     2.0,  -- Positive for stock increase
     'PUT-20260120-0001',
     NOW()
   )
   ```

3. **Commit Transaction**:
   ```javascript
   await connection.commit();
   ```

---

### Stock Update Tables

#### 1. tabStockLedger

**Purpose**: Real-time stock quantities by location

**Key Fields**:
- `item_code`: Item SKU
- `warehouse`: Warehouse code (e.g., "WH-MAIN")
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
- `warehouse`: Warehouse code
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

**Note**: `stock_qty` should equal sum of all `tabStockLedger.qty` for that item:
```sql
SELECT 
  i.code,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code = 'SKU-HAT-301-BLU-OS'
GROUP BY i.code, i.stock_qty;
```

---

## 🔄 Complete ASN Putaway Example

### Scenario

**ASN**: `ASN-365425473`  
**Items**: 
- `SKU-HAT-301-BLU-OS` × 2
- `SKU-HAT-301-GRN-OS` × 2  
**Target Location**: `A1-R02-L1-B2`

---

### Step 1: Start Inbound Session

**Request**:
```json
POST /api/inbound/session/start
{
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "warehouse": "WH-MAIN",
  "dock": "DOCK-01",
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "success": true,
  "session_id": "IB-20260120-000123"
}
```

---

### Step 2: Generate Carton ID

**Request**:
```json
POST /api/inbound/carton/generate
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473"
}
```

**Response**:
```json
{
  "ok": true,
  "carton_id": "CTN-ASN-365425473-20260120-120530-456"
}
```

---

### Step 3: Validate Carton

**Request**:
```json
POST /api/inbound/carton/validate
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "carton_id": "CTN-ASN-365425473-20260120-120530-456"
}
```

**Response**:
```json
{
  "ok": true,
  "validated": {
    "carton_id": "CTN-ASN-365425473-20260120-120530-456",
    "box_id": "CTN-ASN-365425473-20260120-120530-456",
    "putaway_task": "PUT-20260120-0001",
    "ready_for_putaway": true
  }
}
```

---

### Step 4: Receive Items

**Request 1** (Item 1):
```json
POST /api/inbound/receive
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "carton_id": "CTN-ASN-365425473-20260120-120530-456",
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 2.0,
  "user_id": "USER-150526"
}
```

**Request 2** (Item 2):
```json
POST /api/inbound/receive
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "carton_id": "CTN-ASN-365425473-20260120-120530-456",
  "item_code": "SKU-HAT-301-GRN-OS",
  "qty": 2.0,
  "user_id": "USER-150526"
}
```

---

### Step 5: Complete Inbound Session

**Request**:
```json
POST /api/inbound/session/complete
{
  "session_id": "IB-20260120-000123",
  "source_type": "ASN",
  "source_doc": "ASN-365425473",
  "user_id": "USER-150526"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Inbound session completed successfully",
  "data": {
    "session_id": "IB-20260120-000123",
    "putaway_task": "PUT-20260120-0001",
    "items_count": 2,
    "warehouse": "WH-MAIN"
  }
}
```

**Database State After This Step**:
```sql
-- tabPutawayTask
title: PUT-20260120-0001
status: In Progress
source_type: ASN
advance_shipping_notice: ASN-365425473
warehouse: WH-MAIN

-- tabPutawayLine (2 rows)
Row 1: item_code=SKU-HAT-301-BLU-OS, qty=2.0, carton_id=CTN-ASN-365425473-20260120-120530-456, location_id=NULL
Row 2: item_code=SKU-HAT-301-GRN-OS, qty=2.0, carton_id=CTN-ASN-365425473-20260120-120530-456, location_id=NULL
```

---

### Step 6: Scan Location for Putaway ⭐ **STOCK UPDATE HAPPENS HERE**

**Request**:
```json
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-ASN-365425473-20260120-120530-456",
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

   **For Item 1 (SKU-HAT-301-BLU-OS)**:
   
   **A. Decrease from Staging**:
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
   
   **B. Increase at Target Location**:
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
   
   **C. Create Transaction History**:
   ```sql
   INSERT INTO tabTransactionHistory (
     transaction_type, warehouse, bin_location, location_id,
     item_code, carton_id, qty_change, reference_doc
   ) VALUES (
     'Putaway', 'WH-MAIN', 'A1-R02-L1-B2', 'A1-R02-L1-B2',
     'SKU-HAT-301-BLU-OS', 'CTN-ASN-365425473-20260120-120530-456', 2.0, 'PUT-20260120-0001'
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
Row 1: item_code=SKU-HAT-301-BLU-OS, bin_location=A1-R02-L1-B2, qty=2.0
Row 2: item_code=SKU-HAT-301-GRN-OS, bin_location=A1-R02-L1-B2, qty=2.0

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
Putaway           | WH-MAIN   | A1-R02-L1-B2  | A1-R02-L1-B2 | SKU-HAT-301-BLU-OS| CTN-ASN-365425473-20260120-120530-456  | 2.0        | PUT-20260120-0001| 2026-01-20 12:10:00
Putaway           | WH-MAIN   | A1-R02-L1-B2  | A1-R02-L1-B2 | SKU-HAT-301-GRN-OS| CTN-ASN-365425473-20260120-120530-456  | 2.0        | PUT-20260120-0001| 2026-01-20 12:10:00
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

**Note**: `stock_qty` should equal sum from `tabStockLedger`:
```sql
SELECT 
  i.code,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS')
GROUP BY i.code, i.stock_qty;
```

---

## 🔑 Key Points

### 1. Stock Updates Are Automatic

✅ Stock updates happen **automatically** when location is scanned via `POST /api/putaway/scan-transfer-carton`

✅ No need to call a separate "complete" endpoint for stock updates

---

### 2. MOVE Pattern (Not ADD)

✅ Stock is **moved** from staging to target location (not just added)

✅ FROM location (staging) stock decreases  
✅ TO location (target) stock increases

---

### 3. Transaction Safety

✅ All stock updates happen in a **single database transaction**

✅ If any update fails, entire transaction is rolled back

✅ Transaction commits only after all updates succeed

---

### 4. Idempotency

✅ Stock updates are **idempotent** - safe to call multiple times

✅ Checks if stock already moved before processing

✅ Prevents duplicate stock updates

---

## 🚨 Common Issues

### Issue 1: Stock Not Updating

**Symptoms**: Location scanned but stock ledger empty

**Causes**:
- ❌ Putaway lines don't have `location_id` set
- ❌ Transaction rolled back due to error
- ❌ Idempotency check preventing updates (task already completed)

**Solution**:
1. Check if putaway lines have location:
   ```sql
   SELECT location_id FROM tabPutawayLine 
   WHERE parent_title = 'PUT-20260120-0001' 
   LIMIT 1;
   ```
2. Check backend logs for errors
3. Use manual trigger: `POST /api/putaway/trigger-stock-update`

---

### Issue 2: Stock at Wrong Location

**Symptoms**: Stock shows at different location than scanned

**Causes**:
- ❌ Location ID mismatch
- ❌ Multiple putaway tasks for same items

**Solution**:
1. Verify location in putaway lines:
   ```sql
   SELECT location_id, rack, bin 
   FROM tabPutawayLine 
   WHERE parent_title = 'PUT-20260120-0001';
   ```
2. Check stock ledger:
   ```sql
   SELECT bin_location, qty 
   FROM tabStockLedger 
   WHERE last_transaction_ref = 'PUT-20260120-0001';
   ```

---

## 📋 Summary

### ASN Putaway Flow

1. ✅ Start inbound session
2. ✅ Generate carton ID
3. ✅ Validate carton
4. ✅ Receive items
5. ✅ Complete inbound session (creates putaway task)
6. ✅ **Scan location** → **Stock updates automatically**
7. ✅ Verify stock in ledger and transaction history

### Stock Update Mechanism

- ✅ **Triggered by**: `POST /api/putaway/scan-transfer-carton`
- ✅ **Function**: `processPutawayCompletionEvent()`
- ✅ **Pattern**: MOVE (decrease from staging, increase at target)
- ✅ **Tables Updated**: `tabStockLedger`, `tabTransactionHistory`, `tabItem.stock_qty`
- ✅ **Transaction**: Single atomic transaction

---

**END**
