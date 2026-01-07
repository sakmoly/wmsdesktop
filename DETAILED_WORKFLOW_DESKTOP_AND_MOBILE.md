# Detailed Workflow Documentation: Desktop & Mobile Applications
## Complete Step-by-Step Operations with API Endpoints and JSON Examples

**Version:** 2.0  
**Last Updated:** 2025-12-27  
**Purpose:** Comprehensive reference for Desktop and Mobile application development

---

## Table of Contents

1. [API Authentication](#1-api-authentication)
2. [Supplier Receiving Workflow (Including Transfer Out)](#2-supplier-receiving-workflow-including-transfer-out)
3. [Putaway Workflow (Updated)](#3-putaway-workflow-updated)
4. [Material Request Workflow (Warehouse to Showroom)](#4-material-request-workflow-warehouse-to-showroom)
5. [Transfer In Workflow (Showroom to Warehouse)](#5-transfer-in-workflow-showroom-to-warehouse)
6. [Cycle Count Workflow](#6-cycle-count-workflow)
7. [Stock Ledger Queries](#7-stock-ledger-queries)
8. [Stock Transaction Audit Trail](#8-stock-transaction-audit-trail)

---

# 1. API Authentication

## 1.1 Login Endpoint

### Desktop/Mobile â†’ Backend

**API Call:**
```
POST /api/auth/login
Content-Type: application/json
```

**Request JSON:**
```json
{
  "username": "user001",
  "password": "password123"
}
```

**Response JSON:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJVU0VSLTAwMSIsInVzZXJuYW1lIjoidXNlcjAwMSIsImlhdCI6MTYzODEyMzQ1NiwiZXhwIjoxNjM4MjA5ODU2fQ.signature",
  "user": {
    "id": "USER-001",
    "username": "user001",
    "name": "John Doe",
    "role": "Warehouse Staff"
  }
}
```

---

## 1.2 Using Authentication Token

**All API calls (except login) require authentication token:**

**Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Example:**
```http
GET /api/master/asns
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

# 2. Supplier Receiving Workflow (Including Transfer Out)

## 2.1 Overview

**Flow:** Supplier â†’ ASN (Advance Shipping Notice) â†’ Receiving â†’ Routing Decision:
- **If Transfer Order exists:** Route to Sorting â†’ Transfer Carton â†’ Transfer to Showroom (Transfer Out)
- **If No Transfer Order:** Route to Putaway (Storage in Warehouse)

**Key Note:** Transfer Out in ERPNext becomes Transfer Order in WMS. Items transferred from Warehouse to Showroom go through Sorting and Transfer Carton process.

---

## 2.2 Desktop Application - ASN Management

### Step 1: ASN Sync from ERPNext

**Desktop Operation:**
- ASN (Advance Shipping Notice) is synced from ERPNext to Desktop application
- Desktop app stores ASN data in local database
- ASN contains expected items from supplier

**Note:** ASN data is typically synced automatically via scheduled sync job.

---

### Step 2: View ASN List

**API Call (Desktop â† Backend):**
```
GET /api/master/asns
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "asn_no": "ASN-0001",
    "status": "Submitted",
    "purchase_order": "PO-2024-001",
    "supplier": "Supplier ABC",
    "shipment_date": "2025-12-20",
    "expected_arrival_date": "2025-12-25",
    "total_shipped_qty": 150.00,
    "airway_bill_no": null,
    "shipment_type": "Road",
    "updated_on": "2025-12-24T16:14:04.000Z",
    "total_carton_count": 2
  }
]
```

---

### Step 3: View ASN Details

**API Call (Desktop â† Backend):**
```
GET /api/asn/ASN-0001
Authorization: Bearer <token>
```

**Response JSON:**
```json
{
  "asn_no": "ASN-0001",
  "status": "Submitted",
  "purchase_order": "PO-2024-001",
  "supplier": "Supplier ABC",
  "warehouse": "WH-MAIN",
  "expected_date": "2025-12-25",
  "cartons": [
    {
      "carton_id": "CTN-0101",
      "items": [
        {
          "item_code": "Running Shoes White 42",
          "qty": 50.00,
          "carton_assigned_status": "Assigned"
        }
      ]
    }
  ]
}
```

---

## 2.3 Mobile Application - Receiving Workflow

### Step 1: Mobile App - View ASN List

**Mobile Action:** Warehouse staff opens ASN list in mobile app

**API Call (Mobile â† Backend):**
```
GET /api/master/asns?status=Submitted
Authorization: Bearer <token>
```

**Response JSON:** (Same as Desktop Step 2)

---

### Step 2: Mobile App - Create Inbound Session

**Mobile Action:** User selects ASN and starts receiving session

**API Call (Mobile â†’ Backend):**
```
POST /api/inbound/update
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
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

**Response JSON:**
```json
{
  "ok": true,
  "message": "Session created successfully",
  "action": "created"
}
```

---

### Step 3: Mobile App - Unload Cartons

**Mobile Action:** User scans cartons as they are unloaded from truck

**API Call (Mobile â†’ Backend):**
```
POST /api/cartons/update-status
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER001",
  "carton_id": "CTN-0101",
  "status": "Unloaded",
  "user_id": "USER-001",
  "device_id": "DEVICE-001"
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

---

### Step 4: Mobile App - Lock Carton for Receiving

**Mobile Action:** User locks carton before scanning items

**API Call (Mobile â†’ Backend):**
```
POST /api/cartons/update-status
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER001",
  "carton_id": "CTN-0101",
  "status": "Receiving",
  "user_id": "USER-001",
  "device_id": "DEVICE-001"
}
```

---

### Step 5: Mobile App - Receive Items (Scan Items)

**Mobile Action:** User scans items inside carton

**API Call (Mobile â†’ Backend):**
```
POST /api/inbound/receive-lines
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "parent_title": "SESSION-ASN0001-DEVICE001-USER001",
  "receive_lines": [
    {
      "carton_id": "CTN-0101",
      "item_code": "Running Shoes White 42",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    }
  ]
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Receive lines saved successfully",
  "saved_count": 1
}
```

---

### Step 6: Mobile App - Mark Carton as Received

**Mobile Action:** User marks carton as completely received

**API Call (Mobile â†’ Backend):**
```
POST /api/cartons/update-status
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER001",
  "carton_id": "CTN-0101",
  "status": "Received",
  "user_id": "USER-001",
  "device_id": "DEVICE-001"
}
```

---

### Step 7: Mobile App - Complete Inbound Session

**Mobile Action:** User completes receiving session after all cartons received

**API Call (Mobile â†’ Backend):**
```
POST /api/inbound/complete
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER001",
  "completed_by": "USER-001"
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Inbound session completed successfully"
}
```

---

## 2.4 Routing Logic: Sorting vs Putaway

**After Receiving, System Checks:**

1. **If Transfer Order exists for ASN:**
   - Route to **Sorting** (items go to stores via Transfer Orders)
   - API: `GET /api/transfer-order/by-asn/ASN-0001`

2. **If No Transfer Order or Remaining Items:**
   - Route to **Putaway** (items stored in warehouse bins)
   - API: `GET /api/putaway/tasks?advance_shipping_notice=ASN-0001&status=Open`

---

## 2.5 Sorting Workflow (For Transfer Out)

### Step 1: Desktop/Mobile - Check Transfer Order

**API Call:**
```
GET /api/transfer-order/by-asn/ASN-0001
Authorization: Bearer <token>
```

**Response JSON:**
```json
{
  "transfer_order": "TO-0001",
  "status": "Draft",
  "asn_no": "ASN-0001",
  "from_warehouse": "WH-MAIN",
  "prepared_by": "USER-001",
  "required_date": "2025-12-28",
  "total_allocated_qty": 150.00,
  "items": [
    {
      "store": "SHOWROOM-001",
      "item_code": "Running Shoes White 42",
      "allocated_qty": 50.00
    }
  ]
}
```

---

### Step 2: Desktop App - Create Sort Boxes (Pre-Creation)

**Desktop Action:** User creates Sort Boxes before mobile sorting begins

**Desktop Operation:**
- User navigates to "Sort Boxes" menu
- Selects ASN and Transfer Order
- Creates boxes for each store destination
- System generates unique Box IDs and prints barcode labels

**API Call (Desktop â†’ Backend):**
```
POST /api/boxes/create
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "box_id": "BOX-001",
  "advance_shipping_notice": "ASN-0001",
  "transfer_order": "TO-0001",
  "store": "SHOWROOM-001",
  "purpose": "STORE",
  "created_by": "USER-001"
}
```

**Response JSON:**
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

---

### Step 3: Mobile App - View Available Boxes

**Mobile Action:** User views available boxes for sorting

**API Call (Mobile â† Backend):**
```
GET /api/boxes?asn=ASN-0001&store=SHOWROOM-001&status=Open
Authorization: Bearer <token>
```

**Response JSON:**
```json
{
  "ok": true,
  "data": [
    {
      "box_id": "BOX-001",
      "status": "Open",
      "asn_no": "ASN-0001",
      "to_no": "TO-0001",
      "store": "SHOWROOM-001",
      "purpose": "STORE",
      "created_by": "USER-001",
      "created_on": "2025-12-27T10:30:23.000Z"
    }
  ]
}
```

---

### Step 4: Mobile App - Sort Items to Box

**Mobile Action:** User scans items and sorts them into boxes

**Mobile Operation:**
1. User scans box barcode: "BOX-001"
2. User scans item barcode: "Running Shoes White 42"
3. Mobile app shows Transfer Order allocation for this item and store
4. User confirms sort quantity
5. Item is sorted into box

**API Call (Mobile â†’ Backend - Via Events):**
```
POST /api/events/batch
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "SORT_TO_BOX",
      "event_time": "2025-12-27T11:00:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-002",
      "advance_shipping_notice": "ASN-0001",
      "transfer_order": "TO-0001",
      "box_id": "BOX-001",
      "store": "SHOWROOM-001",
      "item_code": "Running Shoes White 42",
      "qty": 50.00,
      "notes": "Sorted to box"
    }
  ]
}
```

**Response JSON:**
```json
{
  "ok": true,
  "processed": 1,
  "failed": 0
}
```

---

### Step 5: Mobile App - Close Box

**Mobile Action:** User closes box when all items are sorted

**API Call (Mobile â†’ Backend):**
```
POST /api/boxes/BOX-001/close
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "closed_by": "USER-002"
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Box closed successfully"
}
```

---

### Step 6: Desktop/Mobile - Create Transfer Carton

**Action:** User creates Transfer Carton to pack boxes for dispatch

**API Call:**
```
POST /api/transfer-cartons
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "tc_id": "TC-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "SHOWROOM-001",
  "user_id": "USER-001"
}
```

**Response JSON:**
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

---

### Step 7: Mobile App - Pack Box to Transfer Carton

**Mobile Action:** User packs closed boxes into Transfer Carton

**API Call (Mobile â†’ Backend - Via Events):**
```
POST /api/events/batch
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440002",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-12-27T12:00:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-002",
      "box_id": "BOX-001",
      "tc_id": "TC-001-001",
      "store": "SHOWROOM-001",
      "notes": "Box packed to transfer carton"
    }
  ]
}
```

---

### Step 8: Desktop/Mobile - View Transfer Cartons

**API Call:**
```
GET /api/master/transfer-cartons?asn=ASN-0001&store=SHOWROOM-001
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "tc_id": "TC-001-001",
    "status": "Created",
    "asn_no": "ASN-0001",
    "to_no": "TO-0001",
    "store": "SHOWROOM-001",
    "created_by": "USER-001",
    "created_on": "2025-12-27T10:30:23.000Z",
    "sealed_by": null,
    "sealed_on": null,
    "dispatched_on": null
  }
]
```

---

### Step 9: Desktop/Mobile - Seal and Dispatch Transfer Carton

**Action:** User seals Transfer Carton and marks as dispatched to showroom

**API Call:**
```
POST /api/transfer-cartons/TC-001-001/seal
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "sealed_by": "USER-001",
  "dispatched_on": "2025-12-27T14:00:00Z"
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Transfer carton sealed and dispatched successfully"
}
```

---

## 2.6 Complete ASN Receiving Flow Summary

**Mobile App Flow:**
1. View ASN list (`GET /api/master/asns`)
2. Create inbound session (`POST /api/inbound/update`)
3. Unload cartons (`POST /api/cartons/update-status` with status="Unloaded")
4. Lock carton (`POST /api/cartons/update-status` with status="Receiving")
5. Receive items (`POST /api/inbound/receive-lines`)
6. Mark carton received (`POST /api/cartons/update-status` with status="Received")
7. Complete session (`POST /api/inbound/complete`)

**Routing Decision:**
- **If Transfer Order exists:** Go to Sorting â†’ Transfer Carton â†’ Dispatch to Showroom
- **If No Transfer Order:** Go to Putaway (Storage)

---

# 3. Putaway Workflow (Updated)

## 3.1 Overview

**Purpose:** Store received items in warehouse bin locations for future use.

**Sources:**
- ASN items (when no Transfer Order exists or remaining items after sorting)
- Transfer In items (always goes to Putaway)

---

## 3.2 Mobile App - View Putaway Tasks

**Mobile Action:** Warehouse staff views available putaway tasks

**API Call (Mobile â† Backend):**
```
GET /api/putaway/tasks?status=Open&source_type=ASN
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "title": "PUT-0001",
    "status": "Open",
    "source_type": "ASN",
    "advance_shipping_notice": "ASN-0001",
    "transfer_in": null,
    "warehouse": "WH-MAIN",
    "items": [
      {
        "item_code": "Running Shoes White 42",
        "qty": 50.00,
        "source_bin": "DOCK-01",
        "target_bin": "RACK-A-01-BIN-05"
      }
    ]
  }
]
```

---

## 3.3 Mobile App - Filter Putaway Tasks by Source

### Filter by ASN Source
```
GET /api/putaway/tasks?status=Open&source_type=ASN&advance_shipping_notice=ASN-0001
Authorization: Bearer <token>
```

### Filter by Transfer In Source
```
GET /api/putaway/tasks?status=Open&source_type=TransferIn&transfer_in=TI-0001
Authorization: Bearer <token>
```

---

## 3.4 Mobile App - Assign Rack/Bin for Putaway

**Mobile Action:** User assigns target bin location for items

**API Call (Mobile â†’ Backend):**
```
POST /api/putaway/assign-rack
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "putaway_task": "PUT-0001",
  "carton_id": "CTN-0101",
  "item_code": "Running Shoes White 42",
  "rack": "RACK-A",
  "bin": "BIN-05",
  "qty": 50.00,
  "user_id": "USER-002"
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Rack assigned successfully"
}
```

---

## 3.5 Mobile App - Complete Putaway

**Mobile Action:** User physically moves items and confirms putaway completion

**API Call (Mobile â†’ Backend):**
```
POST /api/putaway/complete
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "putaway_task": "PUT-0001",
  "performed_by": "USER-002",
  "items": [
    {
      "item_code": "Running Shoes White 42",
      "qty": 50.00,
      "source_bin": "DOCK-01",
      "target_bin": "RACK-A-01-BIN-05",
      "completed": true
    }
  ]
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-0001",
    "status": "Completed",
    "stock_updated": true
  }
}
```

---

## 3.6 Putaway Source Types

**Putaway tasks can have two source types:**

1. **ASN (Supplier Receiving)**
   - `source_type`: "ASN"
   - `advance_shipping_notice`: "ASN-0001"
   - `transfer_in`: null
   - **Routing:** Items that have no Transfer Order or remaining items after sorting

2. **Transfer In (Showroom to Warehouse)**
   - `source_type`: "Transfer In"
   - `advance_shipping_notice`: null
   - `transfer_in`: "TI-0001"
   - **Routing:** Transfer In items **always** go to Putaway (not Sorting)

---

# 4. Material Request Workflow (Warehouse to Showroom)

## 4.1 Overview

**Flow:** Showroom requests items â†’ Material Request created â†’ Warehouse picks items â†’ Items dispatched to Showroom

**Note:** Material Request is created in ERPNext (Showroom requests items from Warehouse) and synced to WMS system.

---

## 4.2 Desktop Application - Material Request Management

### Step 1: Material Request Sync from ERPNext

**Desktop Operation:**
- Material Request is synced from ERPNext to Desktop application
- Material Request contains items requested by showroom from warehouse
- Desktop app stores Material Request data in local database

**Note:** Material Request data is typically synced automatically via scheduled sync job.

---

### Step 2: View Material Request List

**API Call (Desktop â† Backend):**
```
GET /api/material-requests?status=Submitted&from_warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "title": "MR-0001",
    "status": "Submitted",
    "from_warehouse": "WH-MAIN",
    "to_showroom": "SHOWROOM-001",
    "request_date": "2025-12-27",
    "required_date": "2025-12-28",
    "requested_by": "USER-003",
    "total_requested_qty": 35.00,
    "total_picked_qty": 0.00,
    "items": [
      {
        "item_code": "Running Shoes White 42",
        "requested_qty": 20.00,
        "picked_qty": 0.00
      },
      {
        "item_code": "Shirt 001 Wht M",
        "requested_qty": 15.00,
        "picked_qty": 0.00
      }
    ],
    "created_at": "2025-12-27T08:00:00.000Z",
    "updated_at": "2025-12-27T08:00:00.000Z"
  }
]
```

---

### Step 3: View Single Material Request

**API Call (Desktop â† Backend):**
```
GET /api/material-requests/MR-0001
Authorization: Bearer <token>
```

**Response JSON:** (Same format as Step 2, single object)

---

## 4.3 Mobile Application - Picking Workflow

### Step 1: Mobile App - View Material Request List

**Mobile Action:** Warehouse staff opens Material Request list

**API Call (Mobile â† Backend):**
```
GET /api/material-requests?status=Submitted&from_warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Response JSON:** (Same as Desktop Step 2)

---

### Step 2: Mobile App - View Material Request Details

**Mobile Action:** User taps on Material Request to view details

**API Call (Mobile â† Backend):**
```
GET /api/material-requests/MR-0001
Authorization: Bearer <token>
```

**Response JSON:**
```json
{
  "title": "MR-0001",
  "status": "Submitted",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "SHOWROOM-001",
  "request_date": "2025-12-27",
  "required_date": "2025-12-28",
  "requested_by": "USER-003",
  "total_requested_qty": 35.00,
  "total_picked_qty": 0.00,
  "items": [
    {
      "item_code": "Running Shoes White 42",
      "requested_qty": 20.00,
      "picked_qty": 0.00
    },
    {
      "item_code": "Shirt 001 Wht M",
      "requested_qty": 15.00,
      "picked_qty": 0.00
    }
  ],
  "created_at": "2025-12-27T08:00:00.000Z",
  "updated_at": "2025-12-27T08:00:00.000Z"
}
```

---

### Step 3: Mobile App - Check Stock Availability

**Mobile Action:** User checks available stock before picking

**API Call (Mobile â† Backend):**
```
GET /api/stock-ledger/Running Shoes White 42/WH-MAIN
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "item_code": "Running Shoes White 42",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty": 100.00,
    "reserved_qty": 0.00,
    "available_qty": 100.00,
    "last_transaction_date": "2025-12-27T10:30:00.000Z",
    "last_transaction_type": "Putaway",
    "last_transaction_ref": "PUT-0001"
  }
]
```

---

### Step 4: Mobile App - Pick Items

**Mobile Action:** Warehouse staff picks items from bins

**Mobile Operation:**
1. User opens Material Request "MR-0001"
2. User starts picking process
3. Scans item barcode: "Running Shoes White 42"
4. Mobile app shows:
   - Requested: 20.00
   - Available Stock: 100.00 (from Stock Ledger)
   - Bin Locations with available stock
5. User scans bin location: "RACK-A-01-BIN-05"
6. User enters picked quantity: 20.00
7. Confirms pick
8. Repeats for next item: "Shirt 001 Wht M"
9. User marks Material Request as "Completed"

**API Call (Mobile â†’ Backend):**
```
POST /api/wms-transactions
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "operation_type": "MaterialRequest",
  "reference_doc": "MR-0001",
  "reference_doc_type": "Material Request",
  "warehouse": "WH-MAIN",
  "performed_by": "USER-004",
  "details": [
    {
      "item_code": "Running Shoes White 42",
      "qty": 20.00,
      "source_bin": "RACK-A-01-BIN-05",
      "target_bin": "DOCK-01",
      "assignment_status": "Completed"
    },
    {
      "item_code": "Shirt 001 Wht M",
      "qty": 15.00,
      "source_bin": "RACK-A-02-BIN-10",
      "target_bin": "DOCK-01",
      "assignment_status": "Completed"
    }
  ]
}
```

**Response JSON:**
```json
{
  "ok": true,
  "message": "Material Request picking completed",
  "data": {
    "material_request": "MR-0001",
    "status": "Completed",
    "total_picked_qty": 35.00
  }
}
```

---

## 4.4 Transfer Material to Showroom (Dispatch)

### Step 1: Desktop/Mobile - View Picked Items

**Action:** User views picked items ready for dispatch

**API Call:**
```
GET /api/material-requests/MR-0001
Authorization: Bearer <token>
```

**Response JSON:**
```json
{
  "title": "MR-0001",
  "status": "In Progress",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "SHOWROOM-001",
  "request_date": "2025-12-27",
  "required_date": "2025-12-28",
  "requested_by": "USER-003",
  "total_requested_qty": 35.00,
  "total_picked_qty": 35.00,
  "items": [
    {
      "item_code": "Running Shoes White 42",
      "requested_qty": 20.00,
      "picked_qty": 20.00
    },
    {
      "item_code": "Shirt 001 Wht M",
      "requested_qty": 15.00,
      "picked_qty": 15.00
    }
  ],
  "created_at": "2025-12-27T08:00:00.000Z",
  "updated_at": "2025-12-27T14:30:00.000Z"
}
```

---

### Step 2: Desktop/Mobile - Create Dispatch Document

**Action:** User creates dispatch document for Material Request

**Note:** This step may be handled in ERPNext or WMS system depending on integration setup. The Material Request status should be updated to "Dispatched" when items are shipped to showroom.

---

### Step 3: Mobile App - Confirm Dispatch

**Mobile Action:** User confirms items have been dispatched to showroom

**API Call (Mobile â†’ Backend - Update Status):**
```
POST /api/material-requests/MR-0001/update-status
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "status": "Dispatched",
  "dispatched_by": "USER-004",
  "dispatched_on": "2025-12-27T16:00:00Z"
}
```

**Note:** This endpoint may need to be implemented. Alternatively, status update can be done via ERPNext sync.

---

## 4.5 Complete Material Request Flow Summary

**Mobile App Flow:**
1. View Material Request list (`GET /api/material-requests`)
2. View Material Request details (`GET /api/material-requests/:title`)
3. Check stock availability (`GET /api/stock-ledger/:item_code/:warehouse`)
4. Pick items (`POST /api/wms-transactions` with operation_type="MaterialRequest")
5. Confirm dispatch (Update Material Request status)

**Stock Update:**
- Stock decreases from warehouse bins after picking
- Stock Ledger automatically updated
- Stock Transaction log created

---

# 5. Transfer In Workflow (Showroom to Warehouse)

## 5.1 Overview

**Flow:** Showroom â†’ Transfer Out (in ERPNext) â†’ Transfer In (in WMS) â†’ Receiving â†’ Putaway

**Important Note:** 
- **Transfer Out** document is created in ERPNext (Showroom transfers items to Warehouse)
- **Transfer In** document is created in WMS system (Warehouse receives items from Showroom)
- Transfer In items **always** go to Putaway (not Sorting)

---

## 5.2 Desktop Application - Transfer In Management

### Step 1: Transfer Out Sync from ERPNext

**Desktop Operation:**
- Transfer Out document is created in ERPNext (Showroom transfers items to Warehouse)
- Transfer Out is synced to Desktop application as Transfer In
- Desktop app stores Transfer In data in local database

**Note:** Transfer Out data from ERPNext is synced automatically via scheduled sync job and becomes Transfer In in WMS system.

---

### Step 2: Create Transfer In Document (if not synced)

**Desktop Action:** User creates a new Transfer In document in the Desktop application (if not synced from ERPNext)

**Desktop Operation:**
- User navigates to "Transfer In" menu
- Clicks "New Transfer In"
- Enters:
  - From Showroom
  - To Warehouse
  - Transfer Date
  - Expected Arrival Date
  - Adds items with quantities
- Saves document (status: "Draft")

---

### Step 3: Submit Transfer In (Desktop â†’ API)

**Desktop Action:** User submits Transfer In document

**API Call (Desktop â†’ Backend):**
```
POST /api/transfer-in
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
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
      "item_code": "Running Shoes White 42",
      "qty": 50.00,
      "carton_id": "CTN-TI-001"
    },
    {
      "item_code": "Shirt 001 Wht M",
      "qty": 30.00,
      "carton_id": "CTN-TI-002"
    }
  ]
}
```

**Response JSON:**
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

---

## 5.3 Mobile Application - Receiving Workflow

### Step 1: Mobile App - View Transfer In List

**Mobile Action:** Warehouse staff opens Transfer In list in mobile app

**API Call (Mobile â† Backend):**
```
GET /api/transfer-in?status=Submitted&to_warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Response JSON:**
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
        "item_code": "Running Shoes White 42",
        "qty": 50.00,
        "carton_id": "CTN-TI-001",
        "received_qty": 0.00
      },
      {
        "item_code": "Shirt 001 Wht M",
        "qty": 30.00,
        "carton_id": "CTN-TI-002",
        "received_qty": 0.00
      }
    ],
    "created_at": "2025-12-27T08:00:00.000Z",
    "updated_at": "2025-12-27T08:00:00.000Z"
  }
]
```

---

### Step 2: Mobile App - View Single Transfer In

**Mobile Action:** User taps on a Transfer In to view details

**API Call (Mobile â† Backend):**
```
GET /api/transfer-in/TI-0001
Authorization: Bearer <token>
```

**Response JSON:** (Same format as Step 1, single object)

---

### Step 3: Mobile App - Receive Transfer In Items

**Mobile Action:** Warehouse staff receives items and scans cartons

**Mobile Operation:**
1. User opens Transfer In "TI-0001"
2. Scans carton ID "CTN-TI-001"
3. Mobile app displays item: "Running Shoes White 42, Qty: 50"
4. User confirms receipt
5. Scans next carton "CTN-TI-002"
6. User confirms receipt
7. User marks Transfer In as "Received"

**API Call (Mobile â†’ Backend):**
```
POST /api/inbound/update
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "transfer_in": "TI-0001",
  "received_by": "USER-002",
  "items": [
    {
      "carton_id": "CTN-TI-001",
      "item_code": "Running Shoes White 42",
      "received_qty": 50.00
    },
    {
      "carton_id": "CTN-TI-002",
      "item_code": "Shirt 001 Wht M",
      "received_qty": 30.00
    }
  ]
}
```

**Note:** The inbound API handles both ASN and Transfer In receiving. The `transfer_in` field indicates this is a Transfer In receipt.

**Response JSON:**
```json
{
  "ok": true,
  "message": "Transfer In received successfully",
  "data": {
    "transfer_in": "TI-0001",
    "status": "Received",
    "received_by": "USER-002",
    "received_on": "2025-12-27T10:30:00.000Z"
  }
}
```

---

### Step 4: Putaway (Transfer In Always Goes to Putaway)

**Desktop/Mobile Action:** After receiving Transfer In, items are putaway

**Note:** Transfer In items always route to Putaway (not Sorting), as there's no Transfer Order associated with Transfer In.

**API Call (Mobile â† Backend - Get Putaway Tasks):**
```
GET /api/putaway/tasks?status=Open&source_type=TransferIn&transfer_in=TI-0001
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "title": "PUT-0001",
    "status": "Open",
    "source_type": "Transfer In",
    "transfer_in": "TI-0001",
    "warehouse": "WH-MAIN",
    "items": [
      {
        "item_code": "Running Shoes White 42",
        "qty": 50.00,
        "source_bin": "DOCK-01",
        "target_bin": "RACK-A-01-BIN-05"
      }
    ]
  }
]
```

**Then complete putaway using Putaway API (see Section 3).**

---

## 5.4 Complete Transfer In Flow Summary

**Desktop Flow:**
1. Transfer Out created in ERPNext (or manually in Desktop)
2. Synced as Transfer In to WMS
3. Submit Transfer In (`POST /api/transfer-in`)

**Mobile Flow:**
1. View Transfer In list (`GET /api/transfer-in`)
2. View Transfer In details (`GET /api/transfer-in/:title`)
3. Receive items (`POST /api/inbound/update` with `transfer_in` field)
4. View putaway tasks (`GET /api/putaway/tasks?source_type=TransferIn`)
5. Complete putaway (`POST /api/putaway/complete`)

---

# 6. Cycle Count Workflow

## 6.1 Overview

**Purpose:** Physically count items in warehouse to verify stock accuracy and identify discrepancies.

**Types:**
- **Full Count:** Count entire warehouse
- **Cycle Count:** Count specific zones/areas on schedule
- **Spot Count:** Count specific items/bins as needed

---

## 6.2 Desktop Application - Cycle Count Management

### Step 1: Create Cycle Count Task

**Desktop Action:** Warehouse manager creates Cycle Count task

**Desktop Operation:**
- User navigates to "Cycle Count" menu
- Clicks "New Cycle Count"
- Enters:
  - Count Type (Full, Cycle, Spot)
  - Warehouse
  - Zone (optional)
  - Count Date
  - Scheduled Start/End Time
  - Adds items with expected quantities
- Saves document (status: "Draft")

---

### Step 2: Submit Cycle Count Task (Desktop â†’ API)

**Desktop Action:** User submits Cycle Count task

**API Call (Desktop â†’ Backend):**
```
POST /api/cycle-count
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
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
  "assigned_to": "USER-005",
  "lines": [
    {
      "item_code": "Running Shoes White 42",
      "bin_location": "RACK-A-01-BIN-05",
      "expected_qty": 100.00
    },
    {
      "item_code": "Shirt 001 Wht M",
      "bin_location": "RACK-A-02-BIN-10",
      "expected_qty": 30.00
    }
  ]
}
```

**Response JSON:**
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

---

## 6.3 Mobile Application - Counting Workflow

### Step 1: Mobile App - View Cycle Count Tasks

**Mobile Action:** Warehouse staff opens Cycle Count task list

**API Call (Mobile â† Backend):**
```
GET /api/cycle-count?status=Scheduled&warehouse=WH-MAIN&assigned_to=USER-005
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "title": "CC-0001",
    "status": "Scheduled",
    "count_type": "Cycle",
    "warehouse": "WH-MAIN",
    "zone": "ZONE-A",
    "count_date": "2025-12-27",
    "scheduled_start_time": "09:00:00",
    "scheduled_end_time": "17:00:00",
    "freeze_stock": false,
    "created_by": "USER-001",
    "assigned_to": "USER-005",
    "total_items": 2,
    "counted_items": 0,
    "items_with_discrepancy": 0,
    "lines": [
      {
        "id": 1,
        "item_code": "Running Shoes White 42",
        "bin_location": "RACK-A-01-BIN-05",
        "expected_qty": 100.00,
        "actual_qty": null,
        "discrepancy": null,
        "counted_by": null,
        "counted_on": null,
        "status": "Pending"
      },
      {
        "id": 2,
        "item_code": "Shirt 001 Wht M",
        "bin_location": "RACK-A-02-BIN-10",
        "expected_qty": 30.00,
        "actual_qty": null,
        "discrepancy": null,
        "counted_by": null,
        "counted_on": null,
        "status": "Pending"
      }
    ],
    "created_at": "2025-12-27T08:00:00.000Z",
    "updated_at": "2025-12-27T08:00:00.000Z"
  }
]
```

---

### Step 2: Mobile App - View Single Cycle Count Task

**Mobile Action:** User taps on Cycle Count task to view details

**API Call (Mobile â† Backend):**
```
GET /api/cycle-count/CC-0001
Authorization: Bearer <token>
```

**Response JSON:** (Same as Step 1, single object)

---

### Step 3: Mobile App - Count Items

**Mobile Action:** Warehouse staff physically counts items

**Mobile Operation:**
1. User opens Cycle Count task "CC-0001"
2. User starts counting
3. Scans item barcode: "Running Shoes White 42"
4. Mobile app shows:
   - Expected Qty: 100.00
   - Bin Location: RACK-A-01-BIN-05
5. User physically counts items: 98.00
6. User enters actual quantity: 98.00
7. Mobile app calculates discrepancy: -2.00
8. User confirms count
9. Repeats for next item: "Shirt 001 Wht M" (Expected: 30.00, Actual: 32.00)
10. User submits counts

**API Call (Mobile â†’ Backend - Update Count):**
```
POST /api/cycle-count/CC-0001/count
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "counted_by": "USER-005",
  "lines": [
    {
      "id": 1,
      "actual_qty": 98.00,
      "notes": "2 units damaged"
    },
    {
      "id": 2,
      "actual_qty": 32.00,
      "notes": "Found 2 extra units"
    }
  ]
}
```

**Note:** This endpoint needs to be implemented. Current implementation may need update endpoint.

**Response JSON:**
```json
{
  "ok": true,
  "message": "Cycle Count updated successfully",
  "data": {
    "title": "CC-0001",
    "status": "In Progress",
    "counted_items": 2,
    "items_with_discrepancy": 2
  }
}
```

---

## 6.4 Desktop Application - Review and Approval

### Step 1: Desktop App - Review Discrepancies

**Desktop Action:** Warehouse manager reviews discrepancies

**API Call (Desktop â† Backend):**
```
GET /api/cycle-count/CC-0001
Authorization: Bearer <token>
```

**Response JSON:**
```json
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
  "assigned_to": "USER-005",
  "total_items": 2,
  "counted_items": 2,
  "items_with_discrepancy": 2,
  "lines": [
    {
      "id": 1,
      "item_code": "Running Shoes White 42",
      "bin_location": "RACK-A-01-BIN-05",
      "expected_qty": 100.00,
      "actual_qty": 98.00,
      "discrepancy": -2.00,
      "counted_by": "USER-005",
      "counted_on": "2025-12-27T10:30:00.000Z",
      "reviewed_by": null,
      "reviewed_on": null,
      "approval_required": true,
      "approved_by": null,
      "approved_on": null,
      "discrepancy_reason": null,
      "status": "Counted"
    },
    {
      "id": 2,
      "item_code": "Shirt 001 Wht M",
      "bin_location": "RACK-A-02-BIN-10",
      "expected_qty": 30.00,
      "actual_qty": 32.00,
      "discrepancy": 2.00,
      "counted_by": "USER-005",
      "counted_on": "2025-12-27T10:35:00.000Z",
      "reviewed_by": null,
      "reviewed_on": null,
      "approval_required": true,
      "approved_by": null,
      "approved_on": null,
      "discrepancy_reason": null,
      "status": "Counted"
    }
  ],
  "created_at": "2025-12-27T08:00:00.000Z",
  "updated_at": "2025-12-27T10:35:00.000Z"
}
```

---

### Step 2: Desktop App - Approve and Adjust Stock

**Desktop Action:** Manager approves discrepancies and adjusts stock

**API Call (Desktop â†’ Backend - Approve and Adjust):**
```
POST /api/cycle-count/CC-0001/approve
Authorization: Bearer <token>
Content-Type: application/json
```

**Request JSON:**
```json
{
  "approved_by": "USER-001",
  "lines": [
    {
      "id": 1,
      "approved": true,
      "discrepancy_reason": "Damaged units identified during count",
      "adjust_stock": true
    },
    {
      "id": 2,
      "approved": true,
      "discrepancy_reason": "Extra units found in bin",
      "adjust_stock": true
    }
  ]
}
```

**Note:** This endpoint needs to be implemented. Stock adjustment should update Stock Ledger.

**Response JSON:**
```json
{
  "ok": true,
  "message": "Cycle Count approved and stock adjusted",
  "data": {
    "title": "CC-0001",
    "status": "Completed",
    "stock_adjusted": true
  }
}
```

---

## 6.5 Complete Cycle Count Flow Summary

**Desktop Flow:**
1. Create Cycle Count task (`POST /api/cycle-count`)
2. Review discrepancies (`GET /api/cycle-count/:title`)
3. Approve and adjust stock (`POST /api/cycle-count/:title/approve`)

**Mobile Flow:**
1. View Cycle Count tasks (`GET /api/cycle-count`)
2. View Cycle Count details (`GET /api/cycle-count/:title`)
3. Submit counts (`POST /api/cycle-count/:title/count` - needs implementation)
4. View updated task (`GET /api/cycle-count/:title`)

---

# 7. Stock Ledger Queries

## 7.1 Overview

**Purpose:** View real-time stock quantities by Item + Warehouse + Bin Location.

**Note:** Stock Ledger is read-only (automatically updated by transactions). No POST endpoints available.

---

## 7.2 Desktop Application - View Stock Ledger

### View All Stock Ledger Entries

**API Call (Desktop â† Backend):**
```
GET /api/stock-ledger?warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "item_code": "Running Shoes White 42",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty": 98.00,
    "reserved_qty": 0.00,
    "available_qty": 98.00,
    "last_transaction_date": "2025-12-27T14:30:00.000Z",
    "last_transaction_type": "CycleCount",
    "last_transaction_ref": "CC-0001",
    "updated_at": "2025-12-27T14:30:00.000Z",
    "created_at": "2025-12-27T10:30:00.000Z"
  },
  {
    "item_code": "Running Shoes White 42",
    "warehouse": "WH-MAIN",
    "bin_location": null,
    "qty": 50.00,
    "reserved_qty": 0.00,
    "available_qty": 50.00,
    "last_transaction_date": "2025-12-27T10:30:00.000Z",
    "last_transaction_type": "Receiving",
    "last_transaction_ref": "TI-0001",
    "updated_at": "2025-12-27T10:30:00.000Z",
    "created_at": "2025-12-27T10:30:00.000Z"
  }
]
```

**Note:** `bin_location: null` indicates warehouse-level stock (at dock, not yet putaway).

---

### Filter by Item Code

**API Call:**
```
GET /api/stock-ledger?item_code=Running Shoes White 42&warehouse=WH-MAIN
Authorization: Bearer <token>
```

---

### Filter by Bin Location

**API Call:**
```
GET /api/stock-ledger?warehouse=WH-MAIN&bin_location=RACK-A-01-BIN-05
Authorization: Bearer <token>
```

---

## 7.3 Mobile Application - Check Stock

### Check Stock for Specific Item

**Mobile Action:** User checks stock before picking or counting

**API Call (Mobile â† Backend):**
```
GET /api/stock-ledger/Running Shoes White 42/WH-MAIN
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "item_code": "Running Shoes White 42",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty": 98.00,
    "reserved_qty": 0.00,
    "available_qty": 98.00,
    "last_transaction_date": "2025-12-27T14:30:00.000Z",
    "last_transaction_type": "CycleCount",
    "last_transaction_ref": "CC-0001",
    "updated_at": "2025-12-27T14:30:00.000Z",
    "created_at": "2025-12-27T10:30:00.000Z"
  },
  {
    "item_code": "Running Shoes White 42",
    "warehouse": "WH-MAIN",
    "bin_location": null,
    "qty": 50.00,
    "reserved_qty": 0.00,
    "available_qty": 50.00,
    "last_transaction_date": "2025-12-27T10:30:00.000Z",
    "last_transaction_type": "Receiving",
    "last_transaction_ref": "TI-0001",
    "updated_at": "2025-12-27T10:30:00.000Z",
    "created_at": "2025-12-27T10:30:00.000Z"
  }
]
```

---

## 7.4 Stock Ledger Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `warehouse` | Query | Filter by warehouse | `?warehouse=WH-MAIN` |
| `item_code` | Query | Filter by item code | `?item_code=Running Shoes White 42` |
| `bin_location` | Query | Filter by bin location (use `null` for warehouse-level) | `?bin_location=RACK-A-01-BIN-05` |

**Path Parameters (Alternative):**
- `GET /api/stock-ledger/:item_code/:warehouse` - Get stock by item and warehouse

---

# 8. Stock Transaction Audit Trail

## 8.1 Overview

**Purpose:** View complete audit trail of all stock movements for reporting and reconciliation.

**Note:** Stock Transactions are read-only (automatically created by transactions). No POST endpoints available.

---

## 8.2 Desktop Application - View Stock Transactions

### View All Stock Transactions

**API Call (Desktop â† Backend):**
```
GET /api/stock-transactions?warehouse=WH-MAIN&limit=100
Authorization: Bearer <token>
```

**Response JSON:**
```json
[
  {
    "id": 15,
    "transaction_date": "2025-12-27T14:30:00.000Z",
    "transaction_type": "CycleCount",
    "reference_doc_type": "Cycle Count Task",
    "reference_doc": "CC-0001",
    "wms_transaction_title": null,
    "item_code": "Running Shoes White 42",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty_change": -2.00,
    "qty_before": 100.00,
    "qty_after": 98.00,
    "source_bin": null,
    "target_bin": null,
    "performed_by": "USER-001",
    "notes": "Stock adjustment after cycle count",
    "created_at": "2025-12-27T14:30:00.000Z"
  },
  {
    "id": 14,
    "transaction_date": "2025-12-27T10:30:00.000Z",
    "transaction_type": "Putaway",
    "reference_doc_type": "Putaway Task",
    "reference_doc": "PUT-0001",
    "wms_transaction_title": "WMS-PUT-0001",
    "item_code": "Running Shoes White 42",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty_change": 50.00,
    "qty_before": 50.00,
    "qty_after": 100.00,
    "source_bin": "DOCK-01",
    "target_bin": "RACK-A-01-BIN-05",
    "performed_by": "USER-002",
    "notes": null,
    "created_at": "2025-12-27T10:30:00.000Z"
  }
]
```

---

### Filter by Item Code

**API Call:**
```
GET /api/stock-transactions?item_code=Running Shoes White 42&warehouse=WH-MAIN&limit=100
Authorization: Bearer <token>
```

---

### Filter by Transaction Type

**API Call:**
```
GET /api/stock-transactions?transaction_type=Putaway&warehouse=WH-MAIN&limit=100
Authorization: Bearer <token>
```

**Transaction Types:**
- `Receiving` - Items received from supplier or showroom
- `Putaway` - Items moved to storage bins
- `Picking` - Items picked for dispatch
- `CycleCount` - Stock adjustments from cycle count
- `TransferIn` - Items received via Transfer In
- `MaterialRequest` - Items picked for Material Request

---

### Filter by Date Range

**API Call:**
```
GET /api/stock-transactions?warehouse=WH-MAIN&from_date=2025-12-27&to_date=2025-12-27&limit=1000
Authorization: Bearer <token>
```

---

### Filter by Reference Document

**API Call:**
```
GET /api/stock-transactions?reference_doc=CC-0001&limit=100
Authorization: Bearer <token>
```

---

## 8.3 Mobile Application - View Recent Transactions

### View Recent Stock Transactions

**Mobile Action:** User views recent stock movements for an item

**API Call (Mobile â† Backend):**
```
GET /api/stock-transactions?item_code=Running Shoes White 42&warehouse=WH-MAIN&limit=20
Authorization: Bearer <token>
```

**Response JSON:** (Same format as Desktop, limited to 20 records)

---

## 8.4 Stock Transaction Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `warehouse` | Query | Filter by warehouse | `?warehouse=WH-MAIN` |
| `item_code` | Query | Filter by item code | `?item_code=Running Shoes White 42` |
| `transaction_type` | Query | Filter by transaction type | `?transaction_type=Putaway` |
| `reference_doc` | Query | Filter by reference document | `?reference_doc=CC-0001` |
| `from_date` | Query | Filter from date (YYYY-MM-DD) | `?from_date=2025-12-27` |
| `to_date` | Query | Filter to date (YYYY-MM-DD) | `?to_date=2025-12-27` |
| `limit` | Query | Limit results (default: 1000) | `?limit=100` |

---

# 9. Complete API Reference Summary

## 9.1 Authentication APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| POST | `/api/auth/login` | Login and get token | Desktop, Mobile |

---

## 9.2 Supplier Receiving (ASN) APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| GET | `/api/master/asns` | List all ASNs | Desktop, Mobile |
| GET | `/api/asn/:asn_no` | Get single ASN | Desktop, Mobile |
| POST | `/api/inbound/update` | Create inbound session | Mobile |
| POST | `/api/cartons/update-status` | Update carton status | Mobile |
| POST | `/api/inbound/receive-lines` | Receive items | Mobile |
| POST | `/api/inbound/complete` | Complete inbound session | Mobile |
| GET | `/api/inbound/sessions` | Get inbound sessions | Desktop, Mobile |
| GET | `/api/transfer-order/by-asn/:asn_no` | Get transfer order by ASN | Desktop, Mobile |

---

## 9.3 Sorting & Transfer Carton APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| POST | `/api/boxes/create` | Create sort box | Desktop, Mobile |
| GET | `/api/boxes` | Get boxes | Desktop, Mobile |
| POST | `/api/boxes/:box_id/close` | Close box | Mobile |
| GET | `/api/boxes/:box_id/contents` | Get box contents | Desktop, Mobile |
| POST | `/api/transfer-cartons` | Create transfer carton | Desktop, Mobile |
| GET | `/api/master/transfer-cartons` | Get transfer cartons | Desktop, Mobile |
| POST | `/api/transfer-cartons/:tc_id/seal` | Seal and dispatch | Desktop, Mobile |
| POST | `/api/events/batch` | Send scan events | Mobile |

---

## 9.4 Putaway APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| GET | `/api/putaway/tasks` | Get putaway tasks (supports source_type filter) | Desktop, Mobile |
| POST | `/api/putaway/assign-rack` | Assign rack/bin | Mobile |
| POST | `/api/putaway/complete` | Complete putaway task | Mobile |

---

## 9.5 Material Request APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| GET | `/api/material-requests` | List all Material Requests | Desktop, Mobile |
| GET | `/api/material-requests/:title` | Get single Material Request | Desktop, Mobile |
| POST | `/api/material-requests` | Create Material Request | Desktop |
| POST | `/api/wms-transactions` | Pick items (operation_type="MaterialRequest") | Mobile |

---

## 9.6 Transfer In APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| GET | `/api/transfer-in` | List all Transfer Ins | Desktop, Mobile |
| GET | `/api/transfer-in/:title` | Get single Transfer In | Desktop, Mobile |
| POST | `/api/transfer-in` | Create Transfer In | Desktop |
| POST | `/api/inbound/update` | Receive Transfer In items | Mobile |

---

## 9.7 Cycle Count APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| GET | `/api/cycle-count` | List all Cycle Count tasks | Desktop, Mobile |
| GET | `/api/cycle-count/:title` | Get single Cycle Count task | Desktop, Mobile |
| POST | `/api/cycle-count` | Create Cycle Count task | Desktop |
| POST | `/api/cycle-count/:title/count` | Submit counts | Mobile (Needs Implementation) |
| POST | `/api/cycle-count/:title/approve` | Approve and adjust stock | Desktop (Needs Implementation) |

---

## 9.8 Stock Ledger APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| GET | `/api/stock-ledger` | Get all stock ledger entries | Desktop, Mobile |
| GET | `/api/stock-ledger/:item_code/:warehouse` | Get stock by item/warehouse | Desktop, Mobile |

---

## 9.9 Stock Transaction APIs

| Method | Endpoint | Purpose | Used By |
|--------|----------|---------|---------|
| GET | `/api/stock-transactions` | Get stock transaction history | Desktop, Mobile |

---

# 10. Data Models Reference

## 10.1 Transfer In Model

```json
{
  "title": "string (required, unique)",
  "status": "string (Draft, Submitted, In Transit, Received, Completed)",
  "from_showroom": "string (required)",
  "to_warehouse": "string (required)",
  "transfer_date": "date (YYYY-MM-DD, required)",
  "expected_arrival_date": "date (YYYY-MM-DD, optional)",
  "prepared_by": "string (required)",
  "received_by": "string (optional)",
  "received_on": "datetime (optional)",
  "total_qty": "number",
  "items": [
    {
      "item_code": "string (required)",
      "qty": "number (required)",
      "carton_id": "string (optional)",
      "received_qty": "number"
    }
  ]
}
```

---

## 10.2 Material Request Model

```json
{
  "title": "string (required, unique)",
  "status": "string (Draft, Submitted, In Progress, Completed, Cancelled)",
  "from_warehouse": "string (required)",
  "to_showroom": "string (required)",
  "request_date": "date (YYYY-MM-DD, required)",
  "required_date": "date (YYYY-MM-DD, optional)",
  "requested_by": "string (required)",
  "total_requested_qty": "number",
  "total_picked_qty": "number",
  "items": [
    {
      "item_code": "string (required)",
      "requested_qty": "number (required)",
      "picked_qty": "number"
    }
  ]
}
```

---

## 10.3 Cycle Count Task Model

```json
{
  "title": "string (required, unique)",
  "status": "string (Draft, Scheduled, In Progress, Completed, Cancelled)",
  "count_type": "string (Full, Cycle, Spot, required)",
  "warehouse": "string (required)",
  "zone": "string (optional)",
  "count_date": "date (YYYY-MM-DD, required)",
  "scheduled_start_time": "time (HH:MM:SS, optional)",
  "scheduled_end_time": "time (HH:MM:SS, optional)",
  "freeze_stock": "boolean",
  "created_by": "string (required)",
  "assigned_to": "string (optional)",
  "total_items": "integer",
  "counted_items": "integer",
  "items_with_discrepancy": "integer",
  "lines": [
    {
      "id": "integer",
      "item_code": "string (required)",
      "bin_location": "string (optional)",
      "expected_qty": "number (required)",
      "actual_qty": "number (optional)",
      "discrepancy": "number (optional, calculated)",
      "counted_by": "string (optional)",
      "counted_on": "datetime (optional)",
      "reviewed_by": "string (optional)",
      "reviewed_on": "datetime (optional)",
      "approval_required": "boolean",
      "approved_by": "string (optional)",
      "approved_on": "datetime (optional)",
      "discrepancy_reason": "string (optional)",
      "status": "string (Pending, Counted, Reviewed, Approved, Rejected)"
    }
  ]
}
```

---

## 10.4 Stock Ledger Model

```json
{
  "item_code": "string (required)",
  "warehouse": "string (required)",
  "bin_location": "string (optional, null for warehouse-level stock)",
  "qty": "number (required)",
  "reserved_qty": "number",
  "available_qty": "number (calculated: qty - reserved_qty)",
  "last_transaction_date": "datetime (optional)",
  "last_transaction_type": "string (optional)",
  "last_transaction_ref": "string (optional)",
  "updated_at": "datetime",
  "created_at": "datetime"
}
```

---

## 10.5 Stock Transaction Model

```json
{
  "id": "integer",
  "transaction_date": "datetime (required)",
  "transaction_type": "string (Receiving, Putaway, Picking, CycleCount, TransferIn, MaterialRequest, required)",
  "reference_doc_type": "string (optional)",
  "reference_doc": "string (optional)",
  "wms_transaction_title": "string (optional)",
  "item_code": "string (required)",
  "warehouse": "string (required)",
  "bin_location": "string (optional)",
  "qty_change": "number (required, positive for increase, negative for decrease)",
  "qty_before": "number (required)",
  "qty_after": "number (required)",
  "source_bin": "string (optional)",
  "target_bin": "string (optional)",
  "performed_by": "string (optional)",
  "notes": "string (optional)",
  "created_at": "datetime"
}
```

---

# 11. Implementation Notes

## 11.1 Required Endpoints (To Be Implemented)

1. **Cycle Count - Submit Counts**
   - `POST /api/cycle-count/:title/count`
   - Purpose: Submit actual counts from mobile app

2. **Cycle Count - Approve and Adjust**
   - `POST /api/cycle-count/:title/approve`
   - Purpose: Approve discrepancies and adjust stock

3. **Material Request - Update Status**
   - `POST /api/material-requests/:title/update-status`
   - Purpose: Update Material Request status (e.g., Dispatched)

---

## 11.2 Stock Updates

**Stock Ledger is automatically updated by:**
- Receiving operations (ASN, Transfer In)
- Putaway operations
- Picking operations (Material Request, Transfer Orders)
- Cycle Count adjustments (after approval)

**No manual POST to Stock Ledger API needed.**

---

## 11.3 Error Handling

**All APIs return consistent error format:**

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": "Additional details (development only)"
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR`: Invalid request data
- `NOT_FOUND`: Resource not found
- `DUPLICATE_ENTRY`: Duplicate resource creation
- `DATABASE_ERROR`: Database operation failed
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Insufficient permissions

---

# 12. Quick Reference: API Base URLs

**Base URL Format:**
```
https://your-api-domain.com
```

**Example:**
```
https://wms-api.example.com/api/transfer-in
```

**All endpoints are relative to `/api`**

---

# 13. Conclusion

This document provides a comprehensive reference for implementing all WMS workflows in both Desktop and Mobile applications. All API endpoints are documented with request/response JSON examples, and step-by-step workflows are provided for each operation.

**Key Points:**
- All GET endpoints are implemented and ready to use
- All POST endpoints for document creation are implemented
- Some update endpoints (Cycle Count count submission, approval) may need implementation
- Stock Ledger and Stock Transactions are read-only (automatically updated)
- All APIs require authentication token (except login)
- Transfer Out in ERPNext becomes Transfer In in WMS
- ASN items route to Sorting (if Transfer Order exists) or Putaway (if no Transfer Order)
- Transfer In items always route to Putaway

---

**End of Documentation**
