# Putaway API - Mobile App Reference

## Base URL

```
http://your-api-server/api/putaway
```

## Authentication

All endpoints require Bearer token authentication:

```
Authorization: Bearer {your_token}
```

---

## 1. Get Putaway Tasks

**URL:** `GET /api/putaway/tasks`

**Query Parameters (all optional):**

- `status` - Filter by status: `Draft`, `Open`, `In Progress`, `Completed`, `Cancelled`
- `source_type` - Filter by source: `ASN` or `TransferIn`
- `advance_shipping_notice` - Filter by ASN number
- `transfer_in` - Filter by Transfer In number

**Example Requests:**

```
GET /api/putaway/tasks
GET /api/putaway/tasks?status=Open
GET /api/putaway/tasks?status=Open&source_type=ASN
GET /api/putaway/tasks?status=Open&source_type=ASN&advance_shipping_notice=ASN-0001
GET /api/putaway/tasks?status=Open&source_type=TransferIn&transfer_in=TI-0001
```

**Response (200):**

```json
[
  {
    "title": "PUT-20250120-0001",
    "status": "Open",
    "source_type": "ASN",
    "advance_shipping_notice": "ASN-0001",
    "transfer_in": null,
    "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
    "created_by": "SYSTEM",
    "created_at": "2025-01-20T10:00:00.000Z",
    "updated_at": "2025-01-20T10:00:00.000Z",
    "items": [
      {
        "item_code": "SKU-001",
        "qty": 50.0,
        "carton_id": "CTN-0101",
        "rack": "RACK-A",
        "bin": "BIN-01"
      },
      {
        "item_code": "SKU-002",
        "qty": 100.0,
        "carton_id": "CTN-0102",
        "rack": "RACK-B",
        "bin": "BIN-02"
      }
    ]
  }
]
```

**Error Response (500):**

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to get putaway tasks"
  }
}
```

---

## 2. Get Remaining Items for Putaway

**URL:** `GET /api/putaway/remaining-items?asn={asn_no}`

**Query Parameters:**

- `asn` (required) - ASN number

**Example Request:**

```
GET /api/putaway/remaining-items?asn=ASN-0001
```

**Response (200):**

```json
{
  "ok": true,
  "data": [
    {
      "item_code": "SKU-001",
      "carton_id": "CTN-0102",
      "remaining_qty": 50,
      "asn_no": "ASN-0001"
    },
    {
      "item_code": "SKU-002",
      "carton_id": null,
      "remaining_qty": 100,
      "asn_no": "ASN-0001"
    }
  ]
}
```

**Error Response (400):**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "asn query parameter is required"
  }
}
```

**Error Response (500):**

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to get remaining items"
  }
}
```

---

## 3. Create Putaway Task for Remaining Items (NEW)

**URL:** `POST /api/putaway/create-task-for-remaining-items`

**Purpose:** Manually create putaway tasks for remaining items (items not sorted to Transfer Orders)

**Request Body:**

```json
{
  "asn_no": "ASN-AAA"
}
```

**Required Fields:**

- `asn_no` (string) - ASN number

**Example Request:**

```
POST /api/putaway/create-task-for-remaining-items
```

**Response (200):**

```json
{
  "ok": true,
  "message": "Putaway task created for remaining items",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "asn_no": "ASN-AAA",
    "remaining_items_count": 3,
    "items_added": 3,
    "items": [
      {
        "item_code": "SKU-001",
        "carton_id": "CTN-001",
        "qty": 25.0
      }
    ],
    "is_new_task": true
  }
}
```

**Response (200) - No Remaining Items:**

```json
{
  "ok": true,
  "message": "No remaining items found. All items were sorted to transfer orders.",
  "data": {
    "asn_no": "ASN-AAA",
    "remaining_items_count": 0,
    "putaway_task": null
  }
}
```

**Error Response (400):**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "asn_no is required"
  }
}
```

**Error Response (400) - ASN Not Found:**

```json
{
  "ok": false,
  "error": {
    "code": "ASN_NOT_FOUND",
    "message": "ASN ASN-AAA not found or has no items"
  }
}
```

