# Complete WMS Application Workflow Documentation

## Mobile App + Desktop App + Backend API + ERPNext Integration

---

## 📋 Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [Master Data Sync from ERPNext](#master-data-sync-from-erpnext)
4. [Complete Inbound Workflow](#complete-inbound-workflow)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Event Types Reference](#event-types-reference)
7. [Mobile App Implementation Guide](#mobile-app-implementation-guide)
8. [Desktop App Sync Process](#desktop-app-sync-process)

---

## 🏗️ System Architecture Overview

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   ERPNext    │ ──────> │  Backend API │ <────── │  Mobile App  │         │ Desktop App  │
│              │  Sync   │              │  POST   │              │         │              │
│ Master Data  │ Master  │  WMS Database│ Events  │  Scans Items │         │  Views Data  │
│ ASN, TO, etc│ Data    │              │         │  & Syncs     │         │  & Reports   │
└──────────────┘         └──────────────┘         └──────────────┘         └──────────────┘
                                │                                              │
                                │ GET                                          │ GET
                                │                                              │
                                ▼                                              ▼
                         ┌──────────────┐                              ┌──────────────┐
                         │  Desktop App │                              │  Local DB    │
                         │  Syncs Data  │                              │  (Cache)     │
                         └──────────────┘                              └──────────────┘
```

---

## 🔄 Data Flow Diagram

### Master Data Flow (ERPNext → Backend → Mobile/Desktop)

```
ERPNext Database
    │
    │ (Periodic Sync or Real-time)
    ▼
Backend API Database (tabAdvanceShippingNotice, tabTransferOrder, etc.)
    │
    │ GET /api/master/asns
    │ GET /api/master/transfer-orders
    ▼
Mobile App / Desktop App
```

### Transaction Data Flow (Mobile → Backend → Desktop)

```
Mobile App (Scans & Actions)
    │
    │ POST /api/events/batch
    │ POST /api/cartons/update-status
    │ POST /api/inbound/update
    │ POST /api/inbound/receive-lines
    │ POST /api/boxes/create
    │ POST /api/transfer-cartons/create
    │ etc.
    ▼
Backend API Database (tabWmsScanEvent, tabInboundSession, etc.)
    │
    │ GET /api/inbound/sessions
    │ GET /api/master/transfer-cartons
    │ etc.
    ▼
Desktop App (Real-time Sync)
    │
    ▼
Local Desktop Database (tabInboundSession, etc.)
```

---

## 📦 Sort Box Creation Workflow (NEW)

### Overview

**Sort Boxes are now created by Desktop App** before mobile sorting begins:

1. **Desktop User** creates Sort Boxes via Desktop App UI
2. **Desktop App** generates unique Box ID and prints barcode label
3. **Desktop App** syncs box to Backend API
4. **Mobile App** fetches available boxes or scans barcode to use existing box
5. **Mobile App** sorts items into the box

### Key Changes from Previous Workflow

- ❌ **OLD:** Mobile app creates boxes on-the-fly during sorting
- ✅ **NEW:** Desktop app pre-creates boxes with barcodes, mobile app uses them

### Benefits

- ✅ Pre-printed barcodes for faster scanning
- ✅ Better inventory control (boxes created in advance)
- ✅ Desktop user can plan and prepare boxes before sorting
- ✅ Mobile app simply scans and uses existing boxes

---

## 📥 Master Data Sync from ERPNext

### Overview

All master data (ASN, Transfer Orders, Items, etc.) is **fetched from ERPNext** and stored in the Backend API database. Mobile and Desktop apps fetch this data from the Backend API.

### ERPNext → Backend API Sync Process

**Note:** This is typically handled by a background job or scheduled task in the Backend API.

#### 1. ASN (Advance Shipping Notice) Sync

**Source:** ERPNext `tabAdvance Shipping Notice` table  
**Destination:** Backend API `tabAdvanceShippingNotice` table

**Sync Fields:**

- `title` → `title` (ASN number, e.g., "ASN-0001")
- `status` → `status`
- `purchase_order` → `purchase_order`
- `supplier` → `supplier`
- `shipment_date` → `shipment_date`
- `expected_arrival_date` → `expected_arrival_date`
- `total_shipped_qty` → `total_shipped_qty`
- `airway_bill_no` → `airway_bill_no`
- `shipment_type` → `shipment_type`

**ASN Item Details Sync:**

- `parent_title` → `parent_title` (ASN number)
- `item_code` → `item_code`
- `po_item_reference` → `po_item_reference`
- `shipped_qty` → `shipped_qty`
- `carton_id` → `carton_id`
- `carton_assigned_status` → `carton_assigned_status`

#### 2. Transfer Order Sync

**Source:** ERPNext `tabTransfer Order` table  
**Destination:** Backend API `tabTransferOrder` table

**Sync Fields:**

- `title` → `title` (Transfer Order number, e.g., "TO-0001")
- `status` → `status`
- `from_warehouse` → `from_warehouse`
- `to_warehouse` → `to_warehouse`
- `transfer_order_date` → `transfer_order_date`
- `expected_delivery_date` → `expected_delivery_date`

#### 3. Items Master Data Sync

**Source:** ERPNext `tabItem` table  
**Destination:** Backend API `tabItem` table

**Sync Fields:**

- `code` → `code` (Item code/SKU)
- `name` → `name`
- `item_group` → `item_group`
- `brand` → `brand`
- `default_uom` → `default_uom`
- `stock_uom` → `stock_uom`
- `barcode` → `barcode`

---

## 🔄 Complete Inbound Workflow

### Phase 1: Session Creation & Setup

#### Step 1.1: Mobile App - User Selects ASN

**Action:** User opens mobile app and selects an ASN from the list

**Mobile App API Call:**

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
  }
]
```

**Mobile App Action:**

- Display ASN list
- User selects ASN (e.g., "ASN-0001")

---

#### Step 1.2: Mobile App - Fetch ASN Details

**Action:** Mobile app fetches detailed ASN information including items

**Mobile App API Call:**

```http
GET /api/asn/{asn_no}
Authorization: Bearer {token}
```

**Example:**

```http
GET /api/asn/ASN-0001
```

**Response:**

```json
{
  "asn_no": "ASN-0001",
  "status": "Submitted",
  "purchase_order": "PO-2024-001",
  "supplier": "Supplier ABC",
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

**Mobile App Action:**

- Display ASN details
- Show cartons and items
- User can start a new inbound session

---

#### Step 1.3: Mobile App - Create Inbound Session

**Action:** User starts a new inbound session for the selected ASN

**Mobile App API Call:**

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

**Response:**

```json
{
  "ok": true,
  "message": "Session created successfully",
  "action": "created"
}
```

**Backend Actions:**

- Creates/updates `tabInboundSession` record
- Sets `status = "Active"`
- Sets `started_at = NOW()`
- Sets `started_by = user_id`

**Desktop App:**

- Automatically syncs session via `GET /api/inbound/sessions`
- Session appears in Inbound Sessions list

---

### Phase 2: Unloading Cartons

#### Step 2.1: Mobile App - Scan Carton to Unload

**Action:** User scans a carton barcode to unload it from the truck

**Mobile App API Call:**

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

**Response:**

```json
{
  "ok": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

**Backend Actions (Automatic):**

1. ✅ Updates `tabReceivingCarton.status = "Unloaded"`
2. ✅ Creates entry in `tabInboundUnloadLine` (AUTOMATIC)
   - `parent_title` = `inbound_session`
   - `unit_type` = "Carton"
   - `unit_id` = `carton_id`
   - `scanned_by` = `user_id`
   - `scanned_on` = NOW()
3. ✅ Updates `tabCartonStatus.status = "Unloaded"`
4. ✅ Updates `tabAsnItemDetails.carton_assigned_status = "Unloaded"`

**Mobile App Action:**

- Record event for offline sync
- Update UI to show carton as "Unloaded"

---

#### Step 2.2: Mobile App - Send Unload Event

**Action:** Mobile app sends scan event to backend (for audit trail)

**Mobile App API Call:**

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

**Backend Actions:**

- Inserts event into `tabWmsScanEvent` table
- Used for audit trail and reporting

---

### Phase 3: Receiving Items

#### Step 3.1: Mobile App - Lock Carton for Receiving

**Action:** User selects a carton to start receiving items

**Mobile App API Call:**

```http
POST /api/carton/lock
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "carton_id": "CTN-0101",
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "user_id": "USER-172188"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Carton locked successfully",
  "status": "Receiving"
}
```

**Backend Actions:**

- Updates `tabReceivingCarton.status = "Receiving"`
- Sets `locked_by = user_id`
- Sets `locked_on = NOW()`
- Updates `tabCartonStatus.status = "Receiving"`
- Updates `tabAsnItemDetails.carton_assigned_status = "Receiving"`

---

#### Step 3.2: Mobile App - Scan Items to Receive

**Action:** User scans item barcodes and enters quantities

**Mobile App API Call:**

```http
POST /api/inbound/receive-lines
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body (Single Item):**

```json
{
  "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "item_code": "SKU-JEANS-001-BLK-32",
  "expected_qty": 50,
  "received_qty": 50,
  "condition": "Good",
  "remarks": null
}
```

**Request Body (Batch - Multiple Items):**

```json
{
  "receive_lines": [
    {
      "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLK-32",
      "expected_qty": 50,
      "received_qty": 50,
      "condition": "Good",
      "remarks": null
    },
    {
      "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLU-32",
      "expected_qty": 50,
      "received_qty": 48,
      "condition": "Good",
      "remarks": "2 units damaged"
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

- Creates/updates `tabInboundReceiveLine` records
- Uses UPSERT logic (no duplicates)
- Filters: Only items for unloaded cartons are allowed

---

#### Step 3.3: Mobile App - Send Receive Event

**Action:** Mobile app sends receive scan event

**Mobile App API Call:**

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
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "RECEIVE_ITEM_SCAN",
      "event_time": "2024-12-25T10:35:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0001",
      "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLK-32",
      "qty": 50,
      "notes": "Item received"
    }
  ]
}
```

---

#### Step 3.4: Mobile App - Complete Carton Receiving

**Action:** User finishes receiving items from a carton

**Mobile App API Call:**

```http
POST /api/carton/complete
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "carton_id": "CTN-0101",
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "user_id": "USER-172188"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Carton completed successfully",
  "status": "Received"
}
```

**Backend Actions:**

- Updates `tabReceivingCarton.status = "Received"`
- Sets `received_by = user_id`
- Sets `received_on = NOW()`
- Updates `tabCartonStatus.status = "Received"`
- Updates `tabAsnItemDetails.carton_assigned_status = "Received"`

---

### Phase 4: Sorting to Store Boxes

#### Step 4.0: Desktop App - Create Sort Box (Pre-requisite)

**Action:** Desktop user creates sort boxes for stores and prints barcodes before mobile sorting begins

**Desktop App Actions:**

1. **User opens Sort Boxes screen** (Inbound Operations → Sort Boxes)
2. **User clicks "Create New Box" button**
3. **User enters box details:**
   - ASN Number (e.g., "ASN-0001")
   - Transfer Order (e.g., "TO-0001")
   - Store (e.g., "STORE-001")
   - Purpose: "STORE"
4. **Desktop app generates unique Box ID** (e.g., "BOX-STORE-001-001")
5. **Desktop app saves to local database** (`tabSortBox`)
6. **Desktop app syncs to Backend API** via `POST /api/boxes/create`
7. **Desktop app prints barcode label** with Box ID for scanning

**Desktop App API Call (Sync to Backend):**

```http
POST /api/boxes/create
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "box_id": "BOX-STORE-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "purpose": "STORE",
  "user_id": "DESKTOP-USER-001"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Box created successfully",
  "box_id": "BOX-STORE-001-001",
  "status": "Open"
}
```

**Backend Actions:**

- Creates `tabSortBox` record
- Sets `status = "Open"`
- Sets `created_by = user_id`
- Sets `created_on = NOW()`

**Desktop App Actions:**

- Stores box in local database
- Generates and prints barcode label with Box ID
- Box is now available for mobile app to fetch and use

---

#### Step 4.1: Mobile App - Fetch Transfer Order

**Action:** Mobile app fetches transfer order details for the ASN

**Mobile App API Call:**

```http
GET /api/transfer-order/by-asn/{asn_no}
Authorization: Bearer {token}
```

**Example:**

```http
GET /api/transfer-order/by-asn/ASN-0001
```

**Response:**

```json
{
  "to_no": "TO-0001",
  "status": "Active",
  "from_warehouse": "MAIN-WAREHOUSE",
  "to_warehouse": "STORE-001",
  "transfer_order_date": "2024-12-25",
  "expected_delivery_date": "2024-12-27"
}
```

---

#### Step 4.2: Desktop App - Create Sort Box and Print Label

**Action:** Desktop user creates a new sort box for a store and prints the barcode label

**Desktop App Workflow:**

1. **User opens Sort Box Management screen** (Inbound Operations → Sort Boxes)
2. **User clicks "Create New Box" button**
3. **User enters box details:**
   - ASN Number (e.g., "ASN-0001")
   - Transfer Order (e.g., "TO-0001")
   - Store (e.g., "STORE-001")
   - Purpose: "STORE"
4. **Desktop app generates unique Box ID** (format: `BOX-{STORE}-{SEQUENCE}`, e.g., "BOX-STORE-001-001")
5. **Desktop app saves to local database** (`tabSortBox` table)
6. **Desktop app syncs to Backend API** via `POST /api/boxes/create`
7. **Desktop app generates barcode image** for the Box ID using Code128 format
8. **Desktop app prints barcode label** with complete box information:
   - Title: "SORT BOX / TRANSFER CARTON"
   - Box ID
   - Store
   - Status
   - ASN
   - Transfer Order
   - Contents section (initially empty)
   - Barcode image (Code128)
   - Box ID text below barcode

**Desktop App API Call (Sync to Backend):**

```http
POST /api/boxes/create
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "box_id": "BOX-STORE-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "purpose": "STORE",
  "user_id": "USER-172188"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Box created successfully",
  "box_id": "BOX-STORE-001-001",
  "status": "Open"
}
```

**Backend Actions:**

- Creates `tabSortBox` record in database
- Sets `status = "Open"`
- Sets `created_by = user_id`
- Sets `created_on = NOW()`
- Returns success response with box details

**Desktop App Actions After Creation:**

- Stores box in local database (`tabSortBox` table)
- Generates Code128 barcode image for Box ID
- Opens print dialog for label printing
- Prints complete label with:
  - All box information (Box ID, Store, Status, ASN, TO)
  - Barcode image (Code128 format, 400x120 pixels)
  - Box ID text below barcode
  - Contents section (empty initially, will be populated as items are sorted)
- Box is now available for mobile app to fetch and use

**Label Format (Printed):**

```
SORT BOX / TRANSFER CARTON

Box ID: BOX-STORE-001-001
Store: STORE-001
Status: Open

ASN: ASN-0001
TO: TO-0001

CONTENTS:
(No contents)

Created: 2024-12-25 10:30:23

[CODE128 BARCODE IMAGE]
BOX-STORE-001-001
```

**Next Steps:**

- Mobile app can fetch this box via `GET /api/boxes?asn=ASN-0001&store=STORE-001&status=Open`
- Mobile app can scan the printed barcode to select the box
- Mobile app will sort items into this box (see Step 4.3)

---

#### Step 4.3: Mobile App - Fetch Available Sort Boxes

**Action:** Mobile app fetches available sort boxes for the ASN and store (created by desktop)

**Mobile App API Call:**

```http
GET /api/boxes?asn={asn_no}&store={store}&status=Open
Authorization: Bearer {token}
```

**Example:**

```http
GET /api/boxes?asn=ASN-0001&store=STORE-001&status=Open
```

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
      "created_by": "USER-172188",
      "created_on": "2024-12-25T10:30:23Z"
    },
    {
      "box_id": "BOX-STORE-001-002",
      "status": "Open",
      "asn_no": "ASN-0001",
      "to_no": "TO-0001",
      "store": "STORE-001",
      "purpose": "STORE",
      "created_by": "USER-172188",
      "created_on": "2024-12-25T10:35:00Z"
    }
  ]
}
```

**Alternative: Scan Box Barcode**

**Action:** User scans the barcode label printed by desktop app

**Mobile App Action:**

- User scans barcode → Gets `box_id` (e.g., "BOX-STORE-001-001")
- Mobile app validates box exists and is available via `GET /api/boxes/{box_id}`
- If valid, mobile app uses the box for sorting

**Mobile App API Call (Validate Scanned Box):**

```http
GET /api/boxes/{box_id}
Authorization: Bearer {token}
```

**Example:**

```http
GET /api/boxes/BOX-STORE-001-001
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
    "created_by": "DESKTOP-USER-001",
    "created_on": "2024-12-25T09:00:00Z"
  }
}
```

**Mobile App Action:**

- Display available boxes or use scanned box
- User selects/confirms box to use for sorting
- Box status may change to "Filling" when first item is sorted

---

#### Step 4.3: Mobile App - Sort Items to Box

**Action:** User scans items and sorts them into store boxes

**Mobile App API Call:**

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
      "event_time": "2024-12-25T10:40:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0001",
      "transfer_order": "TO-0001",
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLK-32",
      "qty": 50,
      "store": "STORE-001",
      "box_id": "BOX-STORE-001-001",
      "notes": "Sorted to store box"
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

**Backend Actions:**

- Inserts event into `tabWmsScanEvent`
- Event type: `SORT_TO_BOX`
- Links item to box via `box_id`

---

#### Step 4.4: Mobile App - Close Box

**Action:** User closes a box when it's full

**Mobile App API Call:**

```http
POST /api/boxes/close
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "box_id": "BOX-STORE-001-001",
  "user_id": "USER-172188"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Box closed successfully",
  "status": "Closed"
}
```

**Backend Actions:**

- Updates `tabSortBox.status = "Closed"`
- Sets `closed_by = user_id`
- Sets `closed_on = NOW()`

**Mobile App Event:**

```json
{
  "event_type": "BOX_CLOSE",
  "box_id": "BOX-STORE-001-001",
  "user_id": "USER-172188"
}
```

---

### Phase 5: Packing Boxes to Transfer Cartons

#### Step 5.1: Mobile App - Create Transfer Carton

**Action:** User creates a transfer carton to pack boxes

**Mobile App API Call:**

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

**Response:**

```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "tc_id": "TC-001-001",
  "status": "Created"
}
```

**Backend Actions:**

- Creates `tabTransferCarton` record
- Sets `status = "Created"`
- Sets `created_by = user_id`
- Sets `created_on = NOW()`

---

#### Step 5.2: Mobile App - Pack Box to Transfer Carton

**Action:** User packs a closed box into a transfer carton

**Mobile App API Call:**

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
      "carton_id": "CTN-0101",
      "item_code": "SKU-JEANS-001-BLK-32",
      "qty": 50,
      "store": "STORE-001",
      "box_id": "BOX-STORE-001-001",
      "tc_id": "TC-001-001",
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

**Backend Actions:**

- Inserts event into `tabWmsScanEvent`
- Event type: `PACK_BOX_TO_TC`
- Links items to transfer carton via `tc_id`

**Note:** Transfer carton contents are derived from `tabWmsScanEvent` where `tc_id` matches and `event_type = "PACK_BOX_TO_TC"`

---

#### Step 5.3: Mobile App - Seal Transfer Carton

**Action:** User seals a transfer carton when packing is complete

**Mobile App API Call:**

```http
POST /api/transfer-cartons/seal
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "tc_id": "TC-001-001",
  "user_id": "USER-172188"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully",
  "status": "Sealed"
}
```

**Backend Actions:**

- Updates `tabTransferCarton.status = "Sealed"`
- Sets `sealed_by = user_id`
- Sets `sealed_on = NOW()`

**Mobile App Event:**

```json
{
  "event_type": "TC_SEAL",
  "tc_id": "TC-001-001",
  "user_id": "USER-172188"
}
```

---

#### Step 5.4: Mobile App - Dispatch Transfer Carton

**Action:** User dispatches a sealed transfer carton to the store

**Mobile App API Call:**

```http
POST /api/transfer-cartons/dispatch
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "tc_id": "TC-001-001",
  "user_id": "USER-172188"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Transfer carton dispatched successfully",
  "status": "Dispatched"
}
```

**Backend Actions:**

- Updates `tabTransferCarton.status = "Dispatched"`
- Sets `dispatched_on = NOW()`

**Mobile App Event:**

```json
{
  "event_type": "TC_DISPATCH",
  "tc_id": "TC-001-001",
  "user_id": "USER-172188"
}
```

---

### Phase 6: Putaway (Remaining Items)

#### Step 6.1: Mobile App - Get Remaining Items for Putaway

**Action:** User fetches items that need to be put away (not sorted to stores)

**Mobile App API Call:**

```http
GET /api/putaway/remaining-items?asn={asn_no}
Authorization: Bearer {token}
```

**Example:**

```http
GET /api/putaway/remaining-items?asn=ASN-0001
```

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "item_code": "SKU-JEANS-001-BLU-34",
      "carton_id": "CTN-0102",
      "remaining_qty": 50,
      "asn_no": "ASN-0001"
    }
  ]
}
```

---

#### Step 6.2: Mobile App - Assign Rack/Bin for Putaway

**Action:** User assigns a rack/bin location for items

**Mobile App API Call:**

```http
POST /api/putaway/assign-rack
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**

