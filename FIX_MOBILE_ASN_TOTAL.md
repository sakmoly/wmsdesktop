# Fix: Mobile App ASN Total Still Showing 100

## Issue
The mobile app is still showing `100` for ASN-12225's total shipped quantity instead of the correct `1600`.

## Root Cause
The API server hasn't been restarted to pick up the code changes. The mobile app calls `GET /api/master/asns`, which has been updated to calculate totals dynamically, but the running server is still using the old code.

## Solution
**Restart the API server** to load the updated code.

## Steps to Fix

### 1. Stop the Current API Server
If the API server is running in a terminal:
- Press `Ctrl+C` to stop it

If it's running as a service or in the background:
- Find the process and stop it
- Or restart the service

### 2. Restart the API Server

```bash
cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"
npm start
```

Or if using node directly:
```bash
node src/server.js
```

### 3. Verify the Fix

After restarting, test the API endpoint:

**Option A: Using the test script**
```bash
cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"
node test-asn-total.mjs
```

**Option B: Using Postman**
```
GET http://localhost:3000/api/master/asns
Authorization: Bearer <your_token>
```

Look for ASN-12225 in the response:
- **Before restart:** `"total_shipped_qty": 100` ❌
- **After restart:** `"total_shipped_qty": 1600` ✅

**Option C: Check mobile app**
- Refresh the ASN list in the mobile app
- ASN-12225 should now show `1600` instead of `100`

## What Was Changed

### API Endpoint: `GET /api/master/asns`
**File:** `wms-api/src/modules/master/masterController.js`

**Before:**
```sql
SELECT ..., a.total_shipped_qty, ...
FROM tabAdvanceShippingNotice a
```

**After:**
```sql
SELECT ..., 
       COALESCE(SUM(d.shipped_qty), 0) as total_shipped_qty,  -- ✅ Calculated dynamically
       ...
FROM tabAdvanceShippingNotice a
LEFT JOIN tabAsnItemDetails d ON a.title = d.parent_title
GROUP BY ...  -- (total_shipped_qty removed from GROUP BY)
```

## Expected Result

For ASN-12225 with items:
- AT-301-BLU-OS: 100.00
- AT-301-GRN-OS: 500.00
- AT-301-RED-OS: 500.00
- AT-301-RED-OS: 500.00

**Total:** 1600.00 ✅

## Notes

- The mobile app doesn't need any code changes - it automatically uses the updated API response
- The desktop app was already fixed and should show correct totals
- Both desktop and mobile now use the same calculation logic (dynamic from item details)

## Troubleshooting

If the mobile app still shows 100 after restarting:

1. **Clear mobile app cache** (if applicable)
2. **Force refresh** the ASN list in the mobile app
3. **Verify API response** using Postman or the test script
4. **Check API logs** for any errors
5. **Ensure the API server is running the latest code** - check the file modification date

