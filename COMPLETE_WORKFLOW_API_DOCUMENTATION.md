# Complete WMS Workflow API Documentation
## Step-by-Step Workflows with API Endpoints and JSON Examples

---

## Table of Contents
1. [Existing Workflows](#existing-workflows)
   - [ASN Receiving Workflow](#1-asn-receiving-workflow)
   - [Putaway Workflow](#2-putaway-workflow)
   - [Sorting & Transfer Carton Workflow](#3-sorting--transfer-carton-workflow)
   - [Picking Workflow](#4-picking-workflow)

2. [🆕 NEW Workflows](#new-workflows)
   - [Transfer In Workflow (Showroom → Warehouse)](#new-1-transfer-in-workflow-showroom--warehouse)
   - [Material Request Workflow (Warehouse → Showroom)](#new-2-material-request-workflow-warehouse--showroom)
   - [Cycle Count Workflow](#new-3-cycle-count-workflow)
   - [Stock Ledger & Stock Transactions](#new-4-stock-ledger--stock-transactions)

---

## Existing Workflows

### 1. ASN Receiving Workflow

#### Step 1: Get ASN List
**API:** `GET /api/master/asns`  
**Auth:** Required  
**Response:**
```json
[
  {
    "asn_no": "ASN-0001",
    "status": "Submitted",
    "purchase_order": "PO-2024-001",
    "supplier": "Supplier ABC",
    "shipment_date": "2024-12-20",
    "expected_arrival_date": "2024-12-25",
    "total_shipped_qty": 150.00,
    "airway_bill_no": null,
    "shipment_type": "Road",
    "updated_on": "2024-12-24T16:14:04.000Z",
    "total_carton_count": 2
  }
]
```

#### Step 2: Get ASN Details
**API:** `GET /api/asn/:asn_no`  
**Auth:** Required  
**Example:** `GET /api/asn/ASN-0001`  
**Response:**
```json
{
  "asn_no": "ASN-0001",
  "status": "Submitted",
  "purchase_order": "PO-2024-001",
  "supplier": "Supplier ABC",
  "shipment_date": "2024-12-20",
  "expected_arrival_date": "2024-12-25",
  "total_shipped_qty": 150.00,
  "cartons": [
    {
      "carton_id": "CTN-0101",
      "items": [
        {
          "item_code": "SKU-001",
          "shipped_qty": 50.00,
          "carton_assigned_status": "Assigned"
        }
      ]
    }
  ]
}
```

#### Step 3: Create/Update Inbound Session
**API:** `POST /api/inbound/update`  
**Auth:** Required  
**Request:**
```json
{
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER001",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 0,
  "total_cartons": 2,
  "transfer_order": "TO-0001",
  "dock": "DOCK-01",
  "user_id": "USER-001",
  "device_id": "DEVICE-001"
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Session updated successfully",
  "action": "created"
}
```

#### Step 4: Record Receive Lines
**API:** `POST /api/inbound/receive-lines`  
**Auth:** Required  
**Request:**
```json
{
  "parent_title": "SESSION-ASN0001-DEVICE001-USER001",
  "receive_lines": [
    {
      "carton_id": "CTN-0101",
      "item_code": "SKU-001",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    }
  ]
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Receive lines saved successfully",
  "saved_count": 1
}
```

#### Step 5: Complete Inbound Session
**API:** `POST /api/inbound/complete`  
**Auth:** Required  
**Request:**
```json
{
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER001",
  "completed_by": "USER-001"
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Inbound session completed successfully"
}
```

#### Step 6: Get Inbound Sessions
**API:** `GET /api/inbound/sessions`  
**Auth:** Required  
**Response:**
```json
[
  {
    "inbound_session": "SESSION-ASN0001-DEVICE001-USER001",
    "asn_no": "ASN-0001",
    "status": "Completed",
    "completed_cartons": 2,
    "total_cartons": 2,
    "transfer_order": "TO-0001",
    "dock": "DOCK-01",
    "started_by": "USER-001",
    "device_id": "DEVICE-001",
    "started_at": "2024-12-24T12:16:08.000Z",
    "ended_at": null,
    "completed_on": "2024-12-24T13:30:00.000Z",
    "created_at": "2024-12-24T12:16:08.000Z",
    "updated_at": "2024-12-24T13:30:00.000Z"
  }
]
```

---

### 2. Putaway Workflow

#### Step 1: Assign Rack/Bin for Putaway
**API:** `POST /api/putaway/assign-rack`  
**Auth:** Required  
**Request:**
```json
{
  "putaway_task": "PUTAWAY-001",
  "carton_id": "CTN-0101",
  "item_code": "SKU-001",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "qty": 50.00,
  "user_id": "USER-001"
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Rack assigned successfully"
}
```

---

### 3. Sorting & Transfer Carton Workflow

#### Step 1: Get Transfer Orders
**API:** `GET /api/master/transfer-orders`  
**Auth:** Required  
**Response:**
```json
[
  {
    "transfer_order": "TO-0001",
    "status": "Draft",
    "asn_no": "ASN-0001",
    "from_warehouse": "WH-MAIN",
    "prepared_by": "USER-001",
    "required_date": "2024-12-28",
    "total_allocated_qty": 150.00,
    "created_at": "2024-12-24T10:00:00.000Z",
    "updated_at": "2024-12-24T10:00:00.000Z"
  }
]
```

#### Step 2: Get Transfer Order by ASN
**API:** `GET /api/transfer-order/by-asn/:asn_no`  
**Auth:** Required  
**Example:** `GET /api/transfer-order/by-asn/ASN-0001`  
**Response:**
```json
{
  "transfer_order": "TO-0001",
  "status": "Draft",
  "asn_no": "ASN-0001",
  "from_warehouse": "WH-MAIN",
  "prepared_by": "USER-001",
  "required_date": "2024-12-28",
  "total_allocated_qty": 150.00
}
```

#### Step 3: Create Sort Box
**API:** `POST /api/boxes`  
**Auth:** Required  
**Request:**
```json
{
  "box_id": "BOX-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "purpose": "STORE",
  "user_id": "USER-001"
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Box created successfully",
  "data": {
    "box_id": "BOX-001",
    "status": "Open"
  }
}
```

#### Step 4: Get Boxes
**API:** `GET /api/boxes?asn=ASN-0001&store=STORE-001&status=Open`  
**Auth:** Required  
**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "box_id": "BOX-001",
      "status": "Open",
      "asn_no": "ASN-0001",
      "to_no": "TO-0001",
      "store": "STORE-001",
      "purpose": "STORE",
      "created_by": "USER-001",
      "created_on": "2024-12-24T10:30:23.000Z"
    }
  ]
}
```

#### Step 5: Close Box
**API:** `POST /api/boxes/:box_id/close`  
**Auth:** Required  
**Example:** `POST /api/boxes/BOX-001/close`  
**Request:**
```json
{
  "closed_by": "USER-001"
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Box closed successfully"
}
```

#### Step 6: Create Transfer Carton
**API:** `POST /api/transfer-cartons`  
**Auth:** Required  
**Request:**
```json
{
  "tc_id": "TC-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "user_id": "USER-001"
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-001-001",
    "status": "Created"
  }
}
```

#### Step 7: Get Transfer Cartons
**API:** `GET /api/master/transfer-cartons`  
**Auth:** Required  
**Response:**
```json
[
  {
    "tc_id": "TC-001-001",
    "status": "Created",
    "asn_no": "ASN-0001",
    "to_no": "TO-0001",
    "store": "STORE-001",
    "created_by": "USER-001",
    "created_on": "2024-12-24T10:30:23.000Z"
  }
]
```

---

### 4. Picking Workflow

#### Step 1: Get Items (for picking)
**API:** `GET /api/master/items`  
**Auth:** Required  
**Response:**
```json
[
  {
    "code": "ITEM-001",
    "name": "Product Name",
    "item_group": "Electronics",
    "brand": "Brand Name",
    "default_uom": "Nos",
    "stock_uom": "Nos",
    "barcode": "1234567890123",
    "maintain_stock": true,
    "stock_qty": 100.00,
    "reserved_qty": 10.00,
    "updated_on": "2024-12-23T11:32:15.000Z",
    "created_at": "2024-12-23T11:32:15.000Z",
    "updated_at": "2024-12-23T11:32:15.000Z"
  }
]
```

---

## 🆕 NEW Workflows

### 🆕 NEW 1. Transfer In Workflow (Showroom → Warehouse)

**Purpose:** Transfer items from showroom to warehouse (always goes to Putaway)

#### Step 1: Create Transfer In Document
**🆕 NEW API:** `POST /api/transfer-in`  
**Auth:** Required  
**Request:**
```json
{
  "title": "TI-0001",
  "from_showroom": "SHOWROOM-001",
  "to_warehouse": "WH-MAIN",
  "transfer_date": "2025-12-27",
  "expected_arrival_date": "2025-12-27",
  "prepared_by": "USER-001",
  "items": [
    {
      "item_code": "ITEM-001",
      "qty": 50.00,
      "carton_id": "CTN-0101"
    },
    {
      "item_code": "ITEM-002",
      "qty": 30.00,
      "carton_id": "CTN-0102"
    }
  ]
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Transfer In created successfully",
  "data": {
    "title": "TI-0001",
    "status": "Draft",
    "total_qty": 80.00
  }
}
```

#### Step 2: Get Transfer In List
**🆕 NEW API:** `GET /api/transfer-in`  
**Auth:** Required  
**Query Parameters (optional):**
- `status` - Filter by status (Draft, Submitted, In Transit, Received, Completed)
- `from_showroom` - Filter by source showroom
- `to_warehouse` - Filter by destination warehouse

**Example:** `GET /api/transfer-in?status=Submitted`  
**Response:**
```json
[
  {
    "title": "TI-0001",
    "status": "Submitted",
    "from_showroom": "SHOWROOM-001",
    "to_warehouse": "WH-MAIN",
    "transfer_date": "2025-12-27",
    "expected_arrival_date": "2025-12-27",
    "prepared_by": "USER-001",
    "received_by": null,
    "received_on": null,
    "total_qty": 80.00,
    "items": [
      {
        "item_code": "ITEM-001",
        "qty": 50.00,
        "carton_id": "CTN-0101",
        "received_qty": 0.00
      },
      {
        "item_code": "ITEM-002",
        "qty": 30.00,
        "carton_id": "CTN-0102",
        "received_qty": 0.00
      }
    ],
    "created_at": "2025-12-27T08:00:00.000Z",
    "updated_at": "2025-12-27T08:00:00.000Z"
  }
]
```

#### Step 3: Get Single Transfer In
**🆕 NEW API:** `GET /api/transfer-in/:title`  
**Auth:** Required  
**Example:** `GET /api/transfer-in/TI-0001`  
**Response:** (Same format as Step 2, single object)

#### Step 4: Create Inbound Session for Transfer In
**API:** `POST /api/inbound/update` (Updated to support Transfer In)  
**Auth:** Required  
**Request:**
```json
{
  "inbound_session": "SESSION-TI0001-DEVICE001-USER001",
  "transfer_in": "TI-0001",
  "status": "Active",
  "completed_cartons": 0,
  "total_cartons": 2,
  "dock": "DOCK-01",
  "user_id": "USER-001",
  "device_id": "DEVICE-001"
}
```
**Note:** Use `transfer_in` instead of `asn_no` for Transfer In sessions  
**Response:**
```json
{
  "ok": true,
  "message": "Session updated successfully",
  "action": "created"
}
```

#### Step 5: Record Receive Lines (Same as ASN Receiving)
**API:** `POST /api/inbound/receive-lines`  
**Auth:** Required  
**Request:**
```json
{
  "parent_title": "SESSION-TI0001-DEVICE001-USER001",
  "receive_lines": [
    {
      "carton_id": "CTN-0101",
      "item_code": "ITEM-001",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    }
  ]
}
```

#### Step 6: Complete Inbound Session (Same as ASN)
**API:** `POST /api/inbound/complete`  
**Auth:** Required  
**Request:**
```json
{
  "inbound_session": "SESSION-TI0001-DEVICE001-USER001",
  "completed_by": "USER-001"
}
```

#### Step 7: Get Inbound Sessions (Now includes transfer_in)
**API:** `GET /api/inbound/sessions` (Updated)  
**Auth:** Required  
**Response:**
```json
[
  {
    "inbound_session": "SESSION-TI0001-DEVICE001-USER001",
    "asn_no": null,
    "transfer_in": "TI-0001",
    "status": "Completed",
    "completed_cartons": 2,
    "total_cartons": 2,
    "transfer_order": null,
    "dock": "DOCK-01",
    "started_by": "USER-001",
    "device_id": "DEVICE-001",
    "started_at": "2025-12-27T10:00:00.000Z",
    "ended_at": null,
    "completed_on": "2025-12-27T11:30:00.000Z",
    "created_at": "2025-12-27T10:00:00.000Z",
    "updated_at": "2025-12-27T11:30:00.000Z"
  }
]
```

**Note:** After receiving, Transfer In items automatically go to Putaway (no Sorting step)

---

### 🆕 NEW 2. Material Request Workflow (Warehouse → Showroom)

**Purpose:** Request items from warehouse to be sent to showroom (similar to picking)

#### Step 1: Create Material Request
**🆕 NEW API:** `POST /api/material-requests`  
**Auth:** Required  
**Request:**
```json
{
  "title": "MR-0001",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "SHOWROOM-001",
  "request_date": "2025-12-27",
  "required_date": "2025-12-28",
  "requested_by": "USER-001",
  "items": [
    {
      "item_code": "ITEM-001",
      "requested_qty": 20.00
    },
    {
      "item_code": "ITEM-002",
      "requested_qty": 15.00
    }
  ]
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Material Request created successfully",
  "data": {
    "title": "MR-0001",
    "status": "Draft",
    "total_requested_qty": 35.00
  }
}
```

#### Step 2: Get Material Request List
**🆕 NEW API:** `GET /api/material-requests`  
**Auth:** Required  
**Query Parameters (optional):**
- `status` - Filter by status (Draft, Submitted, In Progress, Completed, Cancelled)
- `from_warehouse` - Filter by source warehouse
- `to_showroom` - Filter by destination showroom

**Example:** `GET /api/material-requests?status=In Progress`  
**Response:**
```json
[
  {
    "title": "MR-0001",
    "status": "In Progress",
    "from_warehouse": "WH-MAIN",
    "to_showroom": "SHOWROOM-001",
    "request_date": "2025-12-27",
    "required_date": "2025-12-28",
    "requested_by": "USER-001",
    "total_requested_qty": 35.00,
    "total_picked_qty": 20.00,
    "items": [
      {
        "item_code": "ITEM-001",
        "requested_qty": 20.00,
        "picked_qty": 20.00
      },
      {
        "item_code": "ITEM-002",
        "requested_qty": 15.00,
        "picked_qty": 0.00
      }
    ],
    "created_at": "2025-12-27T08:00:00.000Z",
    "updated_at": "2025-12-27T10:30:00.000Z"
  }
]
```

#### Step 3: Get Single Material Request
**🆕 NEW API:** `GET /api/material-requests/:title`  
**Auth:** Required  
**Example:** `GET /api/material-requests/MR-0001`  
**Response:** (Same format as Step 2, single object)

#### Step 4: Pick Items (Use existing picking workflow)
**Note:** Material Request picking uses the same picking workflow as regular picking. The WMS transaction will reference the Material Request document.

---

### 🆕 NEW 3. Cycle Count Workflow

**Purpose:** Physical inventory count to verify stock accuracy

#### Step 1: Create Cycle Count Task
**🆕 NEW API:** `POST /api/cycle-count`  
**Auth:** Required  
**Request:**
```json
{
  "title": "CC-0001",
  "count_type": "Cycle",
  "warehouse": "WH-MAIN",
  "zone": "ZONE-A",
  "count_date": "2025-12-27",
  "scheduled_start_time": "09:00:00",
  "scheduled_end_time": "17:00:00",
  "freeze_stock": false,
  "created_by": "USER-001",
  "assigned_to": "USER-002",
  "lines": [
    {
      "item_code": "ITEM-001",
      "bin_location": "RACK-A-01-BIN-05",
      "expected_qty": 50.00
    },
    {
      "item_code": "ITEM-002",
      "bin_location": "RACK-A-01-BIN-06",
      "expected_qty": 30.00
    }
  ]
}
```
**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task created successfully",
  "data": {
    "title": "CC-0001",
    "status": "Draft",
    "total_items": 2
  }
}
```

#### Step 2: Get Cycle Count Task List
**🆕 NEW API:** `GET /api/cycle-count`  
**Auth:** Required  
**Query Parameters (optional):**
- `status` - Filter by status (Draft, Scheduled, In Progress, Completed, Cancelled)
- `warehouse` - Filter by warehouse
- `zone` - Filter by zone
- `count_type` - Filter by count type (Full, Cycle, Spot)

**Example:** `GET /api/cycle-count?status=In Progress&warehouse=WH-MAIN`  
**Response:**
```json
[
  {
    "title": "CC-0001",
    "status": "In Progress",
    "count_type": "Cycle",
    "warehouse": "WH-MAIN",
    "zone": "ZONE-A",
    "count_date": "2025-12-27",
    "scheduled_start_time": "09:00:00",
    "scheduled_end_time": "17:00:00",
    "freeze_stock": false,
    "created_by": "USER-001",
    "assigned_to": "USER-002",
    "total_items": 2,
    "counted_items": 1,
    "items_with_discrepancy": 0,
    "lines": [
      {
        "id": 1,
        "item_code": "ITEM-001",
        "bin_location": "RACK-A-01-BIN-05",
        "expected_qty": 50.00,
        "actual_qty": 48.00,
        "discrepancy": -2.00,
        "counted_by": "USER-002",
        "counted_on": "2025-12-27T10:30:00.000Z",
        "reviewed_by": null,
        "reviewed_on": null,
        "approval_required": false,
        "approved_by": null,
        "approved_on": null,
        "discrepancy_reason": null,
        "status": "Counted"
      },
      {
        "id": 2,
        "item_code": "ITEM-002",
        "bin_location": "RACK-A-01-BIN-06",
        "expected_qty": 30.00,
        "actual_qty": null,
        "discrepancy": null,
        "counted_by": null,
        "counted_on": null,
        "reviewed_by": null,
        "reviewed_on": null,
        "approval_required": false,
        "approved_by": null,
        "approved_on": null,
        "discrepancy_reason": null,
        "status": "Pending"
      }
    ],
    "created_at": "2025-12-27T08:00:00.000Z",
    "updated_at": "2025-12-27T10:30:00.000Z"
  }
]
```

#### Step 3: Get Single Cycle Count Task
**🆕 NEW API:** `GET /api/cycle-count/:title`  
**Auth:** Required  
**Example:** `GET /api/cycle-count/CC-0001`  
**Response:** (Same format as Step 2, single object)

#### Step 4: Record Count (Update Cycle Count Line)
**Note:** This would typically be done through a WMS Transaction or direct database update. The cycle count line status changes from "Pending" to "Counted" when actual_qty is recorded.

#### Step 5: Review Discrepancies
**Note:** When discrepancy exists (actual_qty ≠ expected_qty), the line may require review and approval before stock adjustment.

#### Step 6: Approve and Adjust Stock
**Note:** After approval, stock is automatically adjusted via StockLedgerService when the WMS Transaction is completed.

---

### 🆕 NEW 4. Stock Ledger & Stock Transactions

**Purpose:** Real-time stock tracking and audit trail

#### Step 1: Get Stock Ledger (All Stock)
**🆕 NEW API:** `GET /api/stock-ledger`  
**Auth:** Required  
**Query Parameters (optional):**
- `warehouse` - Filter by warehouse
- `item_code` - Filter by item code
- `bin_location` - Filter by bin location (use `null` for warehouse-level stock)

**Example:** `GET /api/stock-ledger?warehouse=WH-MAIN&item_code=ITEM-001`  
**Response:**
```json
[
  {
    "item_code": "ITEM-001",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty": 50.00,
    "reserved_qty": 5.00,
    "available_qty": 45.00,
    "last_transaction_date": "2025-12-27T10:30:00.000Z",
    "last_transaction_type": "Putaway",
    "last_transaction_ref": "PUT-0001",
    "updated_at": "2025-12-27T10:30:00.000Z",
    "created_at": "2025-12-27T10:30:00.000Z"
  },
  {
    "item_code": "ITEM-001",
    "warehouse": "WH-MAIN",
    "bin_location": null,
    "qty": 20.00,
    "reserved_qty": 0.00,
    "available_qty": 20.00,
    "last_transaction_date": "2025-12-27T09:00:00.000Z",
    "last_transaction_type": "Receiving",
    "last_transaction_ref": "ASN-0001",
    "updated_at": "2025-12-27T09:00:00.000Z",
    "created_at": "2025-12-27T09:00:00.000Z"
  }
]
```

#### Step 2: Get Stock by Item/Warehouse (Bin Breakdown)
**🆕 NEW API:** `GET /api/stock-ledger/:item_code/:warehouse`  
**Auth:** Required  
**Example:** `GET /api/stock-ledger/ITEM-001/WH-MAIN`  
**Response:**
```json
[
  {
    "item_code": "ITEM-001",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty": 50.00,
    "reserved_qty": 5.00,
    "available_qty": 45.00,
    "last_transaction_date": "2025-12-27T10:30:00.000Z",
    "last_transaction_type": "Putaway",
    "last_transaction_ref": "PUT-0001",
    "updated_at": "2025-12-27T10:30:00.000Z",
    "created_at": "2025-12-27T10:30:00.000Z"
  },
  {
    "item_code": "ITEM-001",
    "warehouse": "WH-MAIN",
    "bin_location": null,
    "qty": 20.00,
    "reserved_qty": 0.00,
    "available_qty": 20.00,
    "last_transaction_date": "2025-12-27T09:00:00.000Z",
    "last_transaction_type": "Receiving",
    "last_transaction_ref": "ASN-0001",
    "updated_at": "2025-12-27T09:00:00.000Z",
    "created_at": "2025-12-27T09:00:00.000Z"
  }
]
```

#### Step 3: Get Stock Transaction History (Audit Trail)
**🆕 NEW API:** `GET /api/stock-transactions`  
**Auth:** Required  
**Query Parameters (optional):**
- `warehouse` - Filter by warehouse
- `item_code` - Filter by item code
- `transaction_type` - Filter by type (Receiving, Putaway, Picking, CycleCount, TransferIn, MaterialRequest)
- `reference_doc` - Filter by reference document
- `from_date` - Filter from date (YYYY-MM-DD)
- `to_date` - Filter to date (YYYY-MM-DD)
- `limit` - Limit results (default: 1000)

**Example:** `GET /api/stock-transactions?item_code=ITEM-001&warehouse=WH-MAIN&limit=100`  
**Response:**
```json
[
  {
    "id": 1,
    "transaction_date": "2025-12-27T10:30:00.000Z",
    "transaction_type": "Putaway",
    "reference_doc_type": "Putaway Task",
    "reference_doc": "PUT-0001",
    "wms_transaction_title": "WMS-PUT-0001",
    "item_code": "ITEM-001",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty_change": 50.00,
    "qty_before": 0.00,
    "qty_after": 50.00,
    "source_bin": "DOCK-01",
    "target_bin": "RACK-A-01-BIN-05",
    "performed_by": "USER-001",
    "notes": null,
    "created_at": "2025-12-27T10:30:00.000Z"
  },
  {
    "id": 2,
    "transaction_date": "2025-12-27T09:00:00.000Z",
    "transaction_type": "Receiving",
    "reference_doc_type": "Advance Shipping Notice",
    "reference_doc": "ASN-0001",
    "wms_transaction_title": "WMS-REC-0001",
    "item_code": "ITEM-001",
    "warehouse": "WH-MAIN",
    "bin_location": null,
    "qty_change": 50.00,
    "qty_before": 0.00,
    "qty_after": 50.00,
    "source_bin": "DOCK-01",
    "target_bin": null,
    "performed_by": "USER-001",
    "notes": null,
    "created_at": "2025-12-27T09:00:00.000Z"
  }
]
```

---

## 🆕 NEW API Summary for Mobile App Development

### Transfer In APIs
1. `POST /api/transfer-in` - Create Transfer In
2. `GET /api/transfer-in` - Get Transfer In list
3. `GET /api/transfer-in/:title` - Get single Transfer In

### Material Request APIs
1. `POST /api/material-requests` - Create Material Request
2. `GET /api/material-requests` - Get Material Request list
3. `GET /api/material-requests/:title` - Get single Material Request

### Cycle Count APIs
1. `POST /api/cycle-count` - Create Cycle Count Task
2. `GET /api/cycle-count` - Get Cycle Count Task list
3. `GET /api/cycle-count/:title` - Get single Cycle Count Task

### Stock Ledger APIs
1. `GET /api/stock-ledger` - Get all stock ledger entries
2. `GET /api/stock-ledger/:item_code/:warehouse` - Get stock by item/warehouse
3. `GET /api/stock-transactions` - Get stock transaction history

### Updated Existing APIs
1. `POST /api/inbound/update` - Now supports `transfer_in` parameter
2. `GET /api/inbound/sessions` - Now returns `transfer_in` field

---

## Authentication

All APIs require authentication token in the header:
```
Authorization: Bearer <token>
```

To get a token, use:
**API:** `POST /api/auth/login`  
**Request:**
```json
{
  "username": "user001",
  "password": "password123"
}
```
**Response:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_code": "USER-001",
    "name": "John Doe",
    "role": "operator"
  }
}
```

---

## Error Response Format

All APIs return errors in this format:
```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": "Additional details (only in development mode)"
  }
}
```

Common error codes:
- `VALIDATION_ERROR` - Missing or invalid parameters (400)
- `NOT_FOUND` - Resource not found (404)
- `DUPLICATE_ENTRY` - Resource already exists (409)
- `DATABASE_ERROR` - Database operation failed (500)
- `UNAUTHORIZED` - Invalid or missing token (401)

---

## Notes for Mobile App Development

1. **Transfer In Flow:**
   - Always creates Putaway Tasks (no Sorting step)
   - Use `transfer_in` instead of `asn_no` when creating inbound sessions
   - Stock increases at warehouse level after receiving, then moves to bins after putaway

2. **Material Request Flow:**
   - Similar to picking workflow
   - Stock decreases from source bins when items are dispatched
   - Use existing picking APIs, but reference Material Request document

3. **Cycle Count Flow:**
   - Can freeze stock during count (optional)
   - Discrepancies require review/approval before stock adjustment
   - Stock is automatically adjusted after approval

4. **Stock Ledger:**
   - Real-time stock is automatically updated after each transaction
   - Stock at `bin_location: null` = warehouse-level stock (at dock, not yet putaway)
   - `available_qty = qty - reserved_qty`

5. **Stock Transactions:**
   - Complete audit trail of all stock movements
   - Use for reporting and reconciliation
   - Filterable by date, item, warehouse, transaction type

---

## Workflow Comparison

| Feature | ASN Receiving | 🆕 Transfer In | Regular Picking | 🆕 Material Request |
|---------|--------------|----------------|-----------------|---------------------|
| Source | Supplier | Showroom | Warehouse | Warehouse |
| Destination | Warehouse | Warehouse | Store | Showroom |
| Routing | Sorting (if TO exists) or Putaway | Always Putaway | Direct dispatch | Direct dispatch |
| Stock Change | +qty at warehouse, then +qty at bin | +qty at warehouse, then +qty at bin | -qty from bin | -qty from bin |
| API Endpoint | `/api/inbound/update` (with `asn_no`) | `/api/inbound/update` (with `transfer_in`) | Existing picking | Existing picking (ref: MR) |

---

## Complete Workflow Diagrams

### ASN Receiving Flow
```
Supplier → ASN → Inbound Session (with asn_no) → Receiving → 
  → [If TO exists] Sorting → Transfer Carton → Store
  → [If no TO] Putaway → Bin Location
```

### 🆕 Transfer In Flow
```
Showroom → Transfer In → Inbound Session (with transfer_in) → 
  → Receiving → Putaway → Bin Location
  (Always goes to Putaway, no Sorting step)
```

### 🆕 Material Request Flow
```
Showroom → Material Request → Picking → Dispatch → Showroom
  (Stock decreases from warehouse bins)
```

### 🆕 Cycle Count Flow
```
Create Task → Count Items → Record Actual Qty → 
  → Review Discrepancies → Approve → Stock Adjustment
```

---

**End of Documentation**