```json
{
  "asn_no": "ASN-0001",
  "carton_id": "CTN-0102",
  "item_code": "SKU-JEANS-001-BLU-34",
  "rack": "RACK-A-01",
  "bin": "BIN-01",
  "qty": 50,
  "user_id": "USER-172188"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Rack assigned successfully",
  "putaway_task_id": "PT-001"
}
```

**Backend Actions:**

- Creates/updates `tabPutawayTask` record
- Creates `tabPutawayTaskItem` record

---

#### Step 6.3: Mobile App - Confirm Putaway

**Action:** User confirms items have been put away

**Mobile App API Call:**

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
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440004",
      "event_type": "PUTAWAY_CONFIRM",
      "event_time": "2024-12-25T10:50:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0001",
      "carton_id": "CTN-0102",
      "item_code": "SKU-JEANS-001-BLU-34",
      "qty": 50,
      "rack": "RACK-A-01",
      "bin": "BIN-01",
      "notes": "Items put away"
    }
  ]
}
```

---

### Phase 7: Complete Inbound Session

#### Step 7.1: Mobile App - Complete Session

**Action:** User completes the inbound session when all cartons are processed

**Mobile App API Call:**

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

**Desktop App:**

- Automatically syncs updated session
- Session shows as "Completed" in the list

---

## 📡 API Endpoints Reference

### Authentication

#### POST /api/auth/login

**Purpose:** User login  
**Request:**

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
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 604800,
    "user": {
      "user_code": "USER-172188",
      "name": "John Doe"
    }
  }
}
```

