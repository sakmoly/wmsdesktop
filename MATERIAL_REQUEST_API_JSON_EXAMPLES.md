# Material Request API JSON Examples

Complete JSON examples for Material Request GET, POST, and Events endpoints for mobile app integration.

---

## 1. GET Material Requests (List)

### Endpoint

```
GET /api/material-requests
Authorization: Bearer <token>
```

### Query Parameters (Optional)

- `status`: Filter by status (Draft, Submitted, In Progress, Picked, Dispatched, Completed, Cancelled)
- `from_warehouse`: Filter by source warehouse
- `to_showroom`: Filter by destination showroom

### Example Request

```bash
GET /api/material-requests?status=Submitted
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example Response

```json
[
  {
    "title": "MR-0001",
    "status": "Submitted",
    "from_warehouse": "WH-MAIN",
    "to_showroom": "STORE-001",
    "request_date": "2025-01-25",
    "required_date": "2025-01-25",
    "requested_by": "SYSTEM",
    "total_requested_qty": 100.0,
    "total_picked_qty": 0.0,
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "requested_qty": 20.0,
        "picked_qty": 0.0
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "requested_qty": 20.0,
        "picked_qty": 0.0
      },
      {
        "item_code": "SKU-HAT-301-RED-OS",
        "requested_qty": 20.0,
        "picked_qty": 0.0
      },
      {
        "item_code": "SKU-JACKET-201-BLK-L",
        "requested_qty": 20.0,
        "picked_qty": 0.0
      },
      {
        "item_code": "SKU-JACKET-201-BLK-M",
        "requested_qty": 20.0,
        "picked_qty": 0.0
      }
    ],
    "created_at": "2025-01-25T08:00:00.000Z",
    "updated_at": "2025-01-25T08:00:00.000Z"
  }
]
```

---

## 2. GET Single Material Request

### Endpoint

```
GET /api/material-requests/:title
Authorization: Bearer <token>
```

### Example Request

```bash
GET /api/material-requests/MR-0001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example Response

```json
{
  "title": "MR-0001",
  "status": "In Progress",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "STORE-001",
  "request_date": "2025-01-25",
  "required_date": "2025-01-25",
  "requested_by": "SYSTEM",
  "total_requested_qty": 100.0,
  "total_picked_qty": 40.0,
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 20.0,
      "picked_qty": 20.0
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.0,
      "picked_qty": 20.0
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "requested_qty": 20.0,
      "picked_qty": 0.0
    },
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "requested_qty": 20.0,
      "picked_qty": 0.0
    },
    {
      "item_code": "SKU-JACKET-201-BLK-M",
      "requested_qty": 20.0,
      "picked_qty": 0.0
    }
  ],
  "created_at": "2025-01-25T08:00:00.000Z",
  "updated_at": "2025-01-25T10:30:00.000Z"
}
```

---

## 3. POST Create Material Request

### Endpoint

```
POST /api/material-requests
Authorization: Bearer <token>
Content-Type: application/json
```

### Example Request

```json
{
  "title": "MR-0002",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "STORE-001",
  "request_date": "2025-01-25",
  "required_date": "2025-01-26",
  "requested_by": "USER-001",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "requested_qty": 50.0
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 30.0
    }
  ]
}
```

### Example Response

```json
{
  "ok": true,
  "message": "Material Request created successfully",
  "data": {
    "title": "MR-0002",
    "status": "Draft",
    "total_requested_qty": 80.0
  }
}
```

---

## 4. POST Pick Material Request Items (Update Picked Quantities)

### Endpoint

```
POST /api/material-requests/:title/pick-items
Authorization: Bearer <token>
Content-Type: application/json
```

### Example Request

```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 20.0,
      "source_bin": "A1-R01-L1-B1"
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "picked_qty": 20.0,
      "source_bin": "A1-R01-L2-B1"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

**Note:**

- `picked_qty` is **incremental** (adds to existing picked_qty)
- `source_bin` should be the `location_id` where item was picked from
- `warehouse` is optional (defaults to Material Request's `from_warehouse`)

### Example Response

```json
{
  "ok": true,
  "message": "Material Request items picked successfully",
  "data": {
    "material_request": "MR-0001",
    "status": "In Progress",
    "total_picked_qty": 40.0,
    "items_picked": 2,
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "source_bin": "A1-R01-L1-B1",
        "qty_reduced": 20.0,
        "qty_before": 165.0,
        "qty_after": 145.0
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "source_bin": "A1-R01-L2-B1",
        "qty_reduced": 20.0,
        "qty_before": 200.0,
        "qty_after": 180.0
      }
    ]
  }
}
```

### Error Response (Insufficient Stock)

```json
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for SKU-HAT-301-BLU-OS at A1-R01-L1-B1. Available: 10.00, Required: 20.00"
  }
}
```

### Error Response (Exceeds Requested)

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot pick 25.00 for SKU-HAT-301-BLU-OS. Already picked: 15.00, Requested: 20.00"
  }
}
```

---

## 5. POST Update Material Request Status

### Endpoint

```
POST /api/material-requests/:title/update-status
Authorization: Bearer <token>
Content-Type: application/json
```

### Example Request (Update to Dispatched)

```json
{
  "status": "Dispatched",
  "dispatched_by": "USER-004",
  "dispatched_on": "2025-01-25T14:30:00Z"
}
```

