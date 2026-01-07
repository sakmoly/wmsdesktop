# ⚠️ URGENT: Restart API Server to Fix Mobile App ASN Total

## Current Status
- ✅ **Code Updated:** API code is correct (uses dynamic SUM calculation)
- ❌ **Mobile App:** Still showing "Total Pcs: 100" (should be 1600)
- ❌ **API Server:** Running old code (needs restart)

## The Problem
The mobile app is calling `GET /api/master/asns` which returns `total_shipped_qty: 100` because the API server is still running the old code that reads from the database field instead of calculating dynamically.

## Solution: Restart API Server

### Step 1: Stop the Current API Server

**If running in terminal:**
- Press `Ctrl+C` to stop it

**If running as a service:**
- Stop the Node.js service
- Or kill the process

### Step 2: Restart the API Server

```bash
cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"
npm start
```

Or:
```bash
node src/server.js
```

### Step 3: Verify the Fix

**Option A: Test via Postman**
```
GET http://localhost:3000/api/master/asns
Authorization: Bearer <your_token>
```

Look for ASN-12225:
- **Before restart:** `"total_shipped_qty": 100` ❌
- **After restart:** `"total_shipped_qty": 1600` ✅

**Option B: Check Mobile App**
1. Pull down to refresh the ASN list
2. ASN-12225 should now show "Total Pcs: 1600" ✅

## What Changed in the Code

**File:** `wms-api/src/modules/master/masterController.js`

**Before (Old Code):**
```sql
SELECT a.total_shipped_qty, ...  -- ❌ Reads stale database field
FROM tabAdvanceShippingNotice a
```

**After (New Code):**
```sql
SELECT COALESCE(SUM(d.shipped_qty), 0) as total_shipped_qty, ...  -- ✅ Calculates dynamically
FROM tabAdvanceShippingNotice a
LEFT JOIN tabAsnItemDetails d ON a.title = d.parent_title
GROUP BY ...
```

## Expected Result

After restarting the API server:
- ✅ Desktop app: Shows 1600 (already working)
- ✅ Mobile app: Shows "Total Pcs: 1600" (will work after restart)
- ✅ API endpoint: Returns `"total_shipped_qty": 1600`

## Quick Test Script

After restarting, you can test with:

```bash
cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"
node test-asn-total.mjs
```

(Note: You may need to add authentication token to the script)

## Summary

**The code is correct - just restart the API server!**

1. Stop API server
2. Start API server: `npm start`
3. Refresh mobile app
4. Verify: ASN-12225 should show "Total Pcs: 1600" ✅