---

### Master Data APIs

#### GET /api/master/asns

**Purpose:** Get all ASNs (from ERPNext)  
**Response:** Array of ASN objects with `asn_no`, `status`, `total_carton_count`, etc.

#### GET /api/master/transfer-orders

**Purpose:** Get all Transfer Orders (from ERPNext)  
**Response:** Array of Transfer Order objects

#### GET /api/master/items

**Purpose:** Get all Items (from ERPNext)  
**Response:** Array of Item objects

#### GET /api/asn/{asn_no}

**Purpose:** Get ASN details with items  
**Response:** ASN object with `details` array

#### GET /api/transfer-order/by-asn/{asn_no}

**Purpose:** Get Transfer Order for an ASN  
**Response:** Transfer Order object

---

### Inbound Session APIs

#### POST /api/inbound/update

**Purpose:** Create or update inbound session  
**Request:** Session data with `inbound_session`, `asn_no`, etc.  
**Response:** `{ "ok": true, "action": "created" | "updated" }`

#### POST /api/inbound/complete

**Purpose:** Complete an inbound session  
**Request:** `{ "inbound_session", "asn_no", "user_id", "device_id" }`  
**Response:** `{ "ok": true, "message": "Session completed" }`

#### GET /api/inbound/sessions

**Purpose:** Get all inbound sessions (for desktop sync)  
**Response:** Array of session objects with `unload_lines` and `receive_lines`

