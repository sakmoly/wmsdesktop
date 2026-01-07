# Transfer Carton Create API Fix

## Issues

### Issue 1: Field Name Mismatch
**Error:** `400: tc_id, advance_shipping_notice, transfer_order, store, and created_by are required`

The mobile app was sending different field names than what the endpoint expected:
- Mobile app sends: `asn_no`, `to_no`, `user_id`
- Endpoint expected: `advance_shipping_notice`, `transfer_order`, `created_by`

### Issue 2: Database Column Mismatch
**Error:** `Unknown column 'advance_shipping_notice' in 'field list'`

The database table uses `asn_no` and `to_no`, but the code was hardcoded to use `advance_shipping_notice` and `transfer_order`.

## Solution Implemented

Updated `createTransferCarton` in `transferCartonController.js` to:

1. **Accept Both Field Name Formats** - Support both mobile and desktop app formats
2. **Normalize Field Names** - Map mobile app fields to database columns
3. **Detect Schema Dynamically** - Use `DESCRIBE` to query table structure and detect correct database column names (`asn_no` vs `advance_shipping_notice`, `to_no` vs `transfer_order`)
4. **Robust Error Handling** - Better error messages showing available columns if detection fails

## Field Name Mapping

| Mobile App Field | Desktop App Field | Database Column (Detected) |
|------------------|------------------|---------------------------|
| `asn_no` | `advance_shipping_notice` | `asn_no` OR `advance_shipping_notice` |
| `to_no` | `transfer_order` | `to_no` OR `transfer_order` |
| `user_id` | `created_by` | `created_by` |

## Implementation

### Request Body (Mobile App Format - Now Supported):
```json
{
  "tc_id": "TC-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "user_id": "USER-001"
}
```

### Request Body (Desktop App Format - Still Supported):
```json
{
  "tc_id": "TC-001-001",
  "advance_shipping_notice": "ASN-0001",
  "transfer_order": "TO-0001",
  "store": "STORE-001",
  "created_by": "USER-001"
}
```

### Code Changes:

```javascript
// Accept both mobile and desktop app field names
const { 
  tc_id, 
  advance_shipping_notice, 
  asn_no,  // Mobile app format
  transfer_order, 
  to_no,  // Mobile app format
  store, 
  created_by,
  user_id  // Mobile app format
} = req.body;

// Normalize field names (prefer mobile app format, fallback to desktop)
const normalizedASN = asn_no || advance_shipping_notice;
const normalizedTO = to_no || transfer_order;
const normalizedCreatedBy = user_id || created_by;

// Detect schema by querying table structure directly (more reliable)
const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
const allColumns = new Set(tableInfo.map(row => row.Field));

// Determine ASN column (prefer asn_no, fallback to advance_shipping_notice)
let asnColumn;
if (allColumns.has('asn_no')) {
  asnColumn = 'asn_no';
} else if (allColumns.has('advance_shipping_notice')) {
  asnColumn = 'advance_shipping_notice';
} else {
  throw new Error('Cannot find ASN column. Available columns: ' + Array.from(allColumns).join(', '));
}

// Determine TO column (prefer to_no, fallback to transfer_order)
let toColumn;
if (allColumns.has('to_no')) {
  toColumn = 'to_no';
} else if (allColumns.has('transfer_order')) {
  toColumn = 'transfer_order';
} else {
  throw new Error('Cannot find TO column. Available columns: ' + Array.from(allColumns).join(', '));
}

// Use detected column names in INSERT
const insertSQL = `
  INSERT INTO tabTransferCarton 
    (tc_id, status, ${asnColumn}, ${toColumn}, store, created_by, created_on)
  VALUES (?, 'Created', ?, ?, ?, ?, NOW())
`;

await connection.execute(insertSQL, [tc_id, normalizedASN, normalizedTO, store, normalizedCreatedBy]);
```

## Benefits

1. **Mobile App Compatible** - Accepts `asn_no`, `to_no`, `user_id` from mobile app
2. **Desktop App Compatible** - Still accepts `advance_shipping_notice`, `transfer_order`, `created_by`
3. **Schema Agnostic** - Works with both `asn_no`/`to_no` and `advance_shipping_notice`/`transfer_order` database schemas
4. **Backward Compatible** - Doesn't break existing desktop app integrations

## Testing

### Test with Mobile App Format:
```bash
curl -X POST http://localhost:3000/api/transfer-cartons/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tc_id": "TC-001-001",
    "asn_no": "ASN-0001",
    "to_no": "TO-0001",
    "store": "STORE-001",
    "user_id": "USER-001"
  }'
```

### Test with Desktop App Format:
```bash
curl -X POST http://localhost:3000/api/transfer-cartons/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tc_id": "TC-001-001",
    "advance_shipping_notice": "ASN-0001",
    "transfer_order": "TO-0001",
    "store": "STORE-001",
    "created_by": "USER-001"
  }'
```

Expected: `200 OK` with success message

## Files Modified

1. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - `createTransferCarton` - Added field name normalization and schema detection

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Verify Mobile App**
   - Mobile app should now be able to create transfer cartons successfully
   - No more validation errors

## Notes

- The endpoint now logs detected schema for debugging
- Field normalization happens before validation
- Both field name formats are accepted (mobile app format takes precedence)
- Database column detection ensures compatibility with different schemas

