# ASN Format Issue - Resolution Guide

## 🔍 Issue Identified

**Mobile App Log Shows:**
- `"asn_no": "ASN-0005"` (4-digit) ❌ **Backend is normalizing**
- `"asn_no_original": "ASN-00005"` (5-digit) ✅ **Database format**

**Root Cause:**
The backend API is still normalizing ASN format from 5-digit to 4-digit, even though the database stores 5-digit format.

## ✅ Solution

The backend code has been updated in `wms-api/src/modules/master/masterController.js` to preserve the original format. **The backend team needs to deploy this code.**

## 📋 Action Items

### 1. Deploy Updated Backend Code

**File to Update:** `wms-api/src/modules/master/masterController.js`

**Current Code (WRONG - Normalizing):**
```javascript
// ❌ If backend is normalizing, it might have code like:
asn_no: normalizeAsnNumber(row.title),  // Don't do this
// or
asn_no: formatAsnTo4Digit(row.title),  // Don't do this
```

**Updated Code (CORRECT - Preserves Original):**
```javascript
// ✅ Correct implementation:
asn_no: row.title,  // Return original format (no normalization)
```

### 2. Verify No Normalization Functions

Check that the backend is NOT using:
- ❌ `normalizeAsnNumber()` function
- ❌ `LPAD()` or `CONCAT()` in SQL to format ASN
- ❌ Any other normalization/formatting logic

### 3. Restart Backend Server

After updating the code:
```bash
# Stop the backend server
# Then restart
npm start
# or
node server.js
```

### 4. Test Backend API

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0].asn_no'
```

**Expected:** `"ASN-00005"` (5-digit format) ✅  
**If returns:** `"ASN-0005"` (4-digit) → Still normalizing ❌

## 🎯 Expected Result

After backend is updated:

1. **Database:** `ASN-00005` (5-digit) ✅
2. **Backend API:** Returns `ASN-00005` (5-digit) ✅
3. **Mobile App:** Receives `ASN-00005` (5-digit) ✅
4. **Desktop App:** Shows `ASN-00005` (5-digit) ✅

## 📝 Files Ready for Deployment

The correct backend implementation is ready in:
- ✅ `wms-api/src/modules/master/masterController.js` - Complete implementation
- ✅ `wms-api/src/routes/masterRoutes.js` - Route registration

**Next Step:** Copy these files to your actual backend API project and restart the server.

## 🔍 Verification

After deployment, verify:

1. **Backend Response:**
   ```json
   {
     "asn_no": "ASN-00005"  // ✅ 5-digit format
   }
   ```

2. **Mobile App Log:**
   ```
   "asn_no": "ASN-00005"  // ✅ Should match database
   ```

3. **Desktop App:**
   Should show `ASN-00005` (5-digit) to match database

---

**Status:** ✅ Backend code is ready - needs to be deployed  
**Priority:** High - Mobile and desktop must match database format

