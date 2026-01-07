# Complete Inbound Workflow - API Summary for Mobile App

## 📋 Overview

This document provides a complete summary of the inbound workflow with all required POST and GET APIs, including login. Use this as a reference for implementing the inbound workflow in your mobile app.

---

## 🔐 Step 0: Authentication

### POST /api/auth/login

**Purpose:** User login to get authentication token

**Request:**
```http
POST /api/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_code": "USER-172188",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 604800,
    "user": {
      "user_code": "USER-172188",
      "name": "John Doe"
    }
  }
}
```

**Usage:**
- Store `access_token` for all subsequent API calls
- Include in `Authorization: Bearer {token}` header
- Token expires in 7 days (604800 seconds)

---

## 📦 Step 1: Master Data Sync

### GET /api/master/asns

**Purpose:** Get all ASNs (Advance Shipping Notices) available for inbound

**Request:**
```http
GET /api/master/asns
Authorization: Bearer {token}
```

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
    "total_shipped_qty": 150.0,
    "total_carton_count": 2
  },
  {
    "asn_no": "ASN-0002",
    "status": "Submitted",
    "purchase_order": "PO-2024-002",
    "supplier": "Supplier XYZ",
    "shipment_date": "2024-12-21",
    "expected_arrival_date": "2024-12-26",
    "total_shipped_qty": 200.0,
    "total_carton_count": 3
  }
]
```

**Note:** ASN numbers are returned in their **exact database format** (preserved as-is)

---

### GET /api/asn/:asn_no

**Purpose:** Get detailed ASN information with items and cartons

**Request:**
```http
GET /api/asn/ASN-0001
Authorization: Bearer {token}
```

**Response:**
```json
{
  "asn_no": "ASN-0001",
  "status": "Submitted",
  "purchase_order": "PO-2024-001",
  "supplier": "Supplier ABC",
  "shipment_date": "2024-12-20",
  "expected_arrival_date": "2024-12-25",
  "details": [
    {
      "item_code": "SKU-JEANS-001-BLK-32",
      "po_item_reference": "PO-ITEM-001",
      "shipped_qty": 50,
      "carton_id": "CTN-0101",
      "carton_assigned_status": "Assigned"
    },
    {
      "item_code": "SKU-JEANS-001-BLU-32",
      "po_item_reference": "PO-ITEM-002",
      "shipped_qty": 50,
      "carton_id": "CTN-0101",
      "carton_assigned_status": "Assigned"
    },
    {
      "item_code": "SKU-JEANS-001-BLU-34",
      "po_item_reference": "PO-ITEM-003",
      "shipped_qty": 50,
      "carton_id": "CTN-0102",
      "carton_assigned_status": "Assigned"
    }
  ]
}
```

---

### GET /api/transfer-order/by-asn/:asn_no

**Purpose:** Get Transfer Order associated with an ASN (if exists)

**Request:**
```http
GET /api/transfer-order/by-asn/ASN-0001
Authorization: Bearer {token}
```

**Response:**
```json
{
  "to_no": "TO-0001",
  "status": "Draft",
  "from_warehouse": "WAREHOUSE",
  "to_warehouse": "STORE-001",
  "transfer_order_date": "2024-12-20",
  "expected_delivery_date": "2024-12-27"
}
```

**Note:** Returns `null` if no Transfer Order exists for the ASN

---

### GET /api/master/items

**Purpose:** Get all items master data (for validation and display)

**Request:**
```http
GET /api/master/items
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "item_code": "SKU-JEANS-001-BLK-32",
    "name": "Jeans Black Size 32",
    "item_group": "Apparel",
    "brand": "Brand ABC",
    "default_uom": "Unit",
    "stock_uom": "Unit",
    "barcode": "1234567890123"
  }
]
```

---

### GET /api/master/warehouses-stores

**Purpose:** Get all warehouses and stores (for box creation and filtering)

**Request:**
```http
GET /api/master/warehouses-stores
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "code": "WAREHOUSE",
    "name": "Main Warehouse",
    "warehouse_type": "Warehouse",
    "is_group": 0
  },
  {
    "code": "STORE-001",
    "name": "Store 001",
    "warehouse_type": "Store",
    "is_group": 0
  }
]
```

---

## 🚀 Step 2: Create Inbound Session

### POST /api/inbound/update

**Purpose:** Create or update an inbound session

**Request:**
```http
POST /api/inbound/update
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 0,
  "total_cartons": 2,
  "transfer_order": null,
  "dock": "DOCK-01",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Alternative Field Names (Mobile App Format):**
