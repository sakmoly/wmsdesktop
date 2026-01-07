# Unload Line API Implementation - Complete ✅

## ✅ APIs Implemented

### 1. **POST /api/inbound/unload-line** - Create/Update Unload Line

**Purpose:** Create or update an unload line record (UPSERT)

**Endpoint:** `POST /api/inbound/unload-line`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "parent_title": "SESSION-MOCK-001",
  "unit_type": "Carton",
  "unit_id": "CTN-0101",
  "scanned_by": "USER-MOCK-001",
  "scanned_on": "2025-12-24T10:20:00Z"  // Optional - ISO 8601 datetime
}
```

**Response (Success):**
```json
{
  "ok": true,
  "mode": "insert",  // or "update"
  "data": {
    "parent_title": "SESSION-MOCK-001",
    "unit_type": "Carton",
    "unit_id": "CTN-0101",
    "scanned_on": "2025-12-24T10:20:00.000Z",
    "scanned_by": "USER-MOCK-001"
  }
}
```

**Validation:**
- `parent_title` - Required, cannot be empty
- `unit_type` - Required, must be "Carton"
- `unit_id` - Required, cannot be empty (auto-converted to uppercase)
- `scanned_by` - Required, cannot be empty
- `scanned_on` - Optional, must be valid ISO 8601 datetime string

---

### 2. **GET /api/inbound/unload-lines** - List Unload Lines

**Purpose:** Get all scanned cartons (unload lines) for a session

**Endpoint:** `GET /api/inbound/unload-lines?parent_title=SESSION-MOCK-001`

**Authentication:** Required (Bearer Token)

**Query Parameters:**
- `parent_title` (required) - Session ID

**Response (Success):**
```json
{
  "ok": true,
  "data": [
    {
      "unit_id": "CTN-0101",
      "status": "RECEIVED",
      "scanned_on": "2025-12-24T10:20:00.000Z",
      "scanned_by": "USER-MOCK-001"
    },
    {
      "unit_id": "CTN-0102",
      "status": "RECEIVED",
      "scanned_on": "2025-12-24T10:30:00.000Z",
      "scanned_by": "USER-MOCK-002"
    }
  ]
}
```

**Note:** All returned rows have `status: "RECEIVED"` as per requirements.

---

## 📋 Files Modified

### 1. **Validation Schemas**
**File:** `wms-api/src/validations/schemas.js`
- Added `unloadLineSchema` validation schema

### 2. **Controller Functions**
**File:** `wms-api/src/modules/inbound/inboundController.js`
- Added `createOrUpdateUnloadLine` function
- Added `getUnloadLines` function

### 3. **Routes**
**File:** `wms-api/src/routes/index.js`
- Added `POST /api/inbound/unload-line` route
- Added `GET /api/inbound/unload-lines` route
- Imported validation schema and controller functions

### 4. **Database Script**
**File:** `wms-api/src/db/add_unload_line_unique_key.sql`
- SQL script to add unique key constraint (recommended but not required)

---

## 🔧 Database Setup

### Recommended: Add Unique Key Constraint

Run this SQL script to add a unique key constraint (enables proper UPSERT):

```sql
ALTER TABLE tabInboundUnloadLine
ADD UNIQUE KEY uq_unload_line (parent_title, unit_type, unit_id);
```

**Benefits:**
- Prevents duplicate entries
- Enables `ON DUPLICATE KEY UPDATE` to work correctly
- Better data integrity

**Note:** The API will still work without this constraint using `INSERT IGNORE`, but the unique key is recommended for proper UPSERT behavior.

---

## 🧪 Testing

### Test POST /api/inbound/unload-line

```bash
# Test insert
curl -X POST http://localhost:3000/api/inbound/unload-line \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parent_title": "SESSION-MOCK-002",
    "unit_type": "Carton",
    "unit_id": "CTN-0201",
    "scanned_by": "USER-MOCK-002"
  }'

# Test update (with scanned_on)
curl -X POST http://localhost:3000/api/inbound/unload-line \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parent_title": "SESSION-MOCK-002",
    "unit_type": "Carton",
    "unit_id": "CTN-0201",
    "scanned_by": "USER-MOCK-002",
    "scanned_on": "2025-12-24T10:20:00Z"
  }'
```

### Test GET /api/inbound/unload-lines

```bash
curl -X GET "http://localhost:3000/api/inbound/unload-lines?parent_title=SESSION-MOCK-002" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ⚠️ Error Responses

### Validation Error (400)
```json
{
  "ok": false,
  "message": "parent_title is required and cannot be empty"
}
```

### Missing Query Parameter (400)
```json
{
  "ok": false,
  "message": "parent_title query parameter is required"
}
```

### Server Error (500)
```json
{
  "ok": false,
  "message": "Failed to save unload line"
}
```

---

## ✅ Features

1. **UPSERT Logic:** Automatically inserts new records or updates existing ones
2. **Validation:** Comprehensive input validation using Joi schemas
3. **Error Handling:** Graceful error handling with rollback on failures
4. **Logging:** All operations are logged for debugging
5. **Transaction Safety:** Uses database transactions for data integrity
6. **Case Handling:** `unit_id` is automatically converted to uppercase
7. **Timestamp Handling:** Supports optional `scanned_on` with automatic fallback to `NOW()`

---

## 📝 Notes

1. **Unit Type Restriction:** Currently only "Carton" is allowed (as per requirements)
2. **Status Field:** GET endpoint always returns `status: "RECEIVED"` for all rows
3. **Unique Key:** Recommended to add unique constraint for proper UPSERT behavior
4. **Duplicate Handling:** API handles duplicate key errors gracefully by attempting UPDATE

---

**Status:** ✅ **COMPLETE - All APIs implemented and ready to use**

**Next Steps:**
1. Restart backend server
2. (Optional) Run SQL script to add unique key constraint
3. Test the endpoints using curl or Postman

