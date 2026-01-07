# tabCartonStatus "In Receiving" → "Receiving" Fix Checklist

## ⚠️ Issue

The `tabCartonStatus` table is still being updated with `"In Receiving"` (with space) instead of `"Receiving"` (no space).

## 📋 Root Cause

The `POST /api/carton/lock` endpoint in `wms-api/src/modules/cartons/cartonController.js` is still using `"In Receiving"` in:
1. Status comparison check
2. INSERT statement
3. UPDATE statement (in ON DUPLICATE KEY UPDATE)

## ✅ Fix Required

### Step 1: Update Backend Code

**File:** `wms-api/src/modules/cartons/cartonController.js`  
**Function:** `lockCarton`

**Replace the entire `lockCarton` function with the fixed version from:**
- `BACKEND_TABCARTONSTATUS_COMPLETE_FIX.js`

**Or manually change these 3 lines:**

1. **Line ~38** (Status Check):
   ```javascript
   // BEFORE:
   if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'In Receiving') {
   
   // AFTER:
   if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'Receiving') {
   ```

2. **Line ~52** (INSERT Status):
   ```javascript
   // BEFORE:
   VALUES (?, ?, ?, 'In Receiving', ?, NOW(), NOW())
   
   // AFTER:
   VALUES (?, ?, ?, 'Receiving', ?, NOW(), NOW())
   ```

3. **Line ~54** (UPDATE Status):
   ```javascript
   // BEFORE:
   status = 'In Receiving',
   
   // AFTER:
   status = 'Receiving',
   ```

### Step 2: Verify completeCarton Function

Check the `completeCarton` function in the same file. It should set status to `'Received'`, but verify it doesn't have any `'In Receiving'` references.

### Step 3: Restart Backend Server

After making the changes:
```bash
# Stop the backend server
# Then restart it
npm start
# or
node server.js
```

### Step 4: Test the Fix

**Test Lock Carton:**
```bash
curl -X POST http://localhost:3000/api/carton/lock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-00002",
    "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
    "carton_id": "CTN-0101",
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
```

**Verify Database:**
```sql
SELECT carton_id, status, locked_by, locked_on
FROM tabCartonStatus
WHERE carton_id = 'CTN-0101' AND asn_no = 'ASN-00002';
```

**Expected Result:** `status` should be `'Receiving'` (NOT `'In Receiving'`)

### Step 5: (Optional) Migrate Existing Data

If you have existing records with `"In Receiving"` status, run the migration script:

```sql
-- Run this SQL script
UPDATE tabCartonStatus
SET status = 'Receiving',
    updated_on = NOW()
WHERE status = 'In Receiving';
```

Or use the provided script: `TABCARTONSTATUS_MIGRATION_SCRIPT.sql`

## 🔍 Verification Checklist

- [ ] Updated `lockCarton` function in `cartonController.js`
- [ ] Changed status check from `'In Receiving'` to `'Receiving'`
- [ ] Changed INSERT status value from `'In Receiving'` to `'Receiving'`
- [ ] Changed UPDATE status value from `'In Receiving'` to `'Receiving'`
- [ ] Verified `completeCarton` function (should be OK, but check)
- [ ] Restarted backend server
- [ ] Tested lock carton endpoint
- [ ] Verified database shows `'Receiving'` status
- [ ] (Optional) Ran migration script for existing data

## 📝 Quick Reference

**File to Edit:**
```
wms-api/src/modules/cartons/cartonController.js
```

**Function to Update:**
```javascript
export const lockCarton = asyncHandler(async (req, res) => {
  // ... code ...
  
  // CHANGE THIS:
  carton.status === 'In Receiving'
  // TO THIS:
  carton.status === 'Receiving'
  
  // CHANGE THIS:
  VALUES (?, ?, ?, 'In Receiving', ?, NOW(), NOW())
  // TO THIS:
  VALUES (?, ?, ?, 'Receiving', ?, NOW(), NOW())
  
  // CHANGE THIS:
  status = 'In Receiving',
  // TO THIS:
  status = 'Receiving',
  
  // ... rest of code ...
});
```

## 🎯 Summary

The fix is simple - just replace all 3 occurrences of `'In Receiving'` with `'Receiving'` in the `lockCarton` function. After restarting the backend server, the `tabCartonStatus` table will be updated with `'Receiving'` instead of `'In Receiving'`.