- `asn_no` (preferred) or `advance_shipping_notice`
- `user_id` (preferred) or `started_by`
- `transfer_order` or `to_no`

**Response:**
```json
{
  "ok": true,
  "message": "Session created successfully",
  "action": "created"
}
```

**Backend Actions:**
- Creates/updates `tabInboundSession` record (UPSERT logic)
- Sets `status = "Active"`
- Sets `started_at = NOW()`
- Sets `started_by = user_id` (or `user_id` if column exists)

**Note:** Use consistent `inbound_session` ID for same session to enable updates

---

### GET /api/inbound/sessions

**Purpose:** Get all inbound sessions (for sync/display)

**Request:**
```http
GET /api/inbound/sessions
Authorization: Bearer {token}
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
      "asn_no": "ASN-0001",
      "status": "Active",
      "completed_cartons": 1,
      "total_cartons": 2,
      "transfer_order": null,
      "dock": "DOCK-01",
      "started_by": "USER-172188",
      "started_at": "2024-12-25T10:00:00.000Z",
      "completed_on": null,
      "device_id": "DEVICE-001"
    }
  ],
  "count": 1
}
```

---

## 📦 Step 3: Unload Cartons

### POST /api/cartons/update-status

**Purpose:** Update carton status (Unload, Lock for Receiving, Complete Receiving)

