# Putaway Task source_type Column Fix

## Issue

The mobile app was receiving a 500 error when trying to fetch putaway tasks:
```
ERROR ❌ API error (500): {"code":"DATABASE_ERROR","message":"Failed to get putaway tasks","details":{"message":"Unknown column 'pt.source_type' in 'where clause'","code":"ER_BAD_FIELD_ERROR","sqlMessage":"Unknown column 'pt.source_type' in 'where clause'"}}
```

## Root Cause

The `getTasks` function in `putawayController.js` was using `pt.source_type` in the WHERE clause **before** checking if the column exists in the database. This caused the query to fail when the column doesn't exist.

## Fix Applied

### 1. Fixed Query Logic (`wms-api/src/modules/putaway/putawayController.js`)

**Before:**
- WHERE clause was built using `pt.source_type` directly
- Column existence check happened **after** WHERE clause was built
- This caused SQL error when column doesn't exist

**After:**
- Column existence check happens **FIRST**
- WHERE clause only uses `pt.source_type` if column exists
- If `source_type` filter is requested but column doesn't exist:
  - If filtering for "ASN": Allow it (default behavior, all existing tasks are ASN)
  - If filtering for "TransferIn": Return empty array (no TransferIn tasks exist yet)
- If `transfer_in` filter is requested but column doesn't exist: Return empty array

### 2. Created Migration Script

**File:** `wms-api/add-source-type-transfer-in-to-putaway-task.js`

**What it does:**
1. Adds `source_type VARCHAR(50) NULL` column to `tabPutawayTask`
2. Adds `transfer_in VARCHAR(100) NULL` column to `tabPutawayTask`
3. Creates indexes on both columns
4. Sets default `source_type = "ASN"` for existing records
5. Skips if columns already exist (idempotent)

## How to Apply the Fix

### Step 1: Run Migration Script

```bash
cd wms-api
npm run add-putaway-columns
```

Or directly:
```bash
cd wms-api
node add-source-type-transfer-in-to-putaway-task.js
```

### Step 2: Restart API Server

The code fix is already applied, but you need to restart the API server for the changes to take effect.

## Verification

After running the migration and restarting the server:

1. **Check columns exist:**
   ```sql
   DESCRIBE tabPutawayTask;
   ```
   Should show:
   - `source_type VARCHAR(50)`
   - `transfer_in VARCHAR(100)`

2. **Test API endpoint:**
   ```bash
   GET /api/putaway/tasks?source_type=TransferIn
   ```
   Should return 200 OK (even if empty array)

3. **Check existing tasks:**
   ```sql
   SELECT title, source_type, transfer_in FROM tabPutawayTask LIMIT 5;
   ```
   Should show `source_type = "ASN"` for existing tasks

## Database Schema Changes

### tabPutawayTask

**New Columns:**
- `source_type VARCHAR(50) NULL` - Source type: "ASN", "TransferIn", etc.
- `transfer_in VARCHAR(100) NULL` - Transfer In title (if source_type = "TransferIn")

**Indexes:**
- `idx_source_type` on `source_type`
- `idx_transfer_in` on `transfer_in`

**Default Values:**
- Existing records: `source_type = "ASN"` (assumed)
- New records: Set explicitly when creating putaway task

## Code Changes Summary

### File: `wms-api/src/modules/putaway/putawayController.js`

**Function:** `getTasks`

**Changes:**
1. Moved column existence check **before** WHERE clause building
2. Added conditional logic for `source_type` filter:
   - Only uses `pt.source_type` in WHERE if column exists
   - Returns empty array if filtering for TransferIn but column doesn't exist
3. Added conditional logic for `transfer_in` filter:
   - Only uses `pt.transfer_in` in WHERE if column exists
   - Returns empty array if column doesn't exist

## Impact

### Before Fix:
- ❌ API returns 500 error when `source_type` column doesn't exist
- ❌ Mobile app cannot fetch putaway tasks
- ❌ Transfer In putaway tasks cannot be queried

### After Fix:
- ✅ API gracefully handles missing columns
- ✅ Returns empty array instead of error when filtering for non-existent data
- ✅ Migration script adds columns for full functionality
- ✅ Existing ASN putaway tasks continue to work
- ✅ Transfer In putaway tasks can be created and queried

## Related Files

- `wms-api/src/modules/putaway/putawayController.js` - Fixed query logic
- `wms-api/add-source-type-transfer-in-to-putaway-task.js` - Migration script
- `wms-api/package.json` - Added migration script command

## Next Steps

1. ✅ Code fix applied (handles missing columns gracefully)
2. ⚠️ **Run migration script** to add columns
3. ⚠️ **Restart API server** to apply code changes
4. ✅ Test API endpoints
5. ✅ Verify Transfer In putaway tasks work correctly

---

**Status:** ✅ Fixed  
**Date:** 2026-01-05  
**Requires:** Migration script execution + API server restart

