# Transfer Cartons GET Endpoint Implementation

## Issue

**Error:** `404: Route GET /api/transfer-cartons not found`

The mobile app was trying to fetch transfer cartons using `GET /api/transfer-cartons` with query parameters, but the endpoint didn't exist.

## Solution Implemented

Added `GET /api/transfer-cartons` endpoint that:
1. **Supports Query Parameters** - Filter by ASN and/or store
2. **Dynamic Schema Detection** - Automatically detects correct database column names
3. **Consistent Response Format** - Returns data in mobile app compatible format

## Endpoint Details

### Route
```
GET /api/transfer-cartons
```

### Query Parameters (Optional)

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `asn` | string | Filter by ASN number | `?asn=ASN-0002` |
| `store` | string | Filter by store code | `?store=WAREHOUSE` |

### Examples

**Get all transfer cartons:**
```http
GET /api/transfer-cartons
Authorization: Bearer {token}
```

**Filter by ASN:**
```http
GET /api/transfer-cartons?asn=ASN-0002
Authorization: Bearer {token}
```

**Filter by ASN and Store:**
```http
GET /api/transfer-cartons?asn=ASN-0002&store=WAREHOUSE
Authorization: Bearer {token}
```

## Response Format

### Success (200 OK)

```json
{
  "ok": true,
  "data": [
    {
      "tc_id": "TC-001-001",
      "status": "Created",
      "asn_no": "ASN-0002",
      "to_no": "TO-0001",
      "store": "WAREHOUSE",
      "created_by": "USER-001",
      "created_on": "2024-01-15T10:30:00.000Z",
      "sealed_by": null,
      "sealed_on": null,
      "dispatched_on": null,
      "updated_on": "2024-01-15T10:30:00.000Z",
      "remarks": null
    }
  ],
  "count": 1
}
```

### Error (500 Internal Server Error)

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to fetch transfer cartons",
    "details": "Error details (only in development mode)"
  }
}
```

## Implementation Details

### Schema Detection

The endpoint automatically detects the correct database column names:
- **ASN Column:** `asn_no` OR `advance_shipping_notice`
- **TO Column:** `to_no` OR `transfer_order`

This ensures compatibility with different database schemas.

### SQL Query Building

```javascript
// Build WHERE clause based on query parameters
const whereConditions = [];
const queryParams = [];

if (asn) {
  whereConditions.push(`${asnColumn} = ?`);
  queryParams.push(asn);
}

if (store) {
  whereConditions.push('store = ?');
  queryParams.push(store);
}

const whereClause = whereConditions.length > 0 
  ? `WHERE ${whereConditions.join(' AND ')}` 
  : '';
```

### Response Mapping

All results are normalized to use consistent field names:
- `asn_no` (always, regardless of database column name)
- `to_no` (always, regardless of database column name)
- ISO 8601 date format for all timestamps
- `null` for optional fields

## Files Modified

1. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - Added `getTransferCartons` function

2. ✅ `wms-api/src/routes/transferCartonRoutes.js`
   - Registered `GET /api/transfer-cartons` route

## Testing

### Test with cURL

```bash
# Get all transfer cartons
curl -X GET "http://localhost:3000/api/transfer-cartons" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by ASN
curl -X GET "http://localhost:3000/api/transfer-cartons?asn=ASN-0002" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by ASN and Store
curl -X GET "http://localhost:3000/api/transfer-cartons?asn=ASN-0002&store=WAREHOUSE" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Expected Results

- ✅ Returns 200 OK with transfer cartons array
- ✅ Filters correctly by ASN when provided
- ✅ Filters correctly by store when provided
- ✅ Filters by both when both parameters provided
- ✅ Returns empty array if no matches found
- ✅ Handles schema variations automatically

## Mobile App Compatibility

The endpoint is now compatible with the mobile app's expected format:
- ✅ Returns `ok: true` for success
- ✅ Returns `data` array with transfer cartons
- ✅ Supports `asn` and `store` query parameters
- ✅ Uses consistent field names (`asn_no`, `to_no`)

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Verify Mobile App**
   - Mobile app should now be able to fetch transfer cartons successfully
   - No more 404 errors

## Notes

- The endpoint uses the same schema detection logic as the `createTransferCarton` endpoint
- Results are ordered by `created_on DESC, tc_id` for consistent ordering
- All timestamps are converted to ISO 8601 format
- Optional fields return `null` instead of `undefined`

