# Mobile App API Documentation - Material Request & Stock Transfer Out

## 📋 Overview

This document provides complete API documentation for mobile app development related to Stock Transfer Out to Showroom (Material Request workflow).

**Base URL:** `https://your-api-domain.com/api`  
**Authentication:** All endpoints require Bearer token authentication

---

## 🔐 Authentication

All API requests require authentication using Bearer token:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Get Token:**

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

---

## 📦 Material Request APIs

### 1. Get Material Requests List

**Endpoint:** `GET /api/material-requests`

**Description:** Fetch all Material Requests with optional filtering

**Query Parameters:**

- `status` (optional): Filter by status (`Draft`, `Submitted`, `In Progress`, `Picked`, `Dispatched`, `Completed`)
- `from_warehouse` (optional): Filter by source warehouse code
- `to_showroom` (optional): Filter by destination showroom code

**Example Request:**

```http
GET /api/material-requests?status=Submitted&from_warehouse=WH-MAIN
Authorization: Bearer YOUR_TOKEN
```

**Example Response (200 OK):**

```json
[
  {
    "title": "MR-0001",
    "status": "Submitted",
    "from_warehouse": "WH-MAIN",
    "to_showroom": "SHOWROOM-001",
    "request_date": "2026-01-03",
    "required_date": "2026-01-05",
    "requested_by": "USER-003",
    "total_requested_qty": 35.0,
    "total_picked_qty": 0.0,
    "items": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "requested_qty": 20.0,
        "picked_qty": 0.0
      },
      {
        "item_code": "SKU-SHIRT-001-WHT-M",
        "requested_qty": 15.0,
        "picked_qty": 0.0
      }
    ],
    "created_at": "2026-01-03T08:00:00.000Z",
    "updated_at": "2026-01-03T08:00:00.000Z"
  }
]
```

**Error Responses:**

- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Database error

---

### 2. Get Single Material Request

**Endpoint:** `GET /api/material-requests/:title`

**Description:** Get details of a single Material Request

**Example Request:**

```http
GET /api/material-requests/MR-0001
Authorization: Bearer YOUR_TOKEN
```

**Example Response (200 OK):**

```json
{
  "title": "MR-0001",
  "status": "Submitted",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "SHOWROOM-001",
  "request_date": "2026-01-03",
  "required_date": "2026-01-05",
  "requested_by": "USER-003",
  "total_requested_qty": 35.0,
  "total_picked_qty": 0.0,
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.0,
      "picked_qty": 0.0
    },
    {
      "item_code": "SKU-SHIRT-001-WHT-M",
      "requested_qty": 15.0,
      "picked_qty": 0.0
    }
  ],
  "created_at": "2026-01-03T08:00:00.000Z",
  "updated_at": "2026-01-03T08:00:00.000Z"
}
```

**Error Responses:**

- `404 Not Found`: Material Request not found
- `401 Unauthorized`: Invalid or missing token

---

### 3. Update Material Request Status

**Endpoint:** `POST /api/material-requests/:title/update-status`

**Description:** Update Material Request status (e.g., mark as Dispatched)

**Example Request:**

```http
POST /api/material-requests/MR-0001/update-status
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "status": "Dispatched",
  "dispatched_by": "USER-004",
  "dispatched_on": "2026-01-03T11:00:00Z"
}
```

**Valid Status Values:**

- `Draft`
- `Submitted`
- `In Progress`
- `Picked`
- `Dispatched`
- `Completed`
- `Cancelled`

**Example Response (200 OK):**

```json
{
  "ok": true,
  "message": "Material Request status updated successfully",
  "data": {
    "title": "MR-0001",
    "status": "Dispatched"
  }
}
```

**Error Responses:**

- `400 Bad Request`: Invalid status value or missing required fields
- `404 Not Found`: Material Request not found
- `401 Unauthorized`: Invalid or missing token

---

## 📊 Stock Ledger APIs

### 4. Get Stock Ledger by Item

