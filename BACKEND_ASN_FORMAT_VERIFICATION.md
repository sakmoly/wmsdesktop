# Backend ASN Format Verification

## 🔍 Current Issue

Based on the mobile app log:
- **Mobile receives:** `"asn_no": "ASN-0005"` (4-digit) ❌
- **Database stores:** `"asn_no_original": "ASN-00005"` (5-digit) ✅
- **Backend should return:** `"asn_no": "ASN-00005"` (5-digit) ✅

## ✅ Backend Implementation Status

The backend API implementation in `wms-api/src/modules/master/masterController.js` is **correct** - it preserves the original format from the database.

### Current Implementation:

```javascript
const query = `
  SELECT 
    a.title,  -- ✅ Use original format from database (no normalization)
    ...
  FROM tabAdvanceShippingNotice a
  ...
`;

const asns = rows.map(row => ({
  asn_no: row.title,  // ✅ Return original format (no normalization)
  ...
}));
```

## 🔧 Verification Steps

### 1. Check if Backend is Updated

Verify that the backend has the updated code from `wms-api/src/modules/master/masterController.js`:

```bash
# Check the backend file
cat wms-api/src/modules/master/masterController.js | grep -A 5 "asn_no:"
```

Should show:
```javascript
asn_no: row.title,  // ✅ Return original format (no normalization)
```

### 2. Check for Normalization Functions

Search for any normalization functions being used:

```bash
# Check for normalizeAsnNumber usage
grep -r "normalizeAsnNumber" wms-api/src/modules/master/

# Check for LPAD or CONCAT in SQL
grep -r "LPAD\|CONCAT.*ASN" wms-api/src/modules/master/
```

Should return **no results** (no normalization).

### 3. Test Backend API Directly

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0].asn_no'
```

**Expected:** `"ASN-00005"` (5-digit format from database)

**If it returns:** `"ASN-0005"` (4-digit) → Backend is still normalizing ❌

## 🚨 If Backend is Still Normalizing

If the backend is still returning 4-digit format, check:

1. **Is the updated code deployed?**
   - Verify `wms-api/src/modules/master/masterController.js` has the correct code
   - Restart the backend server after updating

2. **Is there another normalization layer?**
   - Check middleware that might normalize ASN
   - Check response transformers
   - Check database views that might normalize

3. **Is the database query correct?**
   - Verify the SQL query uses `a.title` directly
   - No `LPAD()`, `CONCAT()`, or normalization in SQL

## ✅ Expected Backend Response

```json
[
  {
    "asn_no": "ASN-00005",  // ✅ 5-digit format (matches database)
    "status": "Submitted",
    "purchase_order": "PO-2024-005",
    "supplier": "Supplier JKL",
    ...
  }
]
```

## 📝 Summary

- **Database:** Stores 5-digit format (ASN-00005) ✅
- **Backend Code:** Preserves original format ✅
- **Backend Response:** Should return 5-digit format (ASN-00005) ✅
- **Mobile App:** Should receive 5-digit format (ASN-00005) ✅

If mobile app is receiving 4-digit format, the backend might not be updated or there's normalization happening elsewhere.