---

### Carton APIs

#### POST /api/cartons/update-status

**Purpose:** Update carton status (Unloaded, Receiving, Received)  
**Request:** Single or batch carton status updates  
**Response:** `{ "ok": true, "updated_count": 1 }`  
**Automatic Actions:**

- Creates `tabInboundUnloadLine` when status = "Unloaded"
- Updates `tabCartonStatus`
- Updates `tabAsnItemDetails.carton_assigned_status`

#### POST /api/carton/lock

**Purpose:** Lock carton for receiving  
**Request:** `{ "carton_id", "asn_no", "inbound_session", "user_id" }`  
**Response:** `{ "ok": true, "status": "Receiving" }`

#### POST /api/carton/complete

**Purpose:** Complete carton receiving  
**Request:** `{ "carton_id", "asn_no", "inbound_session", "user_id" }`  
**Response:** `{ "ok": true, "status": "Received" }`

---

### Receive Line APIs

#### POST /api/inbound/receive-line

**Purpose:** Create or update a single receive line  
**Request:**

```json
{
  "parent_title": "SESSION-XXX",
  "carton_id": "CTN-0101",
  "item_code": "SKU-001",
  "expected_qty": 50,
  "received_qty": 50,
  "condition": "Good",
  "remarks": null
}
```

#### POST /api/inbound/receive-lines

