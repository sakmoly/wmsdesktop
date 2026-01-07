# Putaway API Documentation

## Overview
This document provides API endpoints, request/response formats, and sample JSON for the Putaway module, including header-level `location_id` support.

---

## 1. GET /api/putaway/tasks

Get list of putaway tasks with optional filters.

### URL
```
GET http://localhost:3000/api/putaway/tasks
```

### Query Parameters (All Optional)
- `status` - Filter by status (Draft, Open, In Progress, Completed, Cancelled)
- `source_type` - Filter by source type (ASN, TransferIn)
- `advance_shipping_notice` - Filter by ASN number
- `transfer_in` - Filter by Transfer In number

### Example Requests

**Get all open tasks:**
```
GET http://localhost:3000/api/putaway/tasks?status=Open
```

**Get tasks for specific ASN:**
```
GET http://localhost:3000/api/putaway/tasks?status=Open&advance_shipping_notice=ASN-12225
```

### Response Format

**Success Response (200 OK):**
```json
{
  "ok": true,
  "data": [
    {
      "putaway_task": "PUT-20260101-0001",
      "box_id": "BOX-WHMAIN-520841",
      "tc_id": null,
      "asn_no": "ASN-12225",
      "rack": "Rack 01",
      "bin": "B1",
      "location_id": "A1-R01-L1-B1",  // ← Header-level location ID
      "status": "Open",
      "source_type": "ASN",
      "created_on": "2026-01-01T10:00:00.000Z",
      "created_by": "USER-786249",
      "lines_count": 2,
      "items": [
        {
          "item_code": "SKU-HAT-301-BLU-OS",
          "qty": 75,
          "carton_id": "CTN-001",
          "rack": "Rack 01",
          "bin": "B1",
          "location_id": "A1-R01-L1-B1"  // ← Line-level location ID
        },
        {
          "item_code": "SKU-HAT-301-RED-OS",
          "qty": 100,
          "carton_id": "CTN-002",
          "rack": "Rack 01",
          "bin": "B1",
          "location_id": "A1-R01-L1-B1"  // ← Line-level location ID
        }
      ]
    }
  ]
}
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

## 2. POST /api/putaway/complete

Complete a putaway task. Supports header-level `location_id` to apply location to all items at once.

### URL
```
POST http://localhost:3000/api/putaway/complete
```

### Request Body

#### Option 1: With Header-Level Location (NEW - Preferred for single-location boxes)
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "location_id": "A1-R01-L1-B1",  // ← NEW: Header-level location (applies to all items)
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "completed": true
      // No location_id or target_bin needed - uses header location
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 100,
      "completed": true
      // No location_id or target_bin needed - uses header location
    }
  ]
}
```

#### Option 2: With Item-Level Location (Still Supported)
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "location_id": "A1-R01-L1-B1",  // Item-specific location
      "completed": true
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 100,
      "location_id": "A1-R01-L2-B1",  // Different location for this item
      "completed": true
    }
  ]
}
```

#### Option 3: Mixed (Header + Item Override)
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "location_id": "A1-R01-L1-B1",  // Default location for all items
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "completed": true
      // Uses header location
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 100,
      "location_id": "A1-R01-L2-B1",  // Override with item-specific location
      "completed": true
    }
  ]
}
```

#### Option 4: Backward Compatibility (target_bin)
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "target_bin": "A1-R01-L1-B1",  // Backward compatibility
      "completed": true
    }
  ]
}
```

### Location Priority

When completing putaway, the location is determined in this priority order:

1. **Header-level `location_id`** (if provided) - Applied to all items unless overridden
2. **Item-level `location_id`** (if provided) - Overrides header location for that item
3. **Item-level `target_bin`** (backward compatibility) - Parsed to extract rack/bin

### Response Format

**Success Response (200 OK):**
```json
{
  "ok": true,
  "message": "Putaway task PUT-20260101-0001 completed successfully",
  "data": {
    "putaway_task": "PUT-20260101-0001",
    "status": "Completed",
    "items_processed": 2,
    "stock_updated": true
  }
}
```

**Error Responses:**

**Validation Error (400):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot complete putaway: some items are missing target location",
    "details": "Items without location: SKU-HAT-301-RED-OS. Please scan location (location_id) at header level or for each item before completing putaway."
  }
}
```

**Location Not Found (400):**
```json
{
  "ok": false,
  "error": {
    "code": "LOCATION_NOT_FOUND",
    "message": "Location ID \"A1-R01-L1-B1\" not found or not available"
  }
}
```

**Task Already Completed (400):**
```json
{
  "ok": false,
  "error": {
    "code": "TASK_ALREADY_COMPLETED",
    "message": "Putaway task PUT-20260101-0001 is already completed. Stock has already been updated."
  }
}
```

**Task Not Found (404):**
```json
{
  "ok": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Putaway task PUT-20260101-0001 not found."
  }
}
```

---

## 3. POST /api/putaway/scan-transfer-carton

Scan transfer carton or box and location, then create/update putaway task.

### URL
```
POST http://localhost:3000/api/putaway/scan-transfer-carton
```

### Request Body

**With Location ID (Preferred):**
```json
{
  "tc_id": "TC-1766952896460",
  "box_id": "BOX-WHMAIN-514364",
  "location_id": "A1-R01-L1-B1",  // ← Preferred method
  "user_id": "USER-001"
}
```

**With Rack+Bin (Backward Compatibility):**
```json
{
  "tc_id": "TC-1766952896460",
  "rack": "Rack 01",
  "bin": "B1",
  "user_id": "USER-001"
}
```

**Update Existing Task Location:**
```json
{
  "putaway_task": "PUT-20260101-0001",
  "location_id": "A1-R01-L1-B1",
  "user_id": "USER-001"
}
```

### Response Format

**Success Response (200 OK):**
```json
{
  "ok": true,
  "message": "Putaway task created/updated successfully",
  "data": {
    "putaway_task": "PUT-20260101-0001",
    "location_id": "A1-R01-L1-B1",
    "rack": "Rack 01",
    "bin": "B1"
  }
}
```

---

## Summary of Changes

### Header-Level Location ID Support

1. **GET /api/putaway/tasks**
   - Now returns `location_id` at header level in response
   - Priority: Database column → rack+bin → lines location_id

2. **POST /api/putaway/complete**
   - Accepts `location_id` at header level in request body
   - Applies header location to all items unless overridden
   - Validates that location exists and is available

3. **POST /api/putaway/scan-transfer-carton**
   - Already supports `location_id` (preferred method)
   - Falls back to rack+bin for backward compatibility

### Benefits

- **Faster workflow:** Scan location once for entire box instead of per item
- **Reduced errors:** Less scanning = fewer mistakes
- **Better UX:** More intuitive for single-location boxes
- **Flexible:** Still supports item-level locations when items go to different locations

