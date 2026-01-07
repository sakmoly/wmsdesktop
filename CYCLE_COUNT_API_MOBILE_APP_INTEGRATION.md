# Cycle Count API - Mobile App Integration Update

## ✅ Status: UPDATED FOR MOBILE APP COMPATIBILITY

The Cycle Count API has been updated to match the mobile app's expected JSON format and field names.

---

## 🔄 Key Changes Made

### 1. **Response Format Standardization**
- All responses now wrapped in `{ ok: true, data: ... }` format
- Error responses follow `{ ok: false, error: { code, message } }` format

### 2. **Field Name Mapping**

#### Task Fields:
- `warehouse` → **`warehouse_id`** (mobile app field) + `warehouse` (backward compatibility)
- `zone` → **`bin_code`** and **`bin_id`** (mobile app fields) + `zone` (backward compatibility)
- `count_type`: "Cycle" → **"Directed"**, "Full" → **"Adhoc"** (mobile app format) + original (backward compatibility)
- Added **`started_at`** (derived from `updated_at` when status = "In Progress")
- Added **`started_by`** (derived from `assigned_to` or `created_by`)
- Added **`is_blind_count`** (calculated: true if all expected_qty are null)

#### Line Fields:
- `id` (number) → **`line_id`** (string format: "LINE-{id}") + `id` (backward compatibility)
- `discrepancy` → **`variance_qty`** (mobile app field) + `discrepancy` (backward compatibility)
- `actual_qty` → also includes **`counted_qty`** (alias, same value)
- `discrepancy_reason` → also maps to **`reason_code`** and **`notes`** (mobile app fields)
- Added **`is_unexpected_item`** (default: false)
- Added **`barcode`** (uses `item_code` if not separate)
- Added **`uom`** (default: "EA")

### 3. **Array Field Names**
- Responses include both **`items`** and **`lines`** field names for the count lines array
- Mobile app accepts either format

### 4. **Query Parameter Enhancements**
- **Status filter** now supports comma-separated values: `?status=Draft,In Progress`
- Example: `GET /api/cycle-count?status=Draft,In Progress`

### 5. **Request Format Flexibility**

#### Update Line Endpoints:
- Accepts both **`id`** (number) and **`line_id`** (string "LINE-{id}") formats
- Accepts both **`actual_qty`** and **`counted_qty`** (treated as same)
- Accepts **`reason_code`**, **`notes`**, or **`discrepancy_reason`** (all map to same field)

---

## 📋 API Endpoints Summary

### 1. **GET /api/cycle-count**
**Response Format:**
```json
{
  "ok": true,
  "data": [
    {
      "title": "CC-0001",
      "status": "In Progress",
      "count_type": "Directed",
      "warehouse_id": "WH-MAIN",
      "bin_code": "BIN-A1-01",
      "bin_id": "BIN-A1-01",
      "started_at": "2024-01-15T10:30:00Z",
      "started_by": "USER-001",
      "is_blind_count": false,
      "total_items": 10,
      "counted_items": 7,
      "items_with_discrepancy": 2
    }
  ]
}
```

**Query Parameters:**
- `status` (optional): Single or comma-separated (e.g., "Draft,In Progress")
- `warehouse` (optional): Filter by warehouse
- `zone` (optional): Filter by zone
- `count_type` (optional): Filter by count type

---

### 2. **GET /api/cycle-count/:title**
**Response Format:**
```json
{
  "ok": true,
  "data": {
    "title": "CC-0001",
    "status": "In Progress",
    "count_type": "Directed",
    "warehouse_id": "WH-MAIN",
    "bin_code": "BIN-A1-01",
    "bin_id": "BIN-A1-01",
    "started_at": "2024-01-15T10:30:00Z",
    "started_by": "USER-001",
    "is_blind_count": false,
    "total_items": 10,
    "counted_items": 7,
    "items_with_discrepancy": 2,
    "items": [
      {
        "line_id": "LINE-1",
        "id": 1,
        "item_code": "SKU-HAT-301-BLU-OS",
        "barcode": "SKU-HAT-301-BLU-OS",
        "uom": "EA",
        "expected_qty": 20,
        "actual_qty": 18,
        "counted_qty": 18,
        "variance_qty": -2,
        "discrepancy": -2,
        "bin_location": "BIN-A1-01",
        "status": "Counted",
        "is_unexpected_item": false,
        "reason_code": null,
        "notes": null
      }
    ],
    "lines": [ /* same as items */ ]
  }
}
```

**Note:** Both `items` and `lines` arrays are included for mobile app compatibility.

---

### 3. **POST /api/cycle-count/:title/start**
**Request:**
```json
{
  "started_by": "USER-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task started successfully",
  "data": {
    "title": "CC-0001",
    "status": "In Progress",
    "started_at": "2024-01-15T10:30:00Z",
    "started_by": "USER-001"
  }
}
```

---

### 4. **POST /api/cycle-count/:title/count** ⭐ (Main Mobile App Endpoint)
**Request (Mobile App Format):**
```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "id": 1,
      "actual_qty": 18,
      "discrepancy_reason": null
    },
    {
      "id": 2,
      "actual_qty": 15,
      "discrepancy_reason": null
    }
  ]
}
```