**Purpose:** Create or update multiple receive lines (batch)  
**Request:**

```json
{
  "receive_lines": [
    { "parent_title": "SESSION-XXX", "carton_id": "CTN-0101", ... },
    { "parent_title": "SESSION-XXX", "carton_id": "CTN-0102", ... }
  ]
}
```

**Note:** Receive lines are filtered - only items for unloaded cartons are allowed

---

### Unload Line APIs

#### POST /api/inbound/unload-line

**Purpose:** Create or update unload line (usually automatic via carton status update)  
**Request:**

```json
{
  "parent_title": "SESSION-XXX",
  "unit_type": "Carton",
  "unit_id": "CTN-0101",
  "scanned_by": "USER-172188",
  "scanned_on": "2024-12-25T10:30:00Z"
}
```

#### GET /api/inbound/unload-lines?parent_title={session_id}

**Purpose:** Get unload lines for a session  
**Response:** Array of unload line objects

---

### Box APIs

#### POST /api/boxes/create

**Purpose:** Create a new sort box  
**Request:**

```json
{
  "box_id": "BOX-STORE-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "purpose": "STORE",
  "user_id": "USER-172188"
}
```

#### POST /api/boxes/close

**Purpose:** Close a box  
**Request:** `{ "box_id", "user_id" }`

#### POST /api/boxes/reopen

**Purpose:** Reopen a closed box  
**Request:** `{ "box_id", "user_id" }`

#### GET /api/boxes?asn={asn_no}&store={store}&status={status}

**Purpose:** Get boxes for an ASN and store (with optional status filter)  
**Query Parameters:**

- `asn` (required): ASN number
- `store` (required): Store identifier
- `status` (optional): Filter by status (e.g., "Open", "Filling", "Closed")

**Response:** Array of box objects

**Example:**

```http
GET /api/boxes?asn=ASN-0001&store=STORE-001&status=Open
```

#### GET /api/boxes/{box_id}

**Purpose:** Get a specific box by ID (for validating scanned barcodes)  
**Response:** Single box object

**Example:**

```http
GET /api/boxes/BOX-STORE-001-001
```

---

### Transfer Carton APIs

#### POST /api/transfer-cartons/create

**Purpose:** Create a transfer carton  
**Request:**

```json
{
  "tc_id": "TC-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "user_id": "USER-172188"
}
```

#### POST /api/transfer-cartons/seal

**Purpose:** Seal a transfer carton  
**Request:** `{ "tc_id", "user_id" }`

#### POST /api/transfer-cartons/dispatch

**Purpose:** Dispatch a transfer carton  
**Request:** `{ "tc_id", "user_id" }`

#### GET /api/transfer-cartons?asn={asn_no}&store={store}

**Purpose:** Get transfer cartons for an ASN and store  
**Response:** Array of transfer carton objects