**Endpoint:** `GET /api/stock-ledger/:item_code/:warehouse`

**Description:** Get stock availability for a specific item in a warehouse

**Example Request:**

```http
GET /api/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN
Authorization: Bearer YOUR_TOKEN
```

**Example Response (200 OK):**

```json
[
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "RACK-A-01-BIN-05",
    "qty": 100.0,
    "reserved_qty": 0.0,
    "available_qty": 100.0,
    "last_transaction_date": "2026-01-03T10:30:00.000Z",
    "last_transaction_type": "Putaway",
    "last_transaction_ref": "PUT-0001"
  }
]
```

**Error Responses:**

- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Database error

---

## 📦 Transfer Carton APIs

### 5. Create Transfer Carton

**Endpoint:** `POST /api/transfer-cartons/create`

**Description:** Create a new Transfer Carton for packing items

**Example Request:**

```http
POST /api/transfer-cartons/create
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "tc_id": "TC-MR0001-001",
  "asn_no": null,
  "to_no": null,
  "store": "SHOWROOM-001",
  "user_id": "USER-004"
}
```

**Note:** For Material Request transfers, `asn_no` and `to_no` can be `null`.

**Example Response (200 OK):**

```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-MR0001-001",
    "status": "Created"
  }
}
```

**Error Responses:**

- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Database error

---

### 6. Seal Transfer Carton

**Endpoint:** `POST /api/transfer-cartons/seal`

**Description:** Seal a Transfer Carton when packing is complete

**Example Request:**

```http
POST /api/transfer-cartons/seal
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "tc_id": "TC-MR0001-001",
  "sealed_by": "USER-004"
}
```

**Example Response (200 OK):**

```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully"
}
```

**Error Responses:**

- `400 Bad Request`: Missing tc_id
- `404 Not Found`: Transfer Carton not found
- `401 Unauthorized`: Invalid or missing token

---

### 7. Get Transfer Cartons List

**Endpoint:** `GET /api/transfer-cartons`

**Description:** Get list of Transfer Cartons with optional filtering

**Query Parameters:**

- `status` (optional): Filter by status
- `store` (optional): Filter by destination store/showroom

**Example Request:**

```http
GET /api/transfer-cartons?status=Created&store=SHOWROOM-001
Authorization: Bearer YOUR_TOKEN
```

---

## 🔄 Event APIs (Packing)

### 8. Pack Items/Boxes to Transfer Carton

**Endpoint:** `POST /api/events/batch`

**Description:** Pack items or boxes to Transfer Carton (batch event processing)

**Example Request - Pack Individual Items:**

```http
POST /api/events/batch
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-03T10:45:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-004",
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 20.00,
      "store": "SHOWROOM-001",
      "tc_id": "TC-MR0001-001",
      "source_bin": "STAGE-SHOWROOM-001"
    }
  ]
}
```

**Example Request - Pack Boxes:**

```http
POST /api/events/batch
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "events": [
    {
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2026-01-03T10:45:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-004",
      "box_id": "BOX-SHOWROOM-001-001",
      "tc_id": "TC-MR0001-001",
      "store": "SHOWROOM-001"
    }
  ]
}
```

**Example Response (200 OK):**

```json
{
  "ok": true,
  "processed": 1,
  "failed": 0
}
```

**Event Types:**

- `PACK_ITEM_TO_TC`: Pack individual item to Transfer Carton
- `PACK_BOX_TO_TC`: Pack box to Transfer Carton

**Error Responses:**

- `400 Bad Request`: Invalid event data
- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Database error

---

## 🔑 Master Data APIs

### 9. Get All Items

**Endpoint:** `GET /api/master/items`

**Description:** Get all items from master data (for item selection, barcode lookup)

**Example Request:**

```http
GET /api/master/items
Authorization: Bearer YOUR_TOKEN
```

**Example Response (200 OK):**