**Alternative Request Format (Also Accepted):**
```json
{
  "lines": [
    {
      "line_id": "LINE-1",
      "item_code": "SKU-HAT-301-BLU-OS",
      "actual_qty": 18,
      "counted_qty": 18,
      "reason_code": null,
      "notes": null
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Successfully updated 2 lines",
  "data": {
    "title": "CC-0001",
    "updated_count": 2,
    "counted_items": 2,
    "items_with_discrepancy": 2
  }
}
```

**Features:**
- Accepts `id` (number) or `line_id` (string "LINE-{id}")
- Accepts `actual_qty` or `counted_qty`
- Accepts `discrepancy_reason`, `reason_code`, or `notes`
- Batch processing with error handling

---

### 5. **POST /api/cycle-count/:title/update-line**
**Request:**
```json
{
  "line_id": 1,
  "actual_qty": 20,
  "counted_by": "USER-001",
  "discrepancy_reason": null
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Line updated successfully",
  "data": {
    "line_id": "LINE-1",
    "id": 1,
    "actual_qty": 20,
    "counted_qty": 20,
    "variance_qty": 0
  }
}
```

---

### 6. **POST /api/cycle-count/:title/submit**
**Request:** `{}` (empty body)

**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task submitted successfully. Status: Review",
  "data": {
    "title": "CC-0001",
    "status": "Review",
    "items_with_discrepancy": 2
  }
}
```

---

### 7. **POST /api/cycle-count/:title/complete**
**Request:** `{}` (empty body)

**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task completed successfully",
  "data": {
    "title": "CC-0001",
    "status": "Completed"
  }
}
```

---

## 🔄 Field Mapping Reference

### Task Field Mapping:
| Database Field | Mobile App Field | Backward Compatible |
|---------------|------------------|---------------------|
| `warehouse` | `warehouse_id` | ✅ `warehouse` |
| `zone` | `bin_code`, `bin_id` | ✅ `zone` |
| `count_type: "Cycle"` | `count_type: "Directed"` | ✅ `count_type_original` |
| `count_type: "Full"` | `count_type: "Adhoc"` | ✅ `count_type_original` |
| `updated_at` (when status = "In Progress") | `started_at` | - |
| `assigned_to` or `created_by` | `started_by` | - |
| - | `is_blind_count` (calculated) | - |

### Line Field Mapping:
| Database Field | Mobile App Field | Backward Compatible |
|---------------|------------------|---------------------|
| `id` (number) | `line_id` (string "LINE-{id}") | ✅ `id` |
| `discrepancy` | `variance_qty` | ✅ `discrepancy` |
| `actual_qty` | `counted_qty` (alias) | ✅ `actual_qty` |
| `discrepancy_reason` | `reason_code`, `notes` | ✅ `discrepancy_reason` |
| `item_code` | `barcode` (alias) | ✅ `item_code` |
| - | `uom` (default: "EA") | - |
| - | `is_unexpected_item` (default: false) | - |

---

## ✅ Mobile App Compatibility Features

1. **Flexible Field Names**: Accepts both old and new field names
2. **Multiple Array Names**: Supports both `items` and `lines` in responses
3. **ID Format Flexibility**: Accepts numeric `id` or string `line_id` ("LINE-{id}")
4. **Quantity Field Aliases**: `actual_qty` and `counted_qty` are treated as same
5. **Reason Field Mapping**: `discrepancy_reason`, `reason_code`, and `notes` all map to same database field
6. **Comma-Separated Status**: Supports multiple status values in query parameter
7. **Standard Response Format**: All responses use `{ ok: true, data: ... }` format

---

## 🧪 Testing Checklist

- [x] GET /api/cycle-count returns `{ ok: true, data: [...] }`
- [x] GET /api/cycle-count/:title returns `{ ok: true, data: { ... } }` with both `items` and `lines`
- [x] POST /api/cycle-count/:title/start updates status and returns `started_at` and `started_by`
- [x] POST /api/cycle-count/:title/count accepts `id` (number) or `line_id` (string)
- [x] POST /api/cycle-count/:title/count accepts `actual_qty` or `counted_qty`
- [x] POST /api/cycle-count/:title/update-line accepts both field name formats
- [x] POST /api/cycle-count/:title/submit returns correct status
- [x] POST /api/cycle-count/:title/complete updates status correctly
- [x] Error responses follow `{ ok: false, error: { code, message } }` format
- [x] Status filter supports comma-separated values

---

## 📝 Notes

1. **Backward Compatibility**: All old field names are still supported alongside new mobile app fields
2. **Calculated Fields**: `started_at`, `started_by`, and `is_blind_count` are calculated/derived, not stored
3. **Default Values**: `uom` defaults to "EA", `is_unexpected_item` defaults to false
4. **String Line IDs**: Mobile app expects `line_id` as string "LINE-{id}", but numeric `id` is also accepted
5. **Count Type Mapping**: "Cycle" → "Directed", "Full" → "Adhoc" for mobile app, original preserved in `count_type_original`

---

## 🚀 Ready for Mobile App Integration

The API is now fully compatible with the mobile app's expected JSON format and field names. All endpoints have been tested and verified.

**Next Steps:**
1. Mobile app can now call these endpoints
2. Test with actual mobile app to verify field mappings
3. Monitor for any additional field requirements

