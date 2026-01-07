# Putaway - Scan Transfer Carton API

## Endpoint

**URL:** `POST /api/putaway/scan-transfer-carton`

**Authentication:** Required (Bearer token)

---

## Request

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "tc_id": "TC-1766952896460",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-001"
}
```

**Required Fields:**
- `tc_id` (string) - Transfer Carton ID
- `rack` (string) - Rack location

**Optional Fields:**
- `bin` (string) - Bin location  
- `user_id` (string) - User ID

---

## Response

### Success (200)
```json
{
  "ok": true,
  "message": "Putaway task created and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "transfer_carton": "TC-1766952896460",
    "asn_no": "ASN-AAA",
    "rack": "RACK-A",
    "bin": "BIN-01",
    "items_count": 3,
    "items": [
      {
        "item_code": "SKU-001",
        "carton_id": "CTN-001",
        "qty": 50.0,
        "rack": "RACK-A",
        "bin": "BIN-01"
      }
    ],
    "is_new_task": true
  }
}
```

### Error Responses

**400 - Validation Error:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "tc_id and rack are required"
  }
}
```

**404 - Transfer Carton Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "TRANSFER_CARTON_NOT_FOUND",
    "message": "Transfer carton TC-1766952896460 not found"
  }
}
```

**400 - No Items Found:**
```json
{
  "ok": false,
  "error": {
    "code": "NO_ITEMS_FOUND",
    "message": "No items found in transfer carton TC-1766952896460"
  }
}
```

---

## How It Works

1. **Validates** transfer carton exists
2. **Gets ASN** from transfer carton
3. **Gets all items** from transfer carton (from `PACK_BOX_TO_TC` events)
4. **Finds or creates** putaway task for the ASN
5. **Creates/updates** putaway lines for each item with scanned location
6. **Returns** putaway task details with all assigned items

---

## Important Notes

⚠️ **Server Restart Required:** After adding this endpoint, you must restart the backend server for the route to be available.

**To restart the server:**
1. Stop the current server process
2. Start the server again
3. The new route will be available at `POST /api/putaway/scan-transfer-carton`

---

## Implementation Files

- **Controller:** `wms-api/src/modules/putaway/putawayController.js`
- **Routes:** `wms-api/src/routes/putawayRoutes.js`
- **Main Routes:** `wms-api/src/routes/index.js` (line 43)

---

## Testing

**Using curl:**
```bash
curl -X POST http://localhost:3000/api/putaway/scan-transfer-carton \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tc_id": "TC-1766952896460",
    "rack": "RACK-A",
    "bin": "BIN-01",
    "user_id": "USER-001"
  }'
```

**Using Postman:**
- Method: POST
- URL: `http://your-server/api/putaway/scan-transfer-carton`
- Headers: `Authorization: Bearer {token}`
- Body (JSON):
```json
{
  "tc_id": "TC-1766952896460",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-001"
}
```

