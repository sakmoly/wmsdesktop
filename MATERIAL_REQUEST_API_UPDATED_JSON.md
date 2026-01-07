# Material Request API - Updated JSON Examples (With Status Field)

## Base URL

```
http://your-api-server:3000/api
```

---

## 1. GET Material Requests (List)

### Endpoint

```
GET /api/material-requests
```

### Query Parameters (Optional)

- `status` - Filter by Material Request status (e.g., "Submitted", "In Progress", "Picked")
- `from_warehouse` - Filter by warehouse code
- `to_showroom` - Filter by showroom code

### Example Request

```bash
GET /api/material-requests
GET /api/material-requests?status=In Progress
GET /api/material-requests?from_warehouse=WH-MAIN
```

### Response (200 OK)

```json
[
  {
    "title": "MR-0001",
    "status": "In Progress",
    "from_warehouse": "WH-MAIN",
    "to_showroom": "STORE-001",
    "request_date": "2026-01-25",
    "required_date": "2026-01-25",
    "requested_by": "SYSTEM",
    "total_requested_qty": 100.0,
    "total_picked_qty": 40.0,
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "requested_qty": 20.0,
        "picked_qty": 20.0,
        "pending_qty": 0.0,
        "status": "Picked"
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "requested_qty": 20.0,
        "picked_qty": 20.0,
        "pending_qty": 0.0,
        "status": "Picked"
      },
      {
        "item_code": "SKU-HAT-301-RED-OS",
        "requested_qty": 20.0,
        "picked_qty": 0.0,
        "pending_qty": 20.0,
        "status": "Pending"
      },
      {
        "item_code": "SKU-JACKET-201-BLK-L",
        "requested_qty": 20.0,
        "picked_qty": 0.0,
        "pending_qty": 20.0,
        "status": "Pending"
      },
      {
        "item_code": "SKU-JACKET-201-BLK-M",
        "requested_qty": 20.0,
        "picked_qty": 0.0,
        "pending_qty": 20.0,
        "status": "Pending"
      }
    ],
    "created_at": "2026-01-25T10:00:00.000Z",
    "updated_at": "2026-01-25T12:30:00.000Z"
  }
]
```

### Response Fields

- `title` - Material Request number (e.g., "MR-0001")
- `status` - Material Request header status: "Draft", "Submitted", "In Progress", "Picked", "Dispatched", "Completed"
- `from_warehouse` - Source warehouse code
- `to_showroom` - Destination showroom code
- `request_date` - Request date (YYYY-MM-DD)
- `required_date` - Required date (YYYY-MM-DD, optional)
- `requested_by` - User who requested
- `total_requested_qty` - Total quantity requested
- `total_picked_qty` - Total quantity picked
- `items` - Array of Material Request items
  - `item_code` - Item code/SKU
  - `requested_qty` - Quantity requested
  - `picked_qty` - Quantity picked
  - `pending_qty` - Quantity pending (requested - picked)
  - `status` - **Item-level status**: "Pending", "In Progress", "Picked" ✅ NEW

---

## 2. GET Single Material Request

### Endpoint

```
GET /api/material-requests/:title
```

### Example Request

```bash
GET /api/material-requests/MR-0001
```

### Response (200 OK)

```json
{
  "title": "MR-0001",
  "status": "In Progress",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "STORE-001",
  "request_date": "2026-01-25",
  "required_date": "2026-01-25",
  "requested_by": "SYSTEM",
  "total_requested_qty": 100.0,
  "total_picked_qty": 40.0,
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 20.0,
      "picked_qty": 20.0,
      "pending_qty": 0.0,
      "status": "Picked"
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.0,
      "picked_qty": 20.0,
      "pending_qty": 0.0,
      "status": "Picked"
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "requested_qty": 20.0,
      "picked_qty": 0.0,
      "pending_qty": 20.0,
      "status": "Pending"
    },
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "requested_qty": 20.0,
      "picked_qty": 0.0,
      "pending_qty": 20.0,
      "status": "Pending"
    },
    {
      "item_code": "SKU-JACKET-201-BLK-M",
      "requested_qty": 20.0,
      "picked_qty": 0.0,
      "pending_qty": 20.0,
      "status": "Pending"
    }
  ],
  "created_at": "2026-01-25T10:00:00.000Z",
  "updated_at": "2026-01-25T12:30:00.000Z"
}
```

---

## 3. POST Create Material Request

### Endpoint

```
POST /api/material-requests
```

### Request Headers

```
Content-Type: application/json
```

### Request Body

```json
{
  "title": "MR-0002",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "STORE-002",
  "request_date": "2026-01-26",
  "required_date": "2026-01-27",
  "requested_by": "USER-001",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 15.0
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 10.0
    },
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "requested_qty": 5.0
    }
  ]
}
```

### Response (201 Created)