**Error Response (400) - No Inbound Session:**

```json
{
  "ok": false,
  "error": {
    "code": "NO_INBOUND_SESSION",
    "message": "No inbound session found for ASN ASN-AAA"
  }
}
```

**Error Response (500):**

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to create putaway task for remaining items"
  }
}
```

**When to Use:**

- After sorting is complete
- When putaway tasks are not automatically created
- To ensure remaining items appear in putaway screen

**Note:** This is an **optional** endpoint. Putaway tasks can also be created automatically by the desktop app or backend.

---

## 4. Assign Rack/Bin for Putaway

**URL:** `POST /api/putaway/assign-rack`

**Request Body:**

```json
{
  "putaway_task": "PUT-20250120-0001",
  "carton_id": "CTN-0101",
  "item_code": "SKU-001",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "qty": 50.0,
  "user_id": "USER-001"
}
```

**Required Fields:**

- `putaway_task` (string) - Putaway task title/ID
- `rack` (string) - Rack location

**Optional Fields:**

- `carton_id` (string) - Carton ID
- `item_code` (string) - Item code
- `qty` (number) - Quantity
- `bin` (string) - Bin location
- `user_id` (string) - User ID

**Response (200):**

```json
{
  "ok": true,
  "message": "Rack assigned successfully"
}
```

**Error Response (400):**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "putaway_task and rack are required"
  }
}
```

**Error Response (404):**

```json
{
  "ok": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Putaway task PUT-20250120-0001 not found"
  }
}
```

**Error Response (500):**

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to assign rack"
  }
}
```

---

## 5. Scan Transfer Carton or Box and Location

**URL:** `POST /api/putaway/scan-transfer-carton`

**Request Body:**

```json
{
  "tc_id": "TC-1766952896460",
  "box_id": "BOX-WHMAIN-514364",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-001"
}
```

**Required Fields:**

- Either `tc_id` (string) OR `box_id` (string) - Transfer Carton ID or Box ID
- `rack` (string) - Rack location

**Optional Fields:**

- `bin` (string) - Bin location
- `user_id` (string) - User ID

**Note:** You can scan either:

- **Transfer Carton ID** (e.g., "TC-1766952896460") - processes all boxes in the TC
- **Box ID** (e.g., "BOX-WHMAIN-514364") - processes only that specific box (must be sealed and in a TC)

**Response (200):**

```json
{
  "ok": true,
  "message": "Putaway task created and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "transfer_carton": "TC-1766952896460",
    "box_id": "BOX-WHMAIN-514364",
    "asn_no": "ASN-AAA",
    "rack": "RACK-A",
    "bin": "BIN-01",
    "items_count": 3,
    "items": [
      {
        "item_code": "SKU-001",
        "box_id": "BOX-WHMAIN-514364",
        "carton_id": "BOX-WHMAIN-514364",
        "qty": 50.0,
        "rack": "RACK-A",
        "bin": "BIN-01"
      },
      {
        "item_code": "SKU-002",
        "box_id": "BOX-WHMAIN-514364",
        "carton_id": "BOX-WHMAIN-514364",
        "qty": 100.0,
        "rack": "RACK-A",
        "bin": "BIN-01"
      }
    ],
    "is_new_task": true
  }
}
```

**How It Works:**

1. Validates transfer carton exists
2. Gets ASN from transfer carton
3. Gets all items from transfer carton (from `PACK_BOX_TO_TC` events)
4. Finds or creates putaway task for the ASN
5. Creates/updates putaway lines for each item with the scanned location
6. Returns putaway task details with all assigned items

**Error Responses:**

**400 - Validation Error:**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "tc_id and rack are required"
  }
}
```

**404 - Box Not Found:**

```json
{
  "ok": false,
  "error": {
    "code": "BOX_NOT_FOUND",
    "message": "Box BOX-WHMAIN-514364 not found"
  }
}
```

**400 - Box Not Sealed:**

