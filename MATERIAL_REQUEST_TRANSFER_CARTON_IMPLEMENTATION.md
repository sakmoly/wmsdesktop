# Material Request Transfer Carton - Implementation Summary

## ✅ Changes Implemented

### 1. Updated Validation Logic ✅

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Changes:**
- ✅ Added support for Material Request detection (checks for `material_request` field or `MR-` prefix)
- ✅ Updated validation to allow `null` ASN for Material Request transfer cartons
- ✅ Added validation to ensure Material Request format (MR-XXXX) in `transfer_order`/`to_no`
- ✅ Updated validation error messages to be more specific

**Key Validation Rules:**
1. **Material Request Transfer Cartons:**
   - `asn_no`/`advance_shipping_notice` must be `null`
   - `to_no`/`transfer_order` must be Material Request number (format: `MR-XXXX`)
   - `tc_id`, `store`, and `user_id`/`created_by` are required

2. **Regular Transfer Orders:**
   - `to_no`/`transfer_order` is required
   - `asn_no`/`advance_shipping_notice` may be required or optional (depending on schema)

### 2. Updated INSERT Logic ✅

**Changes:**
- ✅ Checks if ASN column is nullable
- ✅ Sets ASN to `null` for Material Request transfer cartons
- ✅ Handles null ASN values correctly in INSERT statement

### 3. Updated API Documentation ✅

**Changes:**
- ✅ Updated function comments with Material Request examples
- ✅ Added request body examples for Material Request transfer cartons
- ✅ Documented both mobile and desktop app formats

---

## 📋 Request Format

### Material Request Transfer Carton

**Mobile App Format:**
```json
{
  "tc_id": "TC-MR-0001-1234567890",
  "asn_no": null,
  "to_no": "MR-0001",
  "store": "SHOWROOM-001",
  "user_id": "USER-003",
  "material_request": "MR-0001"
}
```

**Desktop App Format:**
```json
{
  "tc_id": "TC-MR-0001-1234567890",
  "advance_shipping_notice": null,
  "transfer_order": "MR-0001",
  "store": "SHOWROOM-001",
  "created_by": "USER-003"
}
```

### Regular Transfer Order (Unchanged)

**Mobile App Format:**
```json
{
  "tc_id": "TC-001-001",
  "asn_no": "ASN-0001",
  "to_no": "TO-0001",
  "store": "STORE-001",
  "user_id": "USER-001"
}
```

---

## 🔍 Material Request Detection

The API detects Material Request transfer cartons by:
1. Checking for `material_request` field in request body
2. OR checking if `transfer_order`/`to_no` starts with `MR-` prefix

```javascript
const isMaterialRequest = material_request || 
  (normalizedTO && (normalizedTO.startsWith('MR-') || normalizedTO.match(/^MR-\d+$/i)));
```

---

## ✅ Validation Rules

### Material Request Transfer Cartons:
- ✅ `asn_no`/`advance_shipping_notice` must be `null` (or empty string)
- ✅ `to_no`/`transfer_order` must match pattern `MR-XXXX` (e.g., "MR-0001")
- ✅ `tc_id`, `store`, `user_id`/`created_by` are required

### Regular Transfer Orders:
- ✅ `to_no`/`transfer_order` is required
- ✅ `asn_no`/`advance_shipping_notice` validation depends on schema (may be optional)

---

## 🗄️ Database Schema

**No schema changes required!**

The existing `tabTransferCarton` table structure supports this:
- `asn_no`/`advance_shipping_notice` column can be `NULL` (already nullable)
- `to_no`/`transfer_order` column can store Material Request numbers (string/varchar)
- Material Request numbers (e.g., "MR-0001") are stored in the same column as Transfer Order numbers

---

## 📊 Query Examples

### Find Material Request Transfer Cartons:
```sql
SELECT * FROM tabTransferCarton 
WHERE to_no LIKE 'MR-%' 
   OR transfer_order LIKE 'MR-%';
```

### Distinguish Transfer Types:
```sql
-- Material Request Transfer Cartons
SELECT * FROM tabTransferCarton 
WHERE (to_no LIKE 'MR-%' OR transfer_order LIKE 'MR-%')
  AND (asn_no IS NULL OR advance_shipping_notice IS NULL);

-- Regular Transfer Order Cartons
SELECT * FROM tabTransferCarton 
WHERE (to_no NOT LIKE 'MR-%' OR to_no IS NULL)
  AND (asn_no IS NOT NULL OR advance_shipping_notice IS NOT NULL);
```

### Join with Material Request Table (if exists):
```sql
SELECT 
  tc.tc_id,
  tc.to_no AS material_request_number,
  tc.store,
  tc.status,
  mr.title,
  mr.status AS mr_status,
  mr.from_warehouse,
  mr.to_showroom
FROM tabTransferCarton tc
LEFT JOIN tabMaterialRequest mr 
  ON tc.to_no = mr.title 
  OR tc.transfer_order = mr.title
WHERE tc.to_no LIKE 'MR-%' 
   OR tc.transfer_order LIKE 'MR-%';
```

---

## 🔄 Backward Compatibility

✅ **Fully Backward Compatible:**
- Regular Transfer Orders work exactly as before
- No breaking changes to existing API contracts
- Desktop app format still supported
- Mobile app format still supported

---

## 🧪 Testing Checklist

- [x] Create Transfer Carton with Material Request number
- [x] Verify `asn_no` is `null` for Material Requests
- [x] Verify `to_no` contains Material Request number (MR-XXXX)
- [x] Validate Material Request format (MR-XXXX)
- [x] Reject Material Request with non-null ASN
- [x] Create regular Transfer Order (backward compatibility)
- [x] Query Transfer Cartons by Material Request number
- [x] Distinguish Material Request vs Regular TO in queries

---

## 📝 Error Messages

### Material Request with Non-Null ASN:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "advance_shipping_notice (asn_no) must be null for Material Request transfer cartons"
  }
}
```

### Invalid Material Request Format:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "transfer_order (to_no) must be a valid Material Request number (format: MR-XXXX) for Material Request transfer cartons"
  }
}
```

### Missing Required Fields:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "tc_id, store, and user_id (or created_by) are required"
  }
}
```

---

## ✅ Files Modified

1. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - Updated `createTransferCarton()` function
   - Added Material Request detection logic
   - Updated validation rules
   - Updated INSERT logic to handle null ASN
   - Updated API documentation/comments

---

## 🚀 Ready to Use

All changes are implemented and ready to use! The API now supports:
- ✅ Material Request transfer cartons (null ASN, MR-XXXX in transfer_order)
- ✅ Regular Transfer Order cartons (backward compatible)
- ✅ Both mobile and desktop app field name formats
- ✅ Schema-agnostic column detection

**No database migrations required!** The existing schema already supports this functionality.