```json
[
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "code": "SKU-HAT-301-GRN-OS",
    "item_name": "Baseball Cap Green One Size",
    "name": "Baseball Cap Green One Size",
    "barcode": "1234567890137",
    "item_group": null,
    "brand": null,
    "default_uom": "Nos",
    "stock_uom": "Nos",
    "maintain_stock": true,
    "stock_qty": 100.0,
    "reserved_qty": 0.0,
    "updated_on": null,
    "created_at": "2026-01-03T10:30:00.000Z",
    "updated_at": "2026-01-03T10:30:00.000Z"
  }
]
```

---

## 📱 Mobile App Workflow Implementation

### Step 1: Sync Material Requests

```javascript
// Fetch Material Requests for picking
const response = await fetch(
  `${API_BASE_URL}/material-requests?status=Submitted&from_warehouse=WH-MAIN`,
  {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  }
);

const materialRequests = await response.json();
```

### Step 2: View Material Request Details

```javascript
// Get Material Request details
const response = await fetch(`${API_BASE_URL}/material-requests/MR-0001`, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
});

const materialRequest = await response.json();
```

### Step 3: Check Stock Availability

```javascript
// Check stock before picking
const response = await fetch(
  `${API_BASE_URL}/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN`,
  {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  }
);

const stockLedger = await response.json();
// stockLedger shows available stock in different bin locations
```

### Step 4: Create Transfer Carton

```javascript
// Create Transfer Carton after picking is complete
const response = await fetch(`${API_BASE_URL}/transfer-cartons/create`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tc_id: "TC-MR0001-001",
    asn_no: null,
    to_no: null,
    store: "SHOWROOM-001",
    user_id: "USER-004",
  }),
});

const result = await response.json();
```

### Step 5: Pack Items to Transfer Carton

```javascript
// Pack items to Transfer Carton
const response = await fetch(`${API_BASE_URL}/events/batch`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    events: [
      {
        event_type: "PACK_ITEM_TO_TC",
        event_time: new Date().toISOString(),
        device_id: "DEVICE-001",
        user_id: "USER-004",
        item_code: "SKU-HAT-301-GRN-OS",
        qty: 20.0,
        store: "SHOWROOM-001",
        tc_id: "TC-MR0001-001",
        source_bin: "STAGE-SHOWROOM-001",
      },
    ],
  }),
});

const result = await response.json();
```

### Step 6: Seal Transfer Carton

```javascript
// Seal Transfer Carton
const response = await fetch(`${API_BASE_URL}/transfer-cartons/seal`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tc_id: "TC-MR0001-001",
    sealed_by: "USER-004",
  }),
});

const result = await response.json();
```

### Step 7: Update Material Request Status

```javascript
// Mark Material Request as Dispatched
const response = await fetch(
  `${API_BASE_URL}/material-requests/MR-0001/update-status`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "Dispatched",
      dispatched_by: "USER-004",
      dispatched_on: new Date().toISOString(),
    }),
  }
);

const result = await response.json();
```

---

## ✅ Status Flow

### Material Request Status Flow:

```
Draft → Submitted → In Progress → Picked → Dispatched → Completed
```

### Transfer Carton Status Flow:

```
Created → Sealed → Dispatched
```

---

## 🔍 Important Notes

1. **Picking Transactions**: The picking process (Step 3 in the process document) may be handled via a separate WMS Transactions API or Events API. Check with backend team for the exact endpoint.

2. **Offline Support**: Material Requests can be synced and stored locally for offline picking operations.

3. **Stock Availability**: Always check stock availability before picking to ensure sufficient stock exists.

4. **Transfer Carton Creation**: Transfer Carton can be created before or after packing, but must be created before sealing.

5. **Event Batching**: The events/batch endpoint supports multiple events in a single request for efficiency.

---

## 🐛 Error Handling

All error responses follow this format:

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
- `DUPLICATE_ENTRY`: Duplicate record
- `DATABASE_ERROR`: Database operation failed
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Insufficient permissions

---

## 📞 Support

For API issues or questions, contact the backend development team.

**Last Updated:** 2026-01-03
