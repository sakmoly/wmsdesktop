# Backend Still Showing 5-Digit Format - Fix Guide

## 🚨 Current Issue

**Mobile app shows:** ASN-00005, ASN-00001 (5-digit) ❌  
**Database has:** ASN-0001, ASN-0002 (4-digit) ✅  
**Backend should return:** ASN-0001, ASN-0002 (4-digit) ✅

**After restart, mobile still shows 5-digit** → Backend is still normalizing or not using updated code

## ✅ Files Ready in Workspace

All correct files are in `wms-api/src/`:
- ✅ `wms-api/src/modules/master/masterController.js` - Preserves 4-digit format
- ✅ `wms-api/src/routes/masterRoutes.js` - Route registered
- ✅ `wms-api/src/routes/index.js` - Main routes file

## 🔍 Most Likely Causes

### 1. Backend Server Running from Different Location ⚠️ **MOST LIKELY**

**Problem:** Files in `wms-api/src/` are reference files. Your actual backend server is running from a different location.

**Solution:**
1. Find where your backend server is actually running from
   - Check your backend startup command
   - Check backend server logs
   - Check process manager (pm2, systemd, etc.)
2. Copy files from workspace to actual backend location:
   ```
   From: D:\Development Project\Printechs WMS\Wms.Desktop\wms-api\src\
   To:   [your-actual-backend-path]\src\
   ```
3. Restart backend server

### 2. Route Not Registered in Main App File

**Problem:** The route might not be registered in your main app file.

**Check:** Find your main app file (`src/app.js`, `src/server.js`, or `src/index.js`) and verify:

```javascript
import routes from './routes/index.js';
// ... existing code ...
app.use('/', routes);  // or app.use('/api', routes);
```

**If missing, add it.**

### 3. Normalization Still in Code

**Problem:** There might be normalization code elsewhere in your backend.

**Check:** Search your actual backend directory for:
```bash
grep -r "normalizeAsnNumber" src/
grep -r "LPAD.*ASN\|CONCAT.*ASN" src/
```

**If found, remove the normalization code.**

### 4. Wrong Endpoint Being Called

**Problem:** Mobile app might be calling a different endpoint.

**Check:** Verify mobile app is calling:
- ✅ `GET /api/master/asns` (correct)
- ❌ `GET /api/asns` (wrong)
- ❌ `GET /api/master/asn` (wrong)

### 5. Response Transformation Middleware

**Problem:** There might be middleware transforming the response.

**Check:** Search for response transformation:
```bash
grep -r "response.*transform\|normalize.*response" src/
```

## 🔧 Immediate Actions

### Step 1: Test Backend API Directly

**Test what your backend is actually returning:**

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0].asn_no'
```

**Expected:** `"ASN-0001"` (4-digit) ✅  
**If returns:** `"ASN-00001"` (5-digit) → Backend is still normalizing ❌

### Step 2: Check Backend Logs

Check your backend server logs for:
- Route registration messages
- Any errors
- Which endpoint is being called
- Database query results

### Step 3: Verify Files in Actual Backend

1. Navigate to your actual backend server directory
2. Check if `src/modules/master/masterController.js` exists
3. Open the file and verify line 84:
   ```javascript
   asn_no: row.title,  // ✅ Return original format (no normalization)
   ```
4. Check if `src/routes/index.js` has:
   ```javascript
   router.use('/api/master', masterRoutes);
   ```

### Step 4: Check Main App File

Find your main app file and verify routes are imported:
```javascript
import routes from './routes/index.js';
app.use('/', routes);
```

## 📋 Quick Checklist

- [ ] **Backend API tested** - What format does it return?
- [ ] **Actual backend location found** - Where is server running from?
- [ ] **Files copied to actual backend** - Copied from workspace?
- [ ] **Route registered in main app** - Check main app file
- [ ] **No normalization code** - Search and remove
- [ ] **Backend server restarted** - After changes
- [ ] **Mobile app cache cleared** - Clear cache
- [ ] **Mobile app restarted** - Restart app

## 🎯 Next Steps

1. **Test backend API** - See what it's actually returning
2. **Find actual backend location** - Where is server running from?
3. **Copy files to actual backend** - Copy from workspace
4. **Verify route registration** - Check main app file
5. **Remove normalization** - Search and remove any normalization
6. **Restart server** - Restart after changes
7. **Test again** - Verify API returns 4-digit format

## 💡 Quick Test

**Before making changes, test the API:**

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0]'
```

**If it returns 5-digit format, the backend is still normalizing.**
**If it returns 4-digit format, the backend is correct (check mobile app cache).**

---

**Priority:** High - Need to verify actual backend response and location  
**Action:** Test backend API first, then find actual backend location

