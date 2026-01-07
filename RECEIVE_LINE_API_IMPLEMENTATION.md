# Receive Line API Implementation - Complete ✅

## ✅ APIs Implemented

### 1. **POST /api/inbound/receive-line** - Create/Update Single Receive Line

**Purpose:** Create or update a single receive line record (UPSERT)

**Endpoint:** `POST /api/inbound/receive-line`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "parent_title": "SESSION-MOCK-002",
  "carton_id": "CTN-0201",
  "item_code": "SKU-JEANS-001-BLK-32",
  "expected_qty": 50.00,
  "received_qty": 50.00,
  "condition": "Good",
  "remarks": null
}
```

**Response (Success):**
```json
{
  "ok": true,
  "mode": "insert",
  "data": {
    "parent_title": "SESSION-MOCK-002",
    "carton_id": "CTN-0201",
    "item_code": "SKU-JEANS-001-BLK-32",
    "expected_qty": 50.00,
    "received_qty": 50.00,
    "condition": "Good",
    "remarks": null
  }
}
```

**Validation:**
- `parent_title` - Required, cannot be empty
- `carton_id` - Required, cannot be empty (auto-converted to uppercase)
- `item_code` - Required, cannot be empty
- `expected_qty` - Required, must be >= 0
- `received_qty` - Required, must be >= 0
- `condition` - Optional, must be one of: "Good", "Damaged", "Missing", "Short" (default: "Good")
- `remarks` - Optional, can be null or empty string

---

### 2. **POST /api/inbound/receive-lines** - Create/Update Multiple Receive Lines (Batch)

**Purpose:** Create or update multiple receive line records in a single request (Batch UPSERT)

**Endpoint:** `POST /api/inbound/receive-lines`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "parent_title": "SESSION-MOCK-002",
  "receive_lines": [
    {
      "carton_id": "CTN-0201",
      "item_code": "SKU-JEANS-001-BLK-32",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    },
    {
      "carton_id": "CTN-0201",
      "item_code": "SKU-JEANS-001-BLU-32",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    },
    {
      "carton_id": "CTN-0202",
      "item_code": "SKU-JEANS-001-BLU-34",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    },
    {
      "carton_id": "CTN-0203",
      "item_code": "SKU-SHIRT-002-BLU-L",
      "expected_qty": 25.00,
      "received_qty": 25.00,
      "condition": "Good",
      "remarks": null
    }
  ]
}
```

**Response (Success):**
```json
{
  "ok": true,
  "parent_title": "SESSION-MOCK-002",
  "total": 4,
  "successful": 4,
  "failed": 0,
  "results": [
    {
      "carton_id": "CTN-0201",
      "item_code": "SKU-JEANS-001-BLK-32",
      "mode": "insert",
      "success": true
    },
    {
      "carton_id": "CTN-0201",
      "item_code": "SKU-JEANS-001-BLU-32",
      "mode": "insert",
      "success": true
    },
    {
      "carton_id": "CTN-0202",
      "item_code": "SKU-JEANS-001-BLU-34",
      "mode": "insert",
      "success": true
    },
    {
      "carton_id": "CTN-0203",
      "item_code": "SKU-SHIRT-002-BLU-L",
      "mode": "insert",
      "success": true
    }
  ]
}
```

**Response (Partial Success with Errors):**
```json
{
  "ok": true,
  "parent_title": "SESSION-MOCK-002",
  "total": 4,
  "successful": 3,
  "failed": 1,
  "results": [
    {
      "carton_id": "CTN-0201",
      "item_code": "SKU-JEANS-001-BLK-32",
      "mode": "insert",
      "success": true
    }
  ],
  "errors": [
    {
      "carton_id": "CTN-0203",
      "item_code": "SKU-SHIRT-002-BLU-L",
      "error": "Invalid quantity"
    }
  ]
}
```

**Validation:**
- `parent_title` - Required, cannot be empty
- `receive_lines` - Required, array with at least 1 item
- Each receive line must have: `carton_id`, `item_code`, `expected_qty`, `received_qty`
- Each receive line may have: `condition` (default: "Good"), `remarks`

---

### 3. **GET /api/inbound/receive-lines** - List Receive Lines

**Purpose:** Get all receive lines for a session

**Endpoint:** `GET /api/inbound/receive-lines?parent_title=SESSION-MOCK-002`

**Authentication:** Required (Bearer Token)

**Query Parameters:**
- `parent_title` (required) - Session ID

**Response (Success):**
```json
{
  "ok": true,
  "data": [
    {
      "carton_id": "CTN-0201",
      "item_code": "SKU-JEANS-001-BLK-32",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    },
    {
      "carton_id": "CTN-0201",
      "item_code": "SKU-JEANS-001-BLU-32",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    },
    {
      "carton_id": "CTN-0202",
      "item_code": "SKU-JEANS-001-BLU-34",
      "expected_qty": 50.00,
      "received_qty": 50.00,
      "condition": "Good",
      "remarks": null
    },
    {
      "carton_id": "CTN-0203",
      "item_code": "SKU-SHIRT-002-BLU-L",
      "expected_qty": 25.00,
      "received_qty": 25.00,
      "condition": "Good",
      "remarks": null
    }
  ]
}
```

---

## 🛡️ Duplicate Prevention

### Database-Level Protection

The API uses `INSERT ... ON DUPLICATE KEY UPDATE` to prevent duplicates. This requires a unique key constraint on `(parent_title, carton_id, item_code)`.