```json
{
  "ok": true,
  "message": "Material Request created successfully",
  "data": {
    "title": "MR-0002",
    "status": "Draft",
    "total_requested_qty": 30.0
  }
}
```

### Note

- Items will be created with `picked_qty = 0` and `status = "Pending"` by default

---

## 4. POST Pick Material Request Items

### Endpoint

```
POST /api/material-requests/:title/pick-items
```

### Example Request

```bash
POST /api/material-requests/MR-0001/pick-items
```

### Request Body

```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "picked_qty": 20.0,
      "source_bin": "A1-R01-L1-B1"
    },
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 10.0,
      "source_bin": "A2-R02-L2-B2"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

### Response (200 OK)

```json
{
  "ok": true,
  "message": "Items picked successfully",
  "data": {
    "material_request": "MR-0001",
    "items_picked": 2,
    "total_picked_qty": 30.0,
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-RED-OS",
        "source_bin": "A1-R01-L1-B1",
        "qty_reduced": 20.0,
        "qty_before": 50.0,
        "qty_after": 30.0
      },
      {
        "item_code": "SKU-JACKET-201-BLK-L",
        "source_bin": "A2-R02-L2-B2",
        "qty_reduced": 10.0,
        "qty_before": 25.0,
        "qty_after": 15.0
      }
    ]
  }
}
```

### Status Updates

After this call, the item statuses will be updated:

- `SKU-HAT-301-RED-OS`: `picked_qty` = 20.00 → `status` = "Picked" (if requested_qty = 20.00)
- `SKU-JACKET-201-BLK-L`: `picked_qty` = 10.00 → `status` = "In Progress" (if requested_qty = 20.00)

---

## 5. POST Update Material Request Status

### Endpoint

```
POST /api/material-requests/:title/update-status
```

### Example Request

```bash
POST /api/material-requests/MR-0001/update-status
```

### Request Body

```json
{
  "status": "Submitted"
}
```

### Response (200 OK)

```json
{
  "ok": true,
  "message": "Material Request status updated successfully",
  "data": {
    "title": "MR-0001",
    "status": "Submitted"
  }
}
```

---

## Item-Level Status Values

### Status Definitions:

- **"Pending"**: `picked_qty = 0` - Item not picked yet
- **"In Progress"**: `0 < picked_qty < requested_qty` - Item partially picked
- **"Picked"**: `picked_qty >= requested_qty` - Item fully picked

### Status Updates:

- Status is automatically updated when `picked_qty` changes via:
  - `POST /api/material-requests/:title/pick-items`
  - Event processing (`POST /api/events/batch`)

---

## JavaScript/Fetch Examples

### GET Material Requests

```javascript
// Get all Material Requests
const response = await fetch(
  "http://your-api-server:3000/api/material-requests"
);
const materialRequests = await response.json();

// Get Material Requests with status filter
const response = await fetch(
  "http://your-api-server:3000/api/material-requests?status=In Progress"
);
const materialRequests = await response.json();

// Get single Material Request
const response = await fetch(
  "http://your-api-server:3000/api/material-requests/MR-0001"
);
const materialRequest = await response.json();
```

### POST Create Material Request

```javascript
const response = await fetch(
  "http://your-api-server:3000/api/material-requests",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "MR-0002",
      from_warehouse: "WH-MAIN",
      to_showroom: "STORE-002",
      request_date: "2026-01-26",
      required_date: "2026-01-27",
      requested_by: "USER-001",
      items: [
        {
          item_code: "SKU-HAT-301-BLU-OS",
          requested_qty: 15.0,
        },
        {
          item_code: "SKU-HAT-301-GRN-OS",
          requested_qty: 10.0,
        },
      ],
    }),
  }
);

const result = await response.json();
```

### POST Pick Items

```javascript
const response = await fetch(
  "http://your-api-server:3000/api/material-requests/MR-0001/pick-items",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          item_code: "SKU-HAT-301-RED-OS",
          picked_qty: 20.0,
          source_bin: "A1-R01-L1-B1",
        },
      ],
      warehouse: "WH-MAIN",
    }),
  }
);

const result = await response.json();
```

---

## Important Notes

1. **Item Status Field**: ✅ NEW - Each item in the response now includes a `status` field
2. **Status Values**: "Pending", "In Progress", "Picked"
3. **Status Updates**: Status is automatically updated when items are picked
4. **Status Storage**: Status is stored in database (`tabMaterialRequestItem.status`)
5. **Incremental Picking**: `picked_qty` is incremental (adds to existing value)
6. **Status Computation**: Status is computed based on `picked_qty` vs `requested_qty`

---

## Error Responses

### 400 Bad Request

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: title"
  }
}
```

### 404 Not Found

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Material Request MR-9999 not found"
  }
}
```

### 500 Internal Server Error

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to fetch Material Requests",
    "details": "Error details (only in development mode)"
  }
}
```