```json
{
  "ok": false,
  "error": {
    "code": "BOX_NOT_SEALED",
    "message": "Box BOX-WHMAIN-514364 is not sealed. Please ensure it is sealed and belongs to warehouse."
  }
}
```

**404 - Transfer Carton Not Found:**

```json
{
  "ok": false,
  "error": {
    "code": "TRANSFER_CARTON_NOT_FOUND",
    "message": "Transfer Carton for box BOX-WHMAIN-514364 not found in sealed list. Please ensure it is sealed and belongs to warehouse."
  }
}
```

**400 - No Items Found:**

```json
{
  "ok": false,
  "error": {
    "code": "NO_ITEMS_FOUND",
    "message": "No items found in transfer carton TC-1766952896460"
  }
}
```

**400 - No ASN:**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Transfer carton TC-1766952896460 has no associated ASN"
  }
}
```

**400 - No Inbound Session:**

```json
{
  "ok": false,
  "error": {
    "code": "NO_INBOUND_SESSION",
    "message": "No inbound session found for ASN ASN-AAA"
  }
}
```

---

## 6. Complete Putaway Task

**URL:** `POST /api/putaway/complete`

**Request Body:**

```json
{
  "putaway_task": "PUT-20250120-0001",
  "performed_by": "USER-002",
  "items": [
    {
      "item_code": "SKU-001",
      "qty": 50.0,
      "source_bin": "DOCK-01",
      "target_bin": "RACK-A-01-BIN-05",
      "completed": true
    },
    {
      "item_code": "SKU-002",
      "qty": 100.0,
      "source_bin": "DOCK-01",
      "target_bin": "RACK-B-02-BIN-10",
      "completed": true
    }
  ]
}
```

**Required Fields:**

- `putaway_task` (string) - Putaway task title/ID

**Optional Fields:**

- `performed_by` (string) - User who performed the putaway
- `items` (array) - Array of completed items
  - `item_code` (string) - Item code
  - `qty` (number) - Quantity
  - `source_bin` (string) - Source bin location
  - `target_bin` (string) - Target bin location
  - `completed` (boolean) - Whether item is completed

**Response (200):**

```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "status": "Completed",
    "stock_updated": false
  }
}
```

**Error Response (400):**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "putaway_task is required"
  }
}
```

**Error Response (404):**

```json
{
  "ok": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Putaway task PUT-20250120-0001 not found"
  }
}
```

**Error Response (500):**

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to complete putaway"
  }
}
```

---

## Complete Workflow Example

### Step 1: Get Putaway Tasks

```
GET /api/putaway/tasks?status=Open&source_type=ASN
```

### Step 2: Get Remaining Items (if needed)

```
GET /api/putaway/remaining-items?asn=ASN-0001
```

### Step 3: Assign Rack/Bin

```
POST /api/putaway/assign-rack
{
  "putaway_task": "PUT-20250120-0001",
  "carton_id": "CTN-0101",
  "item_code": "SKU-001",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "qty": 50.00,
  "user_id": "USER-001"
}
```

### Step 4: Scan Transfer Carton and Location (Alternative Workflow)

**For Transfer Cartons:**

```
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TC-1766952896460",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-001"
}
```

**This endpoint:**

- Automatically finds or creates putaway task
- Gets all items from transfer carton
- Assigns location to all items
- Returns putaway task details

### Step 5: Complete Putaway

```
POST /api/putaway/complete
{
  "putaway_task": "PUT-20250120-0001",
  "performed_by": "USER-002",
  "items": [
    {
      "item_code": "SKU-001",
      "qty": 50.00,
      "source_bin": "DOCK-01",
      "target_bin": "RACK-A-01-BIN-05",
      "completed": true
    }
  ]
}
```

---

## Status Values

- `Draft` - Task created but not started
- `Open` - Task is open and ready for work
- `In Progress` - Task is being worked on
- `Completed` - Task is completed
- `Cancelled` - Task is cancelled

---

## Source Types

- `ASN` - Items from Advance Shipping Notice (supplier receiving)
- `TransferIn` - Items from Transfer In (showroom to warehouse)
