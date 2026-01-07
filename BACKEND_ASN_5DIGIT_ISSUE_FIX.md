# Backend ASN 5-Digit Issue - Fix Required

## 🚨 Problem Identified

**Backend API returns:** `"ASN-00004"` (5-digit) ❌  
**Database has:** `"ASN-0004"` (4-digit) ✅  
**Desktop shows:** `"ASN-0004"` (4-digit) ✅

**Root Cause:** The backend server is normalizing ASN numbers to 5-digit format, even though the database stores 4-digit format.

## ✅ Solution

The code in the workspace (`wms-api/src/modules/master/masterController.js`) is **correct** - it preserves the original format. However, the **actual backend server is not using this code** or there's normalization happening elsewhere.

## 🔧 Fix Steps

### Step 1: Verify Actual Backend Location

The files in `wms-api/src/` in this workspace might be reference files. Your actual backend server might be running from a **different location**.

**Find your actual backend server:**
1. Check where your backend server process is running from
2. Check backend startup command/logs
3. Check process manager (pm2, systemd, etc.)

### Step 2: Check Actual Backend Code

Navigate to your **actual backend server directory** and check:

```bash
# In your actual backend directory
cat src/modules/master/masterController.js | grep -A 3 "asn_no:"
```

**Should show:**
```javascript
asn_no: row.title,  // ✅ Return original format (no normalization)
```

**If it shows something else (like normalization), that's the problem!**

### Step 3: Search for Normalization

In your **actual backend directory**, search for normalization:

```bash
# Search for normalization functions
grep -r "normalizeAsnNumber" src/
grep -r "LPAD.*ASN\|CONCAT.*ASN" src/
grep -r "formatAsn\|padAsn" src/
```

**If found, remove or comment out the normalization code.**

### Step 4: Update Actual Backend Code

**Copy the correct code from workspace to actual backend:**

**From workspace:**
```
D:\Development Project\Printechs WMS\Wms.Desktop\wms-api\src\modules\master\masterController.js
```

**To your actual backend:**
```
[your-actual-backend-path]\src\modules\master\masterController.js
```

**Key line to verify (line 84):**
```javascript
asn_no: row.title,  // ✅ Return original format (no normalization)
```

**NOT:**
```javascript
asn_no: normalizeAsnNumber(row.title),  // ❌ Don't do this
// or
asn_no: formatAsnTo5Digit(row.title),  // ❌ Don't do this
```

### Step 5: Check Response Wrapper

Check if there's a response wrapper/middleware that normalizes ASN:

```bash
# Search for response transformation
grep -r "response.*transform\|normalize.*response" src/
grep -r "asn_no.*normalize\|normalize.*asn" src/
```

### Step 6: Restart Backend Server

After updating the code:
```bash
# Stop the backend server
# Then restart
npm start
# or
node server.js
# or
pm2 restart wms-api
```

### Step 7: Test Again

Test the API again in Postman:
```bash
GET http://localhost:3000/api/master/asns
Authorization: Bearer {your_token}
```

**Expected:** `"asn_no": "ASN-0004"` (4-digit) ✅  
**If still:** `"asn_no": "ASN-00004"` (5-digit) → Check Step 2-5 again

## 🔍 Most Likely Issues

### Issue 1: Backend Server Using Different Files ⚠️ **MOST LIKELY**

**Problem:** Files in workspace are reference files. Actual backend is in different location.

**Solution:** Find actual backend location and copy correct files there.

### Issue 2: Normalization Function Still Present

**Problem:** Backend code has `normalizeAsnNumber()` or similar function.

**Solution:** Remove normalization function calls.

### Issue 3: SQL Query Normalizing

**Problem:** SQL query uses `LPAD()` or `CONCAT()` to format ASN.

**Solution:** Use `a.title` directly without formatting.

### Issue 4: Response Middleware Normalizing

**Problem:** Middleware transforms response before sending.

**Solution:** Remove or fix response transformation middleware.

## 📋 Quick Checklist

- [ ] Found actual backend server location
- [ ] Checked actual backend code (not workspace files)
- [ ] Verified `asn_no: row.title` (no normalization)
- [ ] Searched for normalization functions (none found)
- [ ] Copied correct code to actual backend
- [ ] Restarted backend server
- [ ] Tested API - returns 4-digit format

## ✅ Expected Result

After fix:
- ✅ **Database:** `ASN-0004` (4-digit)
- ✅ **Backend API:** Returns `"ASN-0004"` (4-digit)
- ✅ **Desktop:** Shows `ASN-0004` (4-digit)
- ✅ **Mobile:** Should show `ASN-0004` (4-digit)

---

**Priority:** High - Backend is normalizing when it shouldn't  
**Action:** Find actual backend location and update the code there