**Request:**
```http
POST /api/cartons/update-status
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body (Single Carton):**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "status": "Unloaded",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Request Body (Batch - Multiple Cartons):**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "cartons": [
    {
      "carton_id": "CTN-0101",
      "status": "Unloaded"
    },
    {
      "carton_id": "CTN-0102",
      "status": "Unloaded"
    }
  ],
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Status Values:**
- `"Unloaded"` - Carton unloaded from truck
- `"Receiving"` - Carton locked for receiving (items being scanned)
- `"Received"` - Carton receiving completed

**Response:**
```json
{
  "ok": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

**Backend Actions:**
- Updates `tabReceivingCarton.status`
- When status = `"Receiving"`: Sets `locked_by` and `locked_on`
- When status = `"Received"`: Sets `received_by` and `received_on`
- Updates `tabAsnItemDetails.carton_assigned_status`
- **Note:** `tabCartonStatus` table is no longer used (consolidated into `tabReceivingCarton`)

---

### POST /api/inbound/unload-line

**Purpose:** Create/update unload line record (tracks which cartons were unloaded)

**Request:**
```http
POST /api/inbound/unload-line
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "unit_type": "Carton",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Unload line saved successfully"
}
```

**Backend Actions:**
- Creates/updates `tabInboundUnloadLine` record (UPSERT logic)
- Sets `scanned_by = user_id`
- Sets `scanned_on = NOW()`

**Note:** This is automatically called when carton status is updated to "Unloaded", but can be called explicitly for tracking

---

### POST /api/events/batch

**Purpose:** Send scan events for audit trail (optional but recommended)

**Request:**
```http
POST /api/events/batch
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "event_type": "UNLOAD_SCAN",
      "event_time": "2024-12-25T10:30:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0001",
      "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
      "carton_id": "CTN-0101",
      "qty": 1,
      "notes": "Carton unloaded from truck"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "processed": 1,
  "failed": 0
}
```

**Event Types for Inbound:**
- `UNLOAD_SCAN` - Carton unloaded
- `RECEIVE_ITEM_SCAN` - Item received
- `SORT_TO_BOX` - Item sorted to box
- `PACK_BOX_TO_TC` - Box packed to transfer carton

**Note:** Use unique `offline_uuid` for each event to prevent duplicates

---

## 📥 Step 4: Receive Items

### POST /api/cartons/update-status (Lock for Receiving)

**Purpose:** Lock carton for receiving (before scanning items)

**Request:**
```http
POST /api/cartons/update-status
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "status": "Receiving",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

**Backend Actions:**
- Updates `tabReceivingCarton.status = "Receiving"`
- Sets `locked_by = user_id`
- Sets `locked_on = NOW()`

---

### POST /api/inbound/receive-lines

**Purpose:** Create/update receive line records (items received from carton)

**Request:**
```http
POST /api/inbound/receive-lines
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body (Mobile App Format - parent_title inside each line):**
```json
{
  "receive_lines": [
    {
      "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLK-32",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    },
    {
      "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLU-32",
      "expected_qty": 50.00,
      "received_qty": 48.00,
      "condition": "Good",
      "remarks": "2 units damaged"
    }
  ]
}
```

**Request Body (Alternative - parent_title at root):**
```json
{
  "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
  "receive_lines": [
    {
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLK-32",
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
  "saved_count": 2
}
```

**Backend Actions:**
- Creates/updates `tabInboundReceiveLine` records (UPSERT logic)
- Prevents duplicates based on `parent_title`, `carton_id`, `item_code`
- Only allows items for unloaded cartons

**Validation:**
- Carton must be in "Unloaded" or "Receiving" status
- `parent_title` (inbound_session) must exist
- `item_code` must exist in master data

---

### POST /api/cartons/update-status (Complete Receiving)

**Purpose:** Mark carton as received (after all items scanned)

**Request:**
```http
POST /api/cartons/update-status
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "status": "Received",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

**Backend Actions:**
- Updates `tabReceivingCarton.status = "Received"`
- Sets `received_by = user_id`
- Sets `received_on = NOW()`
- Updates `tabAsnItemDetails.carton_assigned_status = "Received"`

---

## 📦 Step 5: Sort Items to Boxes

### GET /api/boxes

**Purpose:** Get available boxes for sorting (filtered by ASN and store)

**Request:**
```http
GET /api/boxes?asn=ASN-0001&store=STORE-001
Authorization: Bearer {token}
```

**Query Parameters:**
- `asn` (required) - ASN number
- `store` (required) - Store code
- `status` (optional) - Filter by status (Open, Filling, Closed)

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "box_id": "BOX-STORE-001-001",
      "status": "Open",
      "asn_no": "ASN-0001",
      "to_no": "TO-0001",
      "store": "STORE-001",
      "purpose": "STORE",
      "created_by": "USER-001",
      "created_on": "2024-12-25T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Note:** Boxes are pre-created by Desktop App with printed barcodes

---

### GET /api/boxes/:box_id

**Purpose:** Get box details (for validation when scanning box barcode)

**Request:**
```http
GET /api/boxes/BOX-STORE-001-001
Authorization: Bearer {token}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "box_id": "BOX-STORE-001-001",
    "status": "Open",
    "asn_no": "ASN-0001",
    "to_no": "TO-0001",
    "store": "STORE-001",
    "purpose": "STORE",
    "created_by": "USER-001",
    "created_on": "2024-12-25T10:00:00.000Z",
    "contents": [
      {
        "item_code": "SKU-JEANS-001-BLK-32",
        "source_carton": "CTN-0101",
        "qty": 10,
        "sorted_by": "USER-172188",
        "sorted_on": "2024-12-25T10:30:00.000Z"
      }
    ]
  }
}
```

---

### POST /api/events/batch (Sort to Box)

**Purpose:** Send sort event when item is sorted into a box

**Request:**
```http
POST /api/events/batch
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440002",
      "event_type": "SORT_TO_BOX",
      "event_time": "2024-12-25T10:35:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0001",
      "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLK-32",
      "qty": 10,
      "store": "STORE-001",
      "box_id": "BOX-STORE-001-001",
      "notes": "Item sorted to box"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "processed": 1,
  "failed": 0
}
```

**Note:** Box contents are derived from `SORT_TO_BOX` events

---

## 📦 Step 6: Pack Boxes to Transfer Cartons

### POST /api/transfer-cartons/create

**Purpose:** Create a transfer carton for packing boxes

**Request:**
```http
POST /api/transfer-cartons/create
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "tc_id": "TC-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "user_id": "USER-172188"
}
```

**Alternative Field Names:**
- `asn_no` (preferred) or `advance_shipping_notice`
- `to_no` (preferred) or `transfer_order`
- `user_id` (preferred) or `created_by`

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

---

### GET /api/transfer-cartons

**Purpose:** Get transfer cartons (filtered by ASN and store)

**Request:**
```http
GET /api/transfer-cartons?asn=ASN-0001&store=STORE-001
Authorization: Bearer {token}
```

**Query Parameters:**
- `asn` (optional) - Filter by ASN
- `store` (optional) - Filter by store

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "tc_id": "TC-001-001",
      "status": "Created",
      "asn_no": "ASN-0001",
      "to_no": "TO-0001",
      "store": "STORE-001",
      "created_by": "USER-172188",
      "created_on": "2024-12-25T10:40:00.000Z"
    }
  ],
  "count": 1
}
```

