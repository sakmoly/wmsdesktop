# ASN Format - Final Clarification

## ✅ Actual Database Format

**Database stores:** 4-digit format (ASN-0001, ASN-0002, ASN-0003, ASN-0004, ASN-0005)  
**Desktop App shows:** 4-digit format (ASN-0001, ASN-0002, etc.) ✅ **CORRECT - matches database**  
**Mobile App shows:** 5-digit format (ASN-00005, ASN-00001, etc.) ❌ **WRONG - doesn't match database**  
**Backend should return:** 4-digit format (ASN-0001) to match database ✅

## 🎯 Goal

**Mobile app should show the same format as desktop and MySQL:**
- ASN-0001 (4-digit)
- ASN-0002 (4-digit)
- ASN-0003 (4-digit)
- ASN-0004 (4-digit)
- ASN-0005 (4-digit)

## 🔧 Solution

The backend API must return ASN in **4-digit format** (exactly as stored in database) without any normalization to 5-digit.

The backend code in `wms-api/src/modules/master/masterController.js` is already correct - it preserves the original format. If the backend is still returning 5-digit format, it means:

1. The backend code hasn't been deployed yet, OR
2. There's normalization happening elsewhere in the backend

## ✅ Backend Implementation (Already Correct)

The backend code preserves the original format:

```javascript
const query = `
  SELECT 
    a.title,  -- ✅ Returns exactly as stored (4-digit: ASN-0001)
    ...
  FROM tabAdvanceShippingNotice a
  ...
`;

const asns = rows.map(row => ({
  asn_no: row.title,  // ✅ Returns original format (4-digit: ASN-0001)
  ...
}));
```

## 📋 Action Items

1. **Verify Backend is Deployed:**
   - Ensure `wms-api/src/modules/master/masterController.js` has the correct code
   - Restart backend server

2. **Test Backend API:**
   ```bash
   curl -X GET "http://localhost:3000/api/master/asns" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     | jq '.[0].asn_no'
   ```
   **Expected:** `"ASN-0001"` (4-digit format) ✅  
   **If returns:** `"ASN-00001"` (5-digit) → Backend is still normalizing ❌

3. **Check for Normalization:**
   - Search for `normalizeAsnNumber()` function usage
   - Search for `LPAD()` or `CONCAT()` in SQL queries
   - Remove any normalization logic

## 🎯 Expected Result

After fix:
- ✅ **Database:** 4-digit format (ASN-0001, ASN-0002, etc.)
- ✅ **Backend:** Returns 4-digit format (ASN-0001) ✅
- ✅ **Desktop:** Shows 4-digit format (ASN-0001) ✅ Already correct
- ✅ **Mobile:** Shows 4-digit format (ASN-0001) ✅ Should match after backend fix

## 📝 Summary

- **Database:** 4-digit format (ASN-0001) ✅
- **Desktop:** 4-digit format (ASN-0001) ✅ Already correct
- **Backend:** Should return 4-digit format (ASN-0001) ✅ Code is correct, needs deployment
- **Mobile:** Should show 4-digit format (ASN-0001) ✅ Will match after backend fix

The backend code is already correct - it preserves the original 4-digit format from the database. Just need to ensure it's deployed and not being normalized elsewhere.