#### GET /api/master/transfer-cartons

**Purpose:** Get all transfer cartons  
**Response:** Array of transfer carton objects

---

### Putaway APIs

#### GET /api/putaway/remaining-items?asn={asn_no}

**Purpose:** Get items that need putaway (not sorted to stores)  
**Response:** Array of items with `remaining_qty`

#### POST /api/putaway/assign-rack

**Purpose:** Assign rack/bin for putaway  
**Request:**

```json
{
  "asn_no": "ASN-0001",
  "carton_id": "CTN-0102",
  "item_code": "SKU-001",
  "rack": "RACK-A-01",
  "bin": "BIN-01",
  "qty": 50,
  "user_id": "USER-172188"
}
```

#### POST /api/putaway/dispatch

**Purpose:** Dispatch transfer carton for putaway  
**Request:** `{ "tc_id", "user_id" }`

---

### Event API

#### POST /api/events/batch

**Purpose:** Send multiple scan events (for audit trail)  
**Request:**

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
      "inbound_session": "SESSION-XXX",
      "carton_id": "CTN-0101",
      "item_code": "SKU-001",
      "qty": 50,
      "store": "STORE-001",
      "box_id": "BOX-001",
      "tc_id": "TC-001",
      "rack": "RACK-A-01",
      "bin": "BIN-01",
      "notes": "Optional notes"
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

---

## 📋 Event Types Reference

### Event Types Used in WMS

| Event Type          | Description                            | Required Fields                                    | When to Use                                    |
| ------------------- | -------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| `UNLOAD_SCAN`       | Carton unloaded from truck             | `carton_id`, `inbound_session`, `asn_no`           | When carton is scanned to unload               |
| `RECEIVE_ITEM_SCAN` | Item received/scanned                  | `carton_id`, `item_code`, `qty`, `inbound_session` | When item is scanned during receiving          |
| `SORT_TO_BOX`       | Item sorted to store box               | `item_code`, `qty`, `box_id`, `store`              | When item is sorted to a box                   |
| `BOX_CLOSE`         | Box closed                             | `box_id`                                           | When box is closed                             |
| `BOX_REOPEN`        | Box reopened                           | `box_id`                                           | When closed box is reopened                    |
| `PACK_BOX_TO_TC`    | Box packed to transfer carton          | `item_code`, `qty`, `box_id`, `tc_id`              | When box is packed into transfer carton        |
| `TC_SEAL`           | Transfer carton sealed                 | `tc_id`                                            | When transfer carton is sealed                 |
| `TC_DISPATCH`       | Transfer carton dispatched             | `tc_id`                                            | When transfer carton is dispatched             |
| `PUTAWAY_CONFIRM`   | Items put away                         | `item_code`, `qty`, `rack`, `bin`                  | When items are confirmed put away              |
| `PUTAWAY_TO_RACK`   | Items assigned to rack                 | `item_code`, `rack`, `bin`                         | When rack/bin is assigned                      |
| `PUTAWAY_DISPATCH`  | Transfer carton dispatched for putaway | `tc_id`                                            | When transfer carton is dispatched for putaway |

---

## 📱 Mobile App Implementation Guide

### 1. Authentication Flow

```javascript
// Step 1: Login
const loginResponse = await fetch("https://api.example.com/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_code: "USER-172188",
    password: "password123",
  }),
});

const { data } = await loginResponse.json();
const accessToken = data.access_token;
const expiresIn = data.expires_in; // seconds

// Store token for subsequent requests
localStorage.setItem("access_token", accessToken);
localStorage.setItem("token_expires_at", Date.now() + expiresIn * 1000);
```

---

### 2. Master Data Sync (On App Start)

```javascript
// Fetch ASNs
const asnsResponse = await fetch("https://api.example.com/api/master/asns", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
const asns = await asnsResponse.json();

// Fetch Transfer Orders
const toResponse = await fetch(
  "https://api.example.com/api/master/transfer-orders",
  {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }
);
const transferOrders = await toResponse.json();

// Store in local database/cache
await localDB.saveASNs(asns);
await localDB.saveTransferOrders(transferOrders);
```

---

### 3. Inbound Session Workflow

```javascript
// Step 1: User selects ASN
const selectedASN = "ASN-0001";

// Step 2: Fetch ASN details
const asnDetails = await fetch(
  `https://api.example.com/api/asn/${selectedASN}`,
  {
    headers: { Authorization: `Bearer ${accessToken}` },
  }
);

// Step 3: Create session
const sessionId = `SESSION-${selectedASN}-${deviceId}-${userId}`;
await fetch("https://api.example.com/api/inbound/update", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    inbound_session: sessionId,
    asn_no: selectedASN,
    status: "Active",
    completed_cartons: 0,
    total_cartons: asnDetails.total_carton_count,
    user_id: userId,
    device_id: deviceId,
  }),
});

// Step 4: Scan carton to unload
await fetch("https://api.example.com/api/cartons/update-status", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    asn_no: selectedASN,
    inbound_session: sessionId,
    carton_id: scannedCartonId,
    status: "Unloaded",
    user_id: userId,
    device_id: deviceId,
  }),
});

// Step 5: Send unload event
await sendEvent({
  event_type: "UNLOAD_SCAN",
  carton_id: scannedCartonId,
  inbound_session: sessionId,
  advance_shipping_notice: selectedASN,
});

// Step 6: Lock carton for receiving
await fetch("https://api.example.com/api/carton/lock", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    carton_id: scannedCartonId,
    asn_no: selectedASN,
    inbound_session: sessionId,
    user_id: userId,
  }),
});

// Step 7: Scan items and receive
await fetch("https://api.example.com/api/inbound/receive-lines", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    receive_lines: [
      {
        parent_title: sessionId,
        carton_id: scannedCartonId,
        item_code: scannedItemCode,
        expected_qty: 50,
        received_qty: 50,
        condition: "Good",
        remarks: null,
      },
    ],
  }),
});