### Example Response

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

---

## 6. POST Events Batch (Material Request Picking via Events)

### Endpoint

```
POST /api/events/batch
Authorization: Bearer <token>
Content-Type: application/json
```

### Example Request (Packing Items to Transfer Carton)

```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-01-25T10:35:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-004",
      "transfer_order": "MR-0001",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 20.0,
      "store": "STORE-001",
      "tc_id": "TC-MR-0001-001",
      "location_id": "A1-R01-L1-B1",
      "rack": "Rack 01",
      "bin": "B1",
      "source_bin": "A1-R01-L1-B1",
      "notes": "Picked from Zone A"
    },
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440002",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-01-25T10:36:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-004",
      "transfer_order": "MR-0001",
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 20.0,
      "store": "STORE-001",
      "tc_id": "TC-MR-0001-001",
      "location_id": "A1-R01-L2-B1",
      "rack": "Rack 01",
      "bin": "B1",
      "source_bin": "A1-R01-L2-B1",
      "notes": "Picked from Zone A"
    }
  ]
}
```

**Key Fields for Material Request:**

- `transfer_order`: Must be Material Request number (e.g., "MR-0001")
- `item_code`: Item code being picked
- `qty`: Quantity picked (incremental)
- `source_bin` or `location_id`: Location where item was picked from
- `tc_id`: Transfer Carton ID (optional, but recommended)

**Priority for source_bin:**

1. `source_bin` (direct field)
2. `location_id` (location_id from tabLocation)
3. `rack` + `bin` (looked up in tabLocation)
4. `rack` only
5. `bin` only

### Example Response

```json
{
  "ok": true,
  "message": "Events saved successfully",
  "inserted_count": 2,
  "total_count": 2
}
```

---

## 7. POST Seal Transfer Carton (Updates Material Request Status to "Picked")

### Endpoint

```
POST /api/transfer-cartons/seal
Authorization: Bearer <token>
Content-Type: application/json
```

### Example Request

```json
{
  "tc_id": "TC-MR-0001-001",
  "sealed_by": "USER-004"
}
```

### Example Response (Material Request - All Items Picked)

```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully",
  "data": {
    "material_request": "MR-0001",
    "status_updated": true
  }
}
```

**Note:** Status is updated to "Picked" only if:

- All items have `picked_qty >= requested_qty`
- Transfer carton is sealed

### Example Response (Material Request - Items Not Fully Picked)

```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully",
  "data": {
    "material_request": "MR-0001",
    "status_updated": false
  }
}
```

---

## 8. POST Create Transfer Carton (Material Request)

### Endpoint

```
POST /api/transfer-cartons/create
Authorization: Bearer <token>
Content-Type: application/json
```

### Example Request (Material Request Format)

```json
{
  "tc_id": "TC-MR-0001-001",
  "asn_no": null,
  "to_no": "MR-0001",
  "store": "STORE-001",
  "user_id": "USER-004",
  "material_request": "MR-0001"
}
```

### Example Response

```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-MR-0001-001",
    "status": "Created"
  }
}
```

---

## Status Flow Summary

### Material Request Status

```
Draft → Submitted → In Progress → Picked → Dispatched → Completed
```

**Status Updates:**

- **Submitted** → **In Progress**: When first item is picked (`picked_qty > 0`)
- **In Progress** → **Picked**: When ALL items are picked AND transfer carton is sealed
- **Picked** → **Dispatched**: Manual update via `POST /api/material-requests/:title/update-status`

### Transfer Carton Status

```
Created → Sealed → Dispatched
```

---

## Important Notes

1. **Picked Quantity is Incremental:**

   - Each call to `pick-items` or event **adds** to existing `picked_qty`
   - Example: If `picked_qty = 10` and you pick `20`, new `picked_qty = 30`

2. **Source Bin Required:**

   - Always provide `source_bin` or `location_id` for stock reduction
   - Stock is reduced from source bin when items are picked

3. **Status "Picked" Requires:**

   - All items: `picked_qty >= requested_qty`
   - Transfer carton status: "Sealed"

4. **Events vs Direct API:**

   - Use `POST /api/material-requests/:title/pick-items` for direct picking
   - Use `POST /api/events/batch` for event-based picking (supports offline)

5. **Stock Reduction:**
   - Happens automatically when items are picked
   - Stock is reduced from `source_bin` location
   - `tabItem.stock_qty` is updated automatically

---

## Error Codes

| Code                 | Description                                     |
| -------------------- | ----------------------------------------------- |
| `VALIDATION_ERROR`   | Missing required fields or invalid data         |
| `NOT_FOUND`          | Material Request not found                      |
| `INSUFFICIENT_STOCK` | Not enough stock at source bin                  |
| `DATABASE_ERROR`     | Database operation failed                       |
| `DUPLICATE_ENTRY`    | Material Request with same title already exists |

---

## Testing Checklist

- [ ] GET list of Material Requests
- [ ] GET single Material Request details
- [ ] POST pick items (incremental picking)
- [ ] POST pick items (verify stock reduction)
- [ ] POST events batch (Material Request picking)
- [ ] POST create transfer carton (Material Request)
- [ ] POST seal transfer carton (verify status update to "Picked")
- [ ] Verify picked_qty updates correctly
- [ ] Verify total_picked_qty is recalculated
- [ ] Verify status flow: Submitted → In Progress → Picked
