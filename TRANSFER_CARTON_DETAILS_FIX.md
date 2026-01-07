# Transfer Carton Details Fix

## Issue
Transfer Carton detail window was not showing contents/details.

## Root Cause
The desktop app was querying the database directly for transfer carton contents, but there was no backend API endpoint to get a single transfer carton with its contents (similar to how `GET /api/boxes/:box_id` returns box details with contents).

## Solution
Added `GET /api/transfer-cartons/:tc_id` endpoint that returns transfer carton details along with contents derived from WMS Scan Events.

---

## Changes Made

### 1. Added `getTransferCartonById` Function
**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Functionality:**
- Gets transfer carton by `tc_id`
- Includes all transfer carton fields (status, ASN, TO, store, timestamps, etc.)
- Derives contents from `tabWmsScanEvent` where `tc_id` matches
- Groups contents by `item_code` and `carton_id`, summing quantities
- Returns contents with `item_code`, `source_carton`, `qty`, `packed_by`, `packed_on`

**Query Logic:**
```sql
SELECT 
  item_code,
  carton_id,
  qty,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE tc_id = ?
  AND item_code IS NOT NULL
ORDER BY event_time DESC
```

**Response Format:**
```json
{
  "ok": true,
  "data": {
    "tc_id": "TC-001-001",
    "status": "Created",
    "asn_no": "ASN-0001",
    "to_no": "TO-0001",
    "store": "STORE-001",
    "created_by": "USER-001",
    "created_on": "2025-01-01T10:00:00.000Z",
    "sealed_by": null,
    "sealed_on": null,
    "dispatched_on": null,
    "updated_on": null,
    "remarks": null,
    "contents": [
      {
        "item_code": "ITEM-001",
        "source_carton": "CTN-001",
        "qty": 10,
        "packed_by": "USER-001",
        "packed_on": "2025-01-01T10:30:00.000Z"
      }
    ]
  }
}
```

### 2. Registered Route
**File:** `wms-api/src/routes/transferCartonRoutes.js`

**Route:**
```javascript
// GET /api/transfer-cartons/:tc_id - Get a single transfer carton by ID with contents
router.get('/:tc_id', authenticateToken, getTransferCartonById);
```

**Route Order:**
- `GET /api/transfer-cartons` (list) - registered first
- `GET /api/transfer-cartons/:tc_id` (detail) - registered second
- This ensures the list route doesn't conflict with the detail route

---

## Desktop App Behavior

The desktop app currently queries the database directly using `TransferCartonService.GetCartonContentsAsync()`. This should work correctly if:

1. **WMS Scan Events exist** with `tc_id` populated
2. **Events have `item_code`** populated
3. **Database connection** is available

**Current Query (Desktop App):**
```csharp
var sql = @"SELECT item_code, carton_id, qty, event_time, user_id
            FROM tabWmsScanEvent
            WHERE tc_id = @tc_id
            AND item_code IS NOT NULL
            ORDER BY event_time DESC";
```

---

## Testing

### Test the Backend API Endpoint

```bash
# Get transfer carton details with contents
curl -X GET "http://localhost:3000/api/transfer-cartons/TC-001-001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Expected Response

```json
{
  "ok": true,
  "data": {
    "tc_id": "TC-001-001",
    "status": "Created",
    "asn_no": "ASN-0001",
    "to_no": "TO-0001",
    "store": "STORE-001",
    "contents": [
      {
        "item_code": "ITEM-001",
        "source_carton": "CTN-001",
        "qty": 10,
        "packed_by": "USER-001",
        "packed_on": "2025-01-01T10:30:00.000Z"
      }
    ]
  }
}
```

---

## Troubleshooting

### If Transfer Carton Details Still Don't Show:

1. **Check WMS Scan Events:**
   ```sql
   SELECT * FROM tabWmsScanEvent 
   WHERE tc_id = 'TC-001-001' 
   AND item_code IS NOT NULL;
   ```
   - If no results, there are no events linked to this transfer carton
   - Events need to have `tc_id` populated when items are packed into the transfer carton

2. **Check Event Types:**
   - Events should have `tc_id` populated when items are packed into transfer cartons
   - Common event types: `PACK_BOX_TO_TC`, or any event with `tc_id` set

3. **Check Desktop App Logs:**
   - Look for errors in `TransferCartonService.GetCartonContentsAsync()`
   - Check if database connection is available
   - Verify `tabWmsScanEvent` table exists and has required columns

4. **Verify Backend API:**
   - Test `GET /api/transfer-cartons/:tc_id` endpoint
   - Check if it returns contents in the response
   - Verify authentication token is valid

---

## Related Endpoints

- `GET /api/transfer-cartons` - Get all transfer cartons (list)
- `GET /api/transfer-cartons/:tc_id` - Get single transfer carton with contents (NEW)
- `POST /api/transfer-cartons/create` - Create transfer carton
- `POST /api/transfer-cartons/seal` - Seal transfer carton
- `POST /api/transfer-cartons/dispatch` - Dispatch transfer carton

---

## Notes

1. **Contents are Derived** - Transfer carton contents are not stored directly in `tabTransferCarton`, but derived from `tabWmsScanEvent` where `tc_id` matches
2. **Event Requirements** - For contents to appear, WMS Scan Events must have:
   - `tc_id` populated (links to transfer carton)
   - `item_code` populated (required for contents)
   - `qty` populated (quantity)
3. **Grouping** - Contents are grouped by `item_code` and `carton_id`, with quantities summed
4. **Desktop vs Backend** - Desktop app queries database directly; backend API endpoint is available for mobile app or future use

---

## Files Modified

- ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js` - Added `getTransferCartonById` function
- ✅ `wms-api/src/routes/transferCartonRoutes.js` - Registered `GET /api/transfer-cartons/:tc_id` route

---

## Next Steps

1. **Test the endpoint** to ensure it returns contents correctly
2. **Verify WMS Scan Events** have `tc_id` populated when items are packed into transfer cartons
3. **Update desktop app** (optional) to use backend API if needed, or ensure database queries are working correctly