// Step 8: Send receive event
await sendEvent({
  event_type: "RECEIVE_ITEM_SCAN",
  carton_id: scannedCartonId,
  item_code: scannedItemCode,
  qty: 50,
  inbound_session: sessionId,
  advance_shipping_notice: selectedASN,
});

// Step 9: Complete carton
await fetch("https://api.example.com/api/carton/complete", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    carton_id: scannedCartonId,
    asn_no: selectedASN,
    inbound_session: sessionId,
    user_id: userId,
  }),
});
```

---

### 4. Sorting Workflow

```javascript
// Step 1: Fetch Transfer Order
const toResponse = await fetch(
  `https://api.example.com/api/transfer-order/by-asn/${asnNo}`,
  {
    headers: { Authorization: `Bearer ${accessToken}` },
  }
);
const transferOrder = await toResponse.json();

// Step 2: Fetch available boxes (created by desktop) OR scan barcode
// Option A: Fetch available boxes
const boxesResponse = await fetch(
  `https://api.example.com/api/boxes?asn=${asnNo}&store=${store}&status=Open`,
  {
    headers: { Authorization: `Bearer ${accessToken}` },
  }
);
const boxesData = await boxesResponse.json();
const availableBoxes = boxesData.data || boxesData;

// User selects a box from the list
const selectedBox = availableBoxes[0]; // or user selection
const boxId = selectedBox.box_id;

// Option B: Scan barcode (alternative flow)
// const scannedBoxId = scanBarcode(); // e.g., "BOX-STORE-001-001"
// const boxResponse = await fetch(
//   `https://api.example.com/api/boxes/${scannedBoxId}`,
//   {
//     headers: { Authorization: `Bearer ${accessToken}` },
//   }
// );
// const boxData = await boxResponse.json();
// const boxId = boxData.data.box_id;

// Step 3: Sort items to box
await sendEvent({
  event_type: "SORT_TO_BOX",
  item_code: itemCode,
  qty: quantity,
  box_id: boxId,
  store: store,
  advance_shipping_notice: asnNo,
  transfer_order: transferOrder.to_no,
});

// Step 4: Close box when full
await fetch("https://api.example.com/api/boxes/close", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    box_id: boxId,
    user_id: userId,
  }),
});
```

---

### 5. Transfer Carton Workflow

```javascript
// Step 1: Create transfer carton
const tcId = `TC-001-001`;
await fetch("https://api.example.com/api/transfer-cartons/create", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    tc_id: tcId,
    asn_no: asnNo,
    to_no: transferOrder.to_no,
    store: store,
    user_id: userId,
  }),
});

// Step 2: Pack box to transfer carton
await sendEvent({
  event_type: "PACK_BOX_TO_TC",
  item_code: itemCode,
  qty: quantity,
  box_id: boxId,
  tc_id: tcId,
  store: store,
  advance_shipping_notice: asnNo,
  transfer_order: transferOrder.to_no,
});

// Step 3: Seal transfer carton
await fetch("https://api.example.com/api/transfer-cartons/seal", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    tc_id: tcId,
    user_id: userId,
  }),
});

// Step 4: Dispatch transfer carton
await fetch("https://api.example.com/api/transfer-cartons/dispatch", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    tc_id: tcId,
    user_id: userId,
  }),
});
```

---

### 6. Event Sending Helper Function

```javascript
async function sendEvent(eventData) {
  // Generate offline UUID for retry/idempotency
  const offlineUuid = generateUUID();

  // Store event locally first (for offline support)
  await localDB.saveEvent({
    ...eventData,
    offline_uuid: offlineUuid,
    event_time: new Date().toISOString(),
    device_id: deviceId,
    user_id: userId,
  });

  // Try to send to backend
  try {
    const response = await fetch("https://api.example.com/api/events/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        events: [
          {
            offline_uuid: offlineUuid,
            ...eventData,
            event_time: new Date().toISOString(),
            device_id: deviceId,
            user_id: userId,
          },
        ],
      }),
    });

    if (response.ok) {
      // Mark event as synced
      await localDB.markEventSynced(offlineUuid);
    }
  } catch (error) {
    // Event will be retried later (offline support)
    console.error("Failed to send event:", error);
  }
}
```

---

## 🖥️ Desktop App Sync Process

### 1. Inbound Sessions Sync

**When:** User opens "Inbound Sessions" screen

**Desktop App Actions:**

1. Calls `GET /api/inbound/sessions` from backend API
2. Syncs sessions to local database (`tabInboundSession`)
3. Syncs unload lines (`tabInboundUnloadLine`)
4. Syncs receive lines (`tabInboundReceiveLine`)
5. Displays sessions in UI

**Code Flow:**

```
InboundSessionListView (Loaded Event)
  → InboundSessionListViewModel.RefreshAsync()
    → InboundSessionSyncService.SyncFromApiAsync()
      → InboundSessionApiService.FetchSessionsFromApiAsync()
        → GET /api/inbound/sessions
      → Sync to local DB (INSERT ... ON DUPLICATE KEY UPDATE)
    → InboundSessionDataService.GetInboundSessionsAsync()
      → Load from local DB
    → Display in UI
