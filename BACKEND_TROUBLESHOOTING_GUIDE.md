# Backend ASN API - Troubleshooting Guide

## 🔍 Issue: Mobile Still Shows 5-Digit Format After Backend Restart

**Mobile shows:** ASN-00005, ASN-00001 (5-digit) ❌  
**Database has:** ASN-0001, ASN-0002 (4-digit) ✅  
**Expected:** ASN-0001, ASN-0002 (4-digit) ✅

## 🔧 Troubleshooting Steps

### Step 1: Verify Backend Code is Actually Deployed

**Check if the actual backend server is using the updated files:**

1. **Find your actual backend server location:**
   - The files in `wms-api/src/` in this workspace might be reference files
   - Your actual backend server might be in a different location
   - Check where your backend server is actually running from

2. **Verify the controller file in your actual backend:**
   ```bash
   # Navigate to your actual backend directory
   cd "D:\Development Project\Printechs WMS\wms-api"
   # or wherever your backend actually is
   
   # Check the file
   cat src/modules/master/masterController.js | grep "asn_no:"
   ```
   
   Should show: `asn_no: row.title,  // ✅ Return original format (no normalization)`

### Step 2: Test Backend API Directly

**Test what the backend is actually returning:**

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0].asn_no'
```

**Expected:** `"ASN-0001"` (4-digit format) ✅  
**If returns:** `"ASN-00001"` (5-digit) → Backend is still normalizing ❌

### Step 3: Check for Normalization in Backend

**Search for normalization functions in your actual backend:**

```bash
# In your actual backend directory
grep -r "normalizeAsnNumber" src/
grep -r "LPAD.*ASN\|CONCAT.*ASN" src/
```

**If found, remove or comment out the normalization code.**

### Step 4: Check Route Registration

**Verify the route is registered in your main app file:**

1. **Find your main app file** (usually `src/app.js`, `src/server.js`, or `src/index.js`)
2. **Check if routes are imported:**
   ```javascript
   import routes from './routes/index.js';
   app.use('/', routes);
   ```
3. **Or check if route is registered inline:**
   ```javascript
   import { getAllAsns } from './modules/master/masterController.js';
   router.get('/api/master/asns', authenticateToken, getAllAsns);
   ```

### Step 5: Check for Response Middleware

**Check if there's any response transformation middleware:**

```bash
# Search for response transformers
grep -r "response.*transform\|normalize.*response" src/
```

### Step 6: Verify Database Connection

**Check if backend is connecting to the correct database:**

```sql
-- Run this in your database
SELECT title FROM tabAdvanceShippingNotice LIMIT 5;
```

**Should show:** ASN-0001, ASN-0002, ASN-0003, ASN-0004, ASN-0005 (4-digit)

## 🚨 Common Issues

### Issue 1: Backend Code Not Deployed
- **Symptom:** Files exist in workspace but not in actual backend
- **Fix:** Copy files from `wms-api/src/` to your actual backend server location

### Issue 2: Route Not Registered
- **Symptom:** API returns 404 or old response
- **Fix:** Register route in main app file

### Issue 3: Normalization Still Happening
- **Symptom:** API returns 5-digit format
- **Fix:** Remove `normalizeAsnNumber()` calls or SQL normalization

### Issue 4: Cached Response
- **Symptom:** Mobile app shows old format
- **Fix:** Clear mobile app cache, restart mobile app

### Issue 5: Wrong Endpoint Called
- **Symptom:** Mobile calls different endpoint
- **Fix:** Verify mobile app is calling `GET /api/master/asns`

## ✅ Quick Fix Checklist

- [ ] Backend code copied to actual server location
- [ ] Route registered in main app file
- [ ] No normalization functions found
- [ ] Backend server restarted
- [ ] API tested and returns 4-digit format
- [ ] Mobile app cache cleared
- [ ] Mobile app restarted

## 📝 Next Steps

1. **Test backend API directly** to see what it's returning
2. **Check backend logs** for any errors
3. **Verify route is registered** in main app file
4. **Check for normalization** in backend code
5. **Clear mobile app cache** and restart

---

**Priority:** High - Need to verify actual backend response

