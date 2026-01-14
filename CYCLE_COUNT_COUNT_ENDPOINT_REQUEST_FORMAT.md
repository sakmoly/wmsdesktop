# Cycle Count Count Endpoint - Correct Request Format

## Endpoint
```
POST /api/cycle-count/{title}/count
```

## Correct Request Body Format

The endpoint expects a **simple payload with a `lines` array**, NOT a full task object.

### ✅ Correct Format (With Carton ID)

```json
{
    "counted_by": "USER-001",
    "lines": [
        {
            "item_code": "SKU-001",
            "bin_location": "A1-R01-L1-B1",
            "carton_id": "CARTON-001",
            "actual_qty": 48.00,
            "counted_qty": 48.00,
            "discrepancy_reason": "Damaged items found"
        }
    ]
}
```

### ✅ Correct Format (Without Carton ID - Bin Level)

```json
{
    "counted_by": "USER-001",
    "lines": [
        {
            "item_code": "SKU-001",
            "bin_location": "A1-R01-L1-B1",
            "actual_qty": 48.00,
            "counted_qty": 48.00,
            "discrepancy_reason": "Damaged items found"
        }
    ]
}
```

### ✅ Minimal Format (Only Required Fields)

```json
{
    "lines": [
        {
            "item_code": "SKU-001",
            "actual_qty": 48.00
        }
    ]
}
```

## ❌ Wrong Format (What You're Currently Sending)

**DO NOT send a full task object like this:**

```json
{
    "ok": true,
    "data": {
        "title": "CC-A1-R01-L1-B1-MK6MZ1UR",
        "status": "Draft",
        "count_type": "Adhoc",
        "warehouse_id": "WH-MAIN",
        "count_date": "2026-01-08",
        ...
    }
}
```

This is the format returned by **GET** requests, not what you send to **POST /count**.

## Required Fields in `lines` Array

Each line object should have:

| Field | Required | Description |
|-------|----------|-------------|
| `item_code` | ✅ Yes | The item code/SKU |
| `actual_qty` | ✅ Yes | The actual quantity counted |
| `bin_location` | ⚠️ Recommended | Bin location for matching |
| `carton_id` | ❌ Optional | Carton ID if counting at carton level |
| `counted_qty` | ❌ Optional | Same as `actual_qty` (for compatibility) |
| `discrepancy_reason` | ❌ Optional | Reason for discrepancy |
| `line_id` | ❌ Optional | Line ID if updating existing line |

## Example: Submitting Multiple Items

```json
{
    "counted_by": "USER-001",
    "lines": [
        {
            "item_code": "SKU-001",
            "bin_location": "A1-R01-L1-B1",
            "carton_id": "CARTON-001",
            "actual_qty": 48.00
        },
        {
            "item_code": "SKU-002",
            "bin_location": "A1-R01-L1-B1",
            "carton_id": "CARTON-002",
            "actual_qty": 25.00
        }
    ]
}
```

## Expected Response

```json
{
    "ok": true,
    "message": "Successfully updated 1 lines",
    "data": {
        "title": "CC-A1-R01-L1-B1-MK6MZ1UR",
        "updated_count": 1,
        "counted_items": 2,
        "items_with_discrepancy": 2,
        "total_items": 15
    }
}
```

## Common Errors

### Error 1: "lines array is required and must not be empty"
- **Cause:** Missing `lines` field or empty array
- **Fix:** Add `"lines": [...]` with at least one item

### Error 2: Wrong request body structure
- **Cause:** Sending full task object instead of simple payload
- **Fix:** Use the format shown above with just `counted_by` and `lines`

## Quick Test in Postman

1. **Method:** `POST`
2. **URL:** `http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/count`
3. **Headers:**
   - `Content-Type: application/json`
   - `Authorization: Bearer {your-token}`
4. **Body (raw JSON):**
   ```json
   {
       "counted_by": "USER-001",
       "lines": [
           {
               "item_code": "SKU-001",
               "bin_location": "A1-R01-L1-B1",
               "carton_id": "CARTON-001",
               "actual_qty": 48.00
           }
       ]
   }
   ```