```

---

### 2. Transfer Carton Sync

**When:** User opens "Transfer Cartons" screen

**Desktop App Actions:**

1. Calls `GET /api/master/transfer-cartons` from backend API
2. Syncs to local database (`tabTransferCarton`)
3. Displays in UI

**Transfer Carton Details:**

- Items are loaded from `tabWmsScanEvent` where `tc_id` matches
- Event type: `PACK_BOX_TO_TC`

---

### 3. Sort Box Sync

**When:** User opens "Sort Boxes" screen

**Desktop App Actions:**

1. Loads from local database (`tabSortBox`)
2. If API available, syncs from backend via `GET /api/boxes`
3. Displays all sort boxes with status

**Creating Sort Boxes:**

1. User clicks "Create New Box" button
2. User enters ASN, Transfer Order, Store details
3. Desktop app generates unique Box ID
4. Desktop app saves to local database
5. Desktop app syncs to backend via `POST /api/boxes/create`
6. Desktop app prints barcode label with Box ID

**Sort Box Contents:**

- Items are loaded from `tabWmsScanEvent` where `box_id` matches
- Event type: `SORT_TO_BOX`

---

## 🔐 Authentication & Security

### Token Management

**Token Expiration:** Tokens expire after `expires_in` seconds (typically 7 days)

**Token Refresh:**

- Mobile app should check token expiration before API calls
- Re-login if token expired

**Offline Support:**

- Mobile app stores events locally when offline
- Syncs events when connection restored
- Uses `offline_uuid` for idempotency (prevents duplicate events)

---

## 📊 Database Tables Reference

### Core Tables

| Table                      | Purpose                                   | Key Fields                                       |
| -------------------------- | ----------------------------------------- | ------------------------------------------------ |
| `tabInboundSession`        | Inbound sessions                          | `inbound_session` (PK), `asn_no`, `status`       |
| `tabInboundUnloadLine`     | Unloaded cartons                          | `parent_title`, `unit_type`, `unit_id`           |
| `tabInboundReceiveLine`    | Received items                            | `parent_title`, `carton_id`, `item_code`         |
| `tabReceivingCarton`       | Carton receiving status                   | `carton_id`, `advance_shipping_notice`, `status` |
| `tabCartonStatus`          | Carton status tracking                    | `carton_id`, `status`                            |
| `tabSortBox`               | Store boxes                               | `box_id` (PK), `asn_no`, `store`, `status`       |
| `tabTransferCarton`        | Transfer cartons                          | `tc_id` (PK), `asn_no`, `store`, `status`        |
| `tabWmsScanEvent`          | All scan events (audit trail)             | `offline_uuid` (UK), `event_type`, `event_time`  |
| `tabAdvanceShippingNotice` | ASN master data (from ERPNext)            | `title` (PK), `status`, `purchase_order`         |
| `tabAsnItemDetails`        | ASN item details (from ERPNext)           | `parent_title`, `item_code`, `carton_id`         |
| `tabTransferOrder`         | Transfer Order master data (from ERPNext) | `title` (PK), `status`                           |

---

## 🎯 Key Points & Best Practices

### 1. ASN Format Preservation

- ✅ Backend API preserves ASN format exactly as stored in database
- ✅ No normalization (preserves 3, 4, 5, 10 digits, etc.)
- ✅ Mobile and Desktop apps receive same format

### 2. Duplicate Prevention

- ✅ Use consistent `inbound_session` ID for same session
- ✅ Use `offline_uuid` for events (prevents duplicate events)
- ✅ Backend uses UPSERT logic (`ON DUPLICATE KEY UPDATE`)

### 3. Offline Support

- ✅ Mobile app stores events locally when offline
- ✅ Events synced when connection restored
- ✅ `offline_uuid` ensures idempotency

### 4. Real-time Sync

- ✅ Desktop app syncs from backend API on screen load
- ✅ Falls back to local database if API unavailable
- ✅ Keeps existing data if sync fails

### 5. Event Tracking

- ✅ All actions generate events in `tabWmsScanEvent`
- ✅ Events provide complete audit trail
- ✅ Events used to derive box/carton contents

### 6. Status Flow

- ✅ Carton: `Assigned` → `Unloaded` → `Receiving` → `Received`
- ✅ Session: `Draft` → `Active` → `Completed`
- ✅ Box: `Open` → `Filling` → `Closed`
- ✅ Transfer Carton: `Created` → `Filling` → `Sealed` → `Dispatched` → `Received` → `Completed`

---

## 📝 Implementation Checklist

### Mobile App

- [ ] Implement authentication flow
- [ ] Implement master data sync (ASN, Transfer Orders)
- [ ] Implement inbound session creation
- [ ] Implement carton unload scanning
- [ ] Implement item receiving
- [ ] Implement sorting to boxes
- [ ] Implement transfer carton creation and packing
- [ ] Implement event sending (with offline support)
- [ ] Implement session completion

### Backend API

- [ ] Set up ERPNext sync job (master data)
- [ ] Implement all API endpoints
- [ ] Implement event batch processing
- [ ] Implement duplicate prevention
- [ ] Implement authentication middleware
- [ ] Implement `GET /api/boxes/{box_id}` endpoint (for barcode validation)
- [ ] Implement `GET /api/boxes` with status filter

### Desktop App

- [ ] Implement API sync services
- [ ] Implement local database storage
- [ ] Implement real-time sync on screen load
- [ ] Implement fallback to local data
- [ ] Implement Sort Box creation UI
- [ ] Implement barcode label printing for Sort Boxes
- [ ] Implement Sort Box sync to backend API

---

## 🔗 API Base URL

**Development:**

```
https://erpnext.printechs.example.com/api
```

**Production:**

```
https://api.printechs.com
```

---

## 📞 Support & Troubleshooting

### Common Issues

1. **Token Expired**

   - Solution: Re-login and get new token

2. **Duplicate Sessions**

   - Solution: Use consistent `inbound_session` ID

3. **Events Not Syncing**

   - Solution: Check `offline_uuid` uniqueness
   - Solution: Check network connection

4. **Receive Lines Not Showing**
   - Solution: Ensure carton is unloaded first
   - Solution: Check `parent_title` matches session ID

---

**Document Version:** 1.0  
**Last Updated:** 2024-12-25  
**Status:** Complete Workflow Documentation