---

### POST /api/events/batch (Pack Box to Transfer Carton)

**Purpose:** Send event when box is packed into transfer carton

**Request:**
```http
POST /api/events/batch
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440003",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2024-12-25T10:45:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0001",
      "transfer_order": "TO-0001",
      "store": "STORE-001",
      "box_id": "BOX-STORE-001-001",
      "tc_id": "TC-001-001",
      "qty": 1,
      "notes": "Box packed to transfer carton"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "processed": 1,
  "failed": 0
}
```

**Note:** Transfer carton contents are derived from `PACK_BOX_TO_TC` events

---

### POST /api/transfer-cartons/seal

**Purpose:** Seal a transfer carton (mark as ready for dispatch)

**Request:**
```http
POST /api/transfer-cartons/seal
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "tc_id": "TC-001-001",
  "sealed_by": "USER-172188"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully"
}
```

**Backend Actions:**
- Updates `tabTransferCarton.status = "Sealed"`
- Sets `sealed_by = sealed_by`
- Sets `sealed_on = NOW()`

---

### POST /api/transfer-cartons/dispatch

**Purpose:** Dispatch a transfer carton (mark as dispatched)

**Request:**
```http
POST /api/transfer-cartons/dispatch
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "tc_id": "TC-001-001",
  "dispatched_by": "USER-172188"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton dispatched successfully"
}
```

**Backend Actions:**
- Updates `tabTransferCarton.status = "Dispatched"`
- Sets `dispatched_on = NOW()`

---

## ✅ Step 7: Complete Inbound Session

### POST /api/inbound/complete

**Purpose:** Complete an inbound session

**Request:**
```http
POST /api/inbound/complete
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "asn_no": "ASN-0001",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Session completed successfully"
}
```

**Backend Actions:**
- Updates `tabInboundSession.status = "Completed"`
- Sets `completed_on = NOW()`
- Sets `ended_at = NOW()`

---

## 📊 Complete Workflow Summary

### Workflow Steps:

1. **Login** → `POST /api/auth/login`
2. **Sync Master Data** → `GET /api/master/asns`, `GET /api/asn/:asn_no`
3. **Create Session** → `POST /api/inbound/update`
4. **Unload Cartons** → `POST /api/cartons/update-status` (status: "Unloaded")
5. **Lock Carton** → `POST /api/cartons/update-status` (status: "Receiving")
6. **Receive Items** → `POST /api/inbound/receive-lines`
7. **Complete Carton** → `POST /api/cartons/update-status` (status: "Received")
8. **Sort to Boxes** → `POST /api/events/batch` (event_type: "SORT_TO_BOX")
9. **Pack to Transfer Carton** → `POST /api/transfer-cartons/create`, `POST /api/events/batch` (event_type: "PACK_BOX_TO_TC")
10. **Seal Transfer Carton** → `POST /api/transfer-cartons/seal`
11. **Dispatch Transfer Carton** → `POST /api/transfer-cartons/dispatch`
12. **Complete Session** → `POST /api/inbound/complete`

