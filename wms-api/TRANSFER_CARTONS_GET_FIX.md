# Transfer Cartons GET Endpoint Fix

## Issue

**Error:** `500 Internal Server Error - Failed to fetch transfer cartons`

The `GET /api/master/transfer-cartons` endpoint was failing because it assumed a specific column name (`advance_shipping_notice`) that might not exist in all database schemas.

## Root Cause

The `tabTransferCarton` table may have different column names depending on the database schema:
- **ASN Column:** `advance_shipping_notice` OR `asn_no`
- **Transfer Order Column:** `transfer_order` OR `to_no`

The original implementation hardcoded `advance_shipping_notice`, causing SQL errors when the table used `asn_no` instead.

## Solution

Updated `getAllTransferCartons` in `wms-api/src/modules/master/masterController.js` to:

1. **Detect Schema Dynamically** - Query `INFORMATION_SCHEMA.COLUMNS` to check which columns exist
2. **Use Appropriate Column Names** - Select the correct column based on what's available
3. **Maintain Response Format** - Always return `asn_no` and `transfer_order` in the response (using SQL aliases)

## Implementation

```javascript
// Detect which columns exist in the table
const [columnRows] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabTransferCarton'
  AND COLUMN_NAME IN ('advance_shipping_notice', 'asn_no', 'transfer_order', 'to_no')
`);

const existingColumns = new Set(columnRows.map(row => row.COLUMN_NAME));

// Determine ASN column name
const asnColumn = existingColumns.has('asn_no') ? 'asn_no' : 
                  existingColumns.has('advance_shipping_notice') ? 'advance_shipping_notice' : 
                  'asn_no'; // Default fallback

// Determine Transfer Order column name
const toColumn = existingColumns.has('to_no') ? 'to_no' : 
                 existingColumns.has('transfer_order') ? 'transfer_order' : 
                 'transfer_order'; // Default fallback

// Build query with detected column names
const [rows] = await connection.execute(`
  SELECT 
    tc_id,
    status,
    ${asnColumn} as asn_no,
    ${toColumn} as transfer_order,
    store,
    created_by,
    created_on,
    sealed_by,
    sealed_on,
    dispatched_on,
    updated_on,
    remarks
  FROM tabTransferCarton
  ORDER BY created_on DESC
`);
```

## Response Format

The endpoint always returns data in a consistent format regardless of the underlying schema:

```json
[
  {
    "tc_id": "TC-001-001",
    "status": "Created",
    "asn_no": "ASN-0001",
    "transfer_order": "TO-0001",
    "store": "STORE-001",
    "created_by": "USER-001",
    "created_on": "2024-12-24T10:00:00.000Z",
    "sealed_by": null,
    "sealed_on": null,
    "dispatched_on": null,
    "updated_on": "2024-12-24T10:00:00.000Z",
    "remarks": null
  }
]
```

## Benefits

1. **Schema Agnostic** - Works with both `advance_shipping_notice`/`transfer_order` and `asn_no`/`to_no` schemas
2. **Backward Compatible** - Doesn't break existing installations
3. **Consistent API** - Always returns the same response format
4. **Error Prevention** - Prevents SQL errors from column name mismatches

## Testing

Test the endpoint:

```bash
curl -X GET "http://localhost:3000/api/master/transfer-cartons" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `200 OK` with array of transfer cartons

## Files Modified

- ✅ `wms-api/src/modules/master/masterController.js` - Updated `getAllTransferCartons` function

## Related Endpoints

This fix ensures consistency with:
- `POST /api/transfer-cartons/create` - Uses `advance_shipping_notice` and `transfer_order` in INSERT
- `POST /api/transfer-cartons/seal` - Updates transfer carton status
- `POST /api/transfer-cartons/dispatch` - Updates transfer carton status

## Notes

- The endpoint now logs the detected schema for debugging: `Transfer Carton schema detected: ASN column=advance_shipping_notice, TO column=transfer_order`
- If neither column name exists, it falls back to defaults (`asn_no` and `transfer_order`)
- The response always uses `asn_no` and `transfer_order` field names for consistency with the mobile app

