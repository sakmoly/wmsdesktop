# Putaway API Documentation

## Available Endpoints

### 1. Assign Rack/Bin for Putaway

**Endpoint:** `POST /api/putaway/assign-rack`

**Authentication:** Required (Bearer token)

**Request Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
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

**Required Fields:**
- `putaway_task` (string) - The putaway task title/ID
- `rack` (string) - The rack location

**Optional Fields:**
- `carton_id` (string) - Carton ID
- `item_code` (string) - Item code
- `qty` (number) - Quantity
- `bin` (string) - Bin location
- `user_id` (string) - User ID

**Success Response (200):**
```json
{
  "ok": true,
  "message": "Rack assigned successfully"
}
```

**Error Responses:**

**400 - Validation Error:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "putaway_task and rack are required"
  }
}
```

**404 - Task Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Putaway task PUT-20250120-0001 not found"
  }
}
```

**500 - Database Error:**
```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to assign rack",
    "details": "Error details (development only)"
  }
}
```

**Backend Actions:**
- Verifies putaway task exists in `tabPutawayTask`
- Updates or inserts record in `tabPutawayLine` with rack/bin information
- Uses `ON DUPLICATE KEY UPDATE` to update existing lines

---

## Missing Endpoints (Documented but Not Implemented)

### 2. Complete Putaway Task

**Note:** This endpoint is mentioned in documentation but **NOT YET IMPLEMENTED** in the backend.

**Expected Endpoint:** `POST /api/putaway/complete`

**Expected Request:**
```json
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

**Expected Response:**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "status": "Completed",
    "stock_updated": true
  }
}
```

**Expected Backend Actions:**
- Update `tabPutawayTask.status` to "Completed"
- Update stock ledger with putaway quantities
- Create WMS transaction record

---

### 3. Get Putaway Tasks

**Note:** This endpoint is mentioned in documentation but **NOT YET IMPLEMENTED** in the backend.

**Expected Endpoint:** `GET /api/putaway/tasks`

**Query Parameters:**
- `status` (optional) - Filter by status (e.g., "Open", "Draft", "Completed")
- `source_type` (optional) - Filter by source type ("ASN" or "TransferIn")
- `advance_shipping_notice` (optional) - Filter by ASN number
- `transfer_in` (optional) - Filter by Transfer In number

**Example:**
```
GET /api/putaway/tasks?status=Open&source_type=ASN
GET /api/putaway/tasks?status=Open&source_type=ASN&advance_shipping_notice=ASN-0001
GET /api/putaway/tasks?status=Open&source_type=TransferIn&transfer_in=TI-0001
```

**Expected Response:**
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
    "items": [
      {
        "item_code": "SKU-001",
        "qty": 50.00,
        "carton_id": "CTN-0101",
        "rack": "RACK-A",
        "bin": "BIN-01"
      }
    ]
  }
]
```

---

### 4. Get Remaining Items for Putaway

**Note:** This endpoint is mentioned in documentation but **NOT YET IMPLEMENTED** in the backend.

**Expected Endpoint:** `GET /api/putaway/remaining-items`

**Query Parameters:**
- `asn` (required) - ASN number

**Example:**
```
GET /api/putaway/remaining-items?asn=ASN-0001
```

**Expected Response:**
```json
{
  "ok": true,
  "data": [
    {
      "item_code": "SKU-001",
      "carton_id": "CTN-0102",
      "remaining_qty": 50,
      "asn_no": "ASN-0001"
    }
  ]
}
```

---

## Current Implementation Status

✅ **Implemented:**
- `POST /api/putaway/assign-rack` - Assign rack/bin for putaway

❌ **Not Implemented (but documented):**
- `POST /api/putaway/complete` - Complete putaway task
- `GET /api/putaway/tasks` - Get putaway tasks list
- `GET /api/putaway/remaining-items` - Get remaining items for putaway

---

## How Putaway Completion Currently Works

Based on the documentation, putaway completion is expected to be handled via:

1. **Event-Based Approach:** Mobile app sends `PUTAWAY_CONFIRM` events via `POST /api/events/batch`
2. **Direct API Approach:** Mobile app calls `POST /api/putaway/complete` (not yet implemented)

**Current Event Format:**
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
      "item_code": "SKU-001",
      "qty": 50,
      "rack": "RACK-A-01",
      "bin": "BIN-01",
      "notes": "Items put away"
    }
  ]
}
```

**Note:** The event handler for `PUTAWAY_CONFIRM` may need to update `tabPutawayTask.status` to "Completed" when processing these events.

---

## Database Tables

### tabPutawayTask
- `title` (PRIMARY KEY) - Task identifier
- `status` - Task status (Draft, Open, In Progress, Completed, Cancelled)
- `source_type` - Source type (ASN or TransferIn)
- `advance_shipping_notice` - ASN number (if source is ASN)
- `transfer_in` - Transfer In number (if source is TransferIn)
- `inbound_session` - Inbound session identifier
- `created_by` - User who created the task
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### tabPutawayLine
- `id` (PRIMARY KEY, AUTO_INCREMENT)
- `parent_title` - Foreign key to `tabPutawayTask.title`
- `carton_id` - Carton identifier
- `item_code` - Item code
- `qty` - Quantity
- `rack` - Rack location
- `bin` - Bin location
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

---

## Recommendations

1. **Implement `POST /api/putaway/complete` endpoint** to allow mobile app to directly complete putaway tasks
2. **Implement `GET /api/putaway/tasks` endpoint** to allow mobile app to fetch putaway tasks
3. **Update event handler** to process `PUTAWAY_CONFIRM` events and update `tabPutawayTask.status` to "Completed"
4. **Add status update logic** when all putaway lines are completed, automatically mark task as "Completed"