---

## 🔑 Key Points

### Authentication
- All APIs (except login) require `Authorization: Bearer {token}` header
- Token obtained from `POST /api/auth/login`
- Token expires in 7 days

### Field Name Flexibility
The backend API accepts both mobile and desktop app field names:
- `asn_no` or `advance_shipping_notice`
- `to_no` or `transfer_order`
- `user_id` or `created_by` / `started_by`
- `tc_id` (always used for transfer carton ID)

### UPSERT Logic
Many endpoints use UPSERT (Update or Insert) logic:
- `POST /api/inbound/update` - Creates or updates session
- `POST /api/inbound/receive-lines` - Creates or updates receive lines
- `POST /api/inbound/unload-line` - Creates or updates unload line
- `POST /api/cartons/update-status` - Updates carton status (creates if doesn't exist)

### Offline Support
- Use `offline_uuid` for all events to prevent duplicates
- Store events locally when offline
- Sync events when connection restored using `POST /api/events/batch`

### Status Flow
- **Carton:** `Assigned` → `Unloaded` → `Receiving` → `Received`
- **Session:** `Draft` → `Active` → `Completed`
- **Box:** `Open` → `Filling` → `Closed`
- **Transfer Carton:** `Created` → `Sealed` → `Dispatched`

---

## 📝 Request/Response Examples

### Complete Example: Unload Carton

**Request:**
```http
POST /api/cartons/update-status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "status": "Unloaded",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

---

## 🚨 Error Responses

All APIs return errors in this format:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional details (in development mode only)"
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` - Missing or invalid request parameters
- `NOT_FOUND` - Resource not found
- `AUTH_INVALID` - Invalid credentials
- `DATABASE_ERROR` - Database operation failed
- `DUPLICATE_ENTRY` - Record already exists

---

## 📚 Additional Master Data APIs

### GET /api/master/transfer-orders
Get all transfer orders

### GET /api/master/users
Get all users

### GET /api/master/locations
Get all locations

### GET /api/master/warehouses
Get all warehouses

### GET /api/master/warehouse-racks
Get all warehouse racks

---

## 🔄 Event Types Reference

| Event Type | Description | Required Fields |
|------------|-------------|----------------|
| `UNLOAD_SCAN` | Carton unloaded | `carton_id`, `inbound_session` |
| `RECEIVE_ITEM_SCAN` | Item received | `item_code`, `carton_id`, `qty` |
| `SORT_TO_BOX` | Item sorted to box | `item_code`, `box_id`, `qty` |
| `PACK_BOX_TO_TC` | Box packed to transfer carton | `box_id`, `tc_id` |
| `TC_SEAL` | Transfer carton sealed | `tc_id` |
| `TC_DISPATCH` | Transfer carton dispatched | `tc_id` |

---

## ✅ Implementation Checklist

- [ ] Implement login flow
- [ ] Implement master data sync (ASN, Items, Warehouses)
- [ ] Implement inbound session creation
- [ ] Implement carton unload scanning
- [ ] Implement carton lock for receiving
- [ ] Implement item receiving
- [ ] Implement carton complete
- [ ] Implement sorting to boxes
- [ ] Implement transfer carton creation
- [ ] Implement packing boxes to transfer cartons
- [ ] Implement transfer carton seal/dispatch
- [ ] Implement session completion
- [ ] Implement event sending (with offline support)
- [ ] Implement error handling
- [ ] Implement retry logic for failed requests

---

## 📞 API Base URL

**Development:**
```
http://localhost:3000
```

**Production:**
```
https://your-api-domain.com
```

**All endpoints are prefixed with `/api/`**

---

## 🔐 Security Notes

1. **Always use HTTPS in production**
2. **Store token securely** (use secure storage, not plain text)
3. **Handle token expiration** (re-login when token expires)
4. **Validate all inputs** before sending to API
5. **Handle network errors gracefully** (retry, offline queue)

---

This document provides a complete reference for implementing the inbound workflow in your mobile app. All APIs are tested and ready for use.

