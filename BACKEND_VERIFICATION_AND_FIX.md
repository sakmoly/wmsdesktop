# Backend ASN API - Verification and Fix

## 🔍 Current Issue

**Mobile app still shows:** ASN-00005, ASN-00001 (5-digit) ❌  
**Database has:** ASN-0001, ASN-0002 (4-digit) ✅  
**Backend should return:** ASN-0001, ASN-0002 (4-digit) ✅

## ✅ Files Ready in Workspace

All files are ready in `wms-api/src/`:
- ✅ `wms-api/src/modules/master/masterController.js` - Preserves 4-digit format
- ✅ `wms-api/src/routes/masterRoutes.js` - Route registered
- ✅ `wms-api/src/routes/index.js` - Main routes file

## 🚨 Important: Check Actual Backend Location

The files in `wms-api/src/` in this workspace might be **reference files**. Your actual backend server might be running from a **different location**.

### Step 1: Find Your Actual Backend Server

Check where your backend server is actually running from:
- Is it in `D:\Development Project\Printechs WMS\wms-api\`?
- Or in a different location?
- Check your backend server startup command/logs

### Step 2: Copy Files to Actual Backend

If your actual backend is in a different location, copy the files:

```
From: D:\Development Project\Printechs WMS\Wms.Desktop\wms-api\src\modules\master\masterController.js
To:   [your-actual-backend-path]\src\modules\master\masterController.js

From: D:\Development Project\Printechs WMS\Wms.Desktop\wms-api\src\routes\masterRoutes.js
To:   [your-actual-backend-path]\src\routes\masterRoutes.js

From: D:\Development Project\Printechs WMS\Wms.Desktop\wms-api\src\routes\index.js
To:   [your-actual-backend-path]\src\routes\index.js
```

### Step 3: Verify Route is Registered

In your actual backend's main app file (usually `src/app.js` or `src/server.js`), ensure routes are imported:

```javascript
import routes from './routes/index.js';

// ... existing code ...

app.use('/', routes);  // or app.use('/api', routes);
```

### Step 4: Test Backend API

Test what your backend is actually returning:

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0].asn_no'
```

**Expected:** `"ASN-0001"` (4-digit) ✅  
**If returns:** `"ASN-00001"` (5-digit) → Backend still normalizing ❌

### Step 5: Check for Normalization

In your actual backend directory, search for normalization:

```bash
# Search for normalizeAsnNumber
grep -r "normalizeAsnNumber" src/

# Search for SQL normalization
grep -r "LPAD.*ASN\|CONCAT.*ASN" src/
```

**If found, remove the normalization code.**

## 🔧 Quick Fix

If the backend is still returning 5-digit format, the most likely issues are:

1. **Files not copied to actual backend location** → Copy files now
2. **Route not registered in main app** → Register route
3. **Normalization still in code** → Remove normalization
4. **Wrong endpoint being called** → Verify mobile calls correct endpoint

## 📋 Action Items

1. ✅ **Find actual backend location** - Where is your backend server running from?
2. ✅ **Copy files to actual backend** - Copy from workspace to actual backend
3. ✅ **Register route in main app** - Ensure routes are imported
4. ✅ **Remove normalization** - Check for and remove any normalization code
5. ✅ **Restart backend server** - Restart after changes
6. ✅ **Test API** - Verify it returns 4-digit format
7. ✅ **Clear mobile cache** - Clear mobile app cache and restart

## 🎯 Expected Result

After fix:
- ✅ **Backend API:** Returns `"asn_no": "ASN-0001"` (4-digit)
- ✅ **Mobile App:** Shows `ASN-0001` (4-digit)
- ✅ **Desktop App:** Shows `ASN-0001` (4-digit) ✅ Already correct
- ✅ **All Match:** Database, Desktop, Mobile all show 4-digit format

---

**Status:** Files ready in workspace - need to copy to actual backend location  
**Action:** Find actual backend location and copy files there