**To add the unique key constraint, run:**
```sql
ALTER TABLE tabInboundReceiveLine
ADD UNIQUE KEY uq_receive_line (parent_title, carton_id, item_code);
```

**Script provided:** `ADD_RECEIVE_LINE_UNIQUE_KEY.sql`

### Application-Level Protection

Even without the unique key constraint, the API includes fallback logic:
1. Checks if record exists before inserting
2. Uses `ON DUPLICATE KEY UPDATE` for UPSERT
3. Falls back to `UPDATE` if duplicate key error occurs

---

## 📋 Files Modified

### 1. **Validation Schemas**
**File:** `wms-api/src/validations/schemas.js`
- Added `receiveLineSchema` for single receive line validation
- Added `receiveLinesSchema` for batch receive lines validation

### 2. **Controller Functions**
**File:** `wms-api/src/modules/inbound/inboundController.js`
- Added `createOrUpdateReceiveLine` function (single)
- Added `createOrUpdateReceiveLines` function (batch)
- Added `getReceiveLines` function

### 3. **Routes**
**File:** `wms-api/src/routes/index.js`
- Added `POST /api/inbound/receive-line` route
- Added `POST /api/inbound/receive-lines` route
- Added `GET /api/inbound/receive-lines` route
- Imported validation schemas and controller functions

### 4. **Database Script**
**File:** `ADD_RECEIVE_LINE_UNIQUE_KEY.sql`
- SQL script to add unique key constraint (recommended but not required)

---

## 🧪 Testing

### Test POST /api/inbound/receive-line (Single)

```bash
curl -X POST http://localhost:3000/api/inbound/receive-line \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parent_title": "SESSION-MOCK-002",
    "carton_id": "CTN-0201",
    "item_code": "SKU-JEANS-001-BLK-32",
    "expected_qty": 50.00,
    "received_qty": 50.00,
    "condition": "Good",
    "remarks": null
  }'
```

### Test POST /api/inbound/receive-lines (Batch)

```bash
curl -X POST http://localhost:3000/api/inbound/receive-lines \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parent_title": "SESSION-MOCK-002",
    "receive_lines": [
      {
        "carton_id": "CTN-0201",
        "item_code": "SKU-JEANS-001-BLK-32",
        "expected_qty": 50.00,
        "received_qty": 50.00,
        "condition": "Good",
        "remarks": null
      },
      {
        "carton_id": "CTN-0201",
        "item_code": "SKU-JEANS-001-BLU-32",
        "expected_qty": 50.00,
        "received_qty": 50.00,
        "condition": "Good",
        "remarks": null
      },
      {
        "carton_id": "CTN-0202",
        "item_code": "SKU-JEANS-001-BLU-34",
        "expected_qty": 50.00,
        "received_qty": 50.00,
        "condition": "Good",
        "remarks": null
      },
      {
        "carton_id": "CTN-0203",
        "item_code": "SKU-SHIRT-002-BLU-L",
        "expected_qty": 25.00,
        "received_qty": 25.00,
        "condition": "Good",
        "remarks": null
      }
    ]
  }'
```

### Test GET /api/inbound/receive-lines

```bash
curl -X GET "http://localhost:3000/api/inbound/receive-lines?parent_title=SESSION-MOCK-002" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ✅ Expected Behavior

### Duplicate Prevention

1. **First Insert:** Creates new record → `mode: "insert"`
2. **Subsequent Inserts:** Updates existing record → `mode: "update"`
3. **No Duplicates:** Same `(parent_title, carton_id, item_code)` combination will always update the existing record

### Example Flow

```bash
# First call - creates record
POST /api/inbound/receive-line
{ "parent_title": "SESSION-001", "carton_id": "CTN-0101", "item_code": "SKU-001", ... }
→ Response: { "mode": "insert", ... }

# Second call with same keys - updates record
POST /api/inbound/receive-line
{ "parent_title": "SESSION-001", "carton_id": "CTN-0101", "item_code": "SKU-001", "received_qty": 100 }
→ Response: { "mode": "update", "data": { "received_qty": 100, ... } }

# Database will always have only ONE record for (SESSION-001, CTN-0101, SKU-001)
```

---

## 🔧 Database Setup

### Recommended: Add Unique Key Constraint

Run this SQL script to add a unique key constraint (enables proper UPSERT):

```sql
ALTER TABLE tabInboundReceiveLine
ADD UNIQUE KEY uq_receive_line (parent_title, carton_id, item_code);
```

**Benefits:**
- Prevents duplicate entries
- Enables `ON DUPLICATE KEY UPDATE` to work correctly
- Better data integrity
- Prevents race conditions in concurrent operations

**Note:** The API will still work without this constraint using fallback logic, but the unique key is recommended for proper UPSERT behavior.

**Script provided:** `ADD_RECEIVE_LINE_UNIQUE_KEY.sql`

---

## 📝 Summary

✅ **3 API endpoints implemented:**
- `POST /api/inbound/receive-line` - Single receive line (UPSERT)
- `POST /api/inbound/receive-lines` - Batch receive lines (UPSERT)
- `GET /api/inbound/receive-lines` - List receive lines for a session

✅ **Duplicate prevention:**
- Database-level: Unique key constraint (recommended)
- Application-level: UPSERT logic with fallback

✅ **Validation:**
- Joi schemas for request validation
- Required fields validated
- Quantity validations (>= 0)

✅ **Error handling:**
- Graceful error handling
- Batch operations continue on individual failures
- Detailed error messages

---

**Status:** ✅ **Implementation Complete - Ready for Testing**

