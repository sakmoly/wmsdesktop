# Transfer Carton Endpoint Fix ✅

## Issue Fixed

The `GET /api/master/transfer-cartons` endpoint was trying to select a non-existent column `advance_shipping_notice`, causing a 400 error.

## ✅ Solution Applied

### 1. Removed Non-Existent Column References

**Before (❌ Error):**
```sql
SELECT tc_id, asn_no, advance_shipping_notice, to_no, transfer_order, store, status, updated_on, created_at 
FROM tabTransferCarton
```

**After (✅ Fixed):**
```sql
SELECT tc_id, asn_no, to_no, store, status, updated_on, created_at 
FROM tabTransferCarton
```

### 2. Updated WHERE Clause

**Before (❌ Error):**
```sql
WHERE advance_shipping_notice = ?
```

**After (✅ Fixed):**
```sql
WHERE asn_no = ?
```

### 3. Simplified Response Mapping

Removed the fallback logic for old column names since we now only use `asn_no` and `to_no`.

---

## Response Format

The endpoint now returns:

```json
{
  "success": true,
  "data": [
    {
      "tc_id": "TC-1234567890",
      "asn_no": "ASN-00001",
      "to_no": "TO-00012",
      "store": "WAREHOUSE",
      "status": "Sealed",
      "updated_on": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Query Parameters

The endpoint supports filtering:

- `?asn=ASN-00001` - Filter by ASN number
- `?store=WAREHOUSE` - Filter by store
- `?asn=ASN-00001&store=WAREHOUSE` - Filter by both

---

## Database Schema

The endpoint now correctly uses:
- ✅ `asn_no` (not `advance_shipping_notice`)
- ✅ `to_no` (not `transfer_order`)
- ✅ All other columns as-is

---

## Testing

Test the endpoint:

```bash
curl -X GET "http://localhost:3000/api/master/transfer-cartons" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `200 OK` with transfer cartons array

---

## Files Modified

- ✅ `wms-api/src/modules/pull/pullController.js`
  - Removed `advance_shipping_notice` from SELECT
  - Removed `transfer_order` from SELECT
  - Changed WHERE clause to use `asn_no`
  - Simplified response mapping

---

**Fix Complete! ✅**

The endpoint should now work without errors.

