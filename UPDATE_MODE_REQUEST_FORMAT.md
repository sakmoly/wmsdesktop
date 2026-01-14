# Update Mode Request Format

## Error Fix: Invalid JSON Body

If you're getting this error:
```
SyntaxError: Unexpected token 'P', "POST /api/"... is not valid JSON
```

This means the request body includes the HTTP method line, which shouldn't happen.

## Correct Request Format

### Postman Configuration

1. **Method:** `POST`
2. **URL:** `http://localhost:3000/api/events/batch`
3. **Headers:**
   ```
   Content-Type: application/json
   Authorization: Bearer {your_token}
   ```
4. **Body:** Select **"raw"** and **"JSON"** format
5. **Body Content:** Only the JSON object (no HTTP method line)

### Correct Request Body

```json
{
  "update_mode": true,
  "events": [
    {
      "tc_id": "TC-MR-123459-1768157787512",
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "qty": 6.0,
      "user_id": "USER-150526"
    }
  ]
}
```

### ❌ Incorrect (What NOT to do)

**DO NOT include the HTTP method line in the body:**
```
POST /api/events/batch

{
  "update_mode": true,
  ...
}
```

The body should **ONLY** contain the JSON object, not the HTTP method line.

## Common Postman Issues

### Issue 1: Body Type Not Set to JSON

**Fix:**
- Go to "Body" tab
- Select "raw"
- Select "JSON" from dropdown (not "Text")

### Issue 2: HTTP Method Line in Body

**Fix:**
- Make sure the body contains **ONLY** the JSON object
- Do not include `POST /api/events/batch` in the body
- The URL should be in the URL field, not in the body

### Issue 3: Content-Type Header Missing

**Fix:**
- Add header: `Content-Type: application/json`
- Postman usually adds this automatically when you select "JSON" format

## Testing with cURL

```bash
curl -X POST http://localhost:3000/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "update_mode": true,
    "events": [
      {
        "tc_id": "TC-MR-123459-1768157787512",
        "item_code": "SKU-HAT-301-BLU-OS",
        "carton_id": "PAW-ASN365425473-1768138301111",
        "qty": 6.0,
        "user_id": "USER-150526"
      }
    ]
  }'
```

## Expected Response

```json
{
  "ok": true,
  "message": "Quantity updates processed",
  "updated_count": 1,
  "failed_count": 0,
  "total_count": 1,
  "results": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "ok": true,
      "message": "Quantity decreased",
      "current_qty": 10,
      "new_qty": 6,
      "events_deleted": 4,
      "qty_reduced": 4
    }
  ]
}
```

---

**Status:** ✅ **FIXED** - Better error handling added  
**Date:** 2026-01-12
