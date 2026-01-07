# Backend ASN API - Deployment Guide

## ✅ Files Ready for Deployment

1. **`wms-api/src/modules/master/masterController.js`** - Complete implementation
2. **`wms-api/src/routes/masterRoutes.js`** - Route registration

## 📋 Deployment Steps

### Step 1: Copy Files to Backend

Copy the following files to your backend API project:

```
From: wms-api/src/modules/master/masterController.js
To:   [your-backend-path]/src/modules/master/masterController.js

From: wms-api/src/routes/masterRoutes.js
To:   [your-backend-path]/src/routes/masterRoutes.js
```

### Step 2: Update Main Routes File

In your backend's main routes file (usually `src/routes/index.js`), add:

**Option A: Using separate route file**
```javascript
import masterRoutes from './masterRoutes.js';

// ... existing code ...

router.use('/api/master', masterRoutes);
```

**Option B: Inline registration**
```javascript
import { getAllAsns } from '../modules/master/masterController.js';

// ... existing code ...

router.get('/api/master/asns', authenticateToken, getAllAsns);
```

### Step 3: Verify No Normalization

Search your backend codebase for any normalization functions:

```bash
# Search for normalizeAsnNumber usage
grep -r "normalizeAsnNumber" src/

# Search for LPAD or CONCAT in SQL
grep -r "LPAD\|CONCAT.*ASN" src/modules/master/
```

**If found, remove or comment out any normalization logic.**

### Step 4: Restart Backend Server

```bash
# Stop the backend server
# Then restart
npm start
# or
node server.js
# or
pm2 restart wms-api
```

### Step 5: Test the API

```bash
# Test the endpoint
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0]'
```

**Expected Response:**
```json
{
  "asn_no": "ASN-0001",  // ✅ 4-digit format (matches database)
  "status": "Submitted",
  "purchase_order": "PO-2024-001",
  "supplier": "Supplier ABC",
  "shipment_date": "2024-12-20",
  "expected_arrival_date": "2024-12-25",
  "total_shipped_qty": 150,
  "airway_bill_no": null,
  "shipment_type": "Road",
  "updated_on": "2024-12-24T16:14:04.000Z",
  "total_carton_count": 2
}
```

### Step 6: Verify Format

Check that `asn_no` is in 4-digit format:
```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[].asn_no'
```

**Expected Output:**
```
"ASN-0001"
"ASN-0002"
"ASN-0003"
"ASN-0004"
"ASN-0005"
```

All should be 4-digit format (matching database).

## ✅ Verification Checklist

- [ ] Files copied to backend project
- [ ] Route registered in main routes file
- [ ] No normalization functions found/removed
- [ ] Backend server restarted
- [ ] API tested and returns 4-digit format
- [ ] Mobile app tested and shows 4-digit format
- [ ] Mobile matches desktop and database format

## 🎯 Expected Result

After deployment:
- ✅ **Database:** 4-digit format (ASN-0001, ASN-0002, etc.)
- ✅ **Backend API:** Returns 4-digit format (ASN-0001) ✅
- ✅ **Desktop App:** Shows 4-digit format (ASN-0001) ✅ Already correct
- ✅ **Mobile App:** Shows 4-digit format (ASN-0001) ✅ Will match after backend fix

## 🚨 Troubleshooting

### If API still returns 5-digit format:

1. **Check if code was deployed:**
   - Verify `masterController.js` has the correct code
   - Check that `asn_no: row.title` is used (not normalized)

2. **Check for middleware:**
   - Look for response transformers
   - Check for normalization middleware

3. **Check database connection:**
   - Verify backend is connecting to the same database
   - Check if there's a database view that normalizes ASN

### If mobile app still shows 5-digit format:

1. **Clear mobile app cache:**
   - Clear app data/cache
   - Restart mobile app

2. **Verify API response:**
   - Check what mobile app is actually receiving
   - Compare with backend API response

## 📝 Summary

The backend code is **ready and correct** - it preserves the original 4-digit format from the database. After deployment:

1. Backend will return 4-digit format (ASN-0001)
2. Mobile app will receive 4-digit format
3. Mobile app will display 4-digit format
4. All three (database, desktop, mobile) will match

---

**Status:** ✅ Ready for deployment  
**Files:** `wms-api/src/modules/master/masterController.js` and `wms-api/src/routes/masterRoutes.js`  
**Action:** Copy files to backend and restart server

