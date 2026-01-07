# API Duplicate Fix - Applied

## Issue
Mobile app creates **1 session**, but desktop shows **2 sessions** (duplicates).

## Root Cause Analysis

The issue is likely in the **Backend API Database** - it may have duplicate sessions from previous mobile app syncs.

## Fixes Applied

### 1. API Endpoint - Added DISTINCT ✅
**File:** `wms-api/src/modules/inbound/inboundController.js`

**Before:**
```sql
SELECT inbound_session, asn_no, ...
FROM tabInboundSession
```

**After:**
```sql
SELECT DISTINCT inbound_session, asn_no, ...
FROM tabInboundSession
```

This ensures the API never returns duplicate rows.

### 2. Sync Service - Added Duplicate Detection ✅
**File:** `Services/InboundSessionSyncService.cs`

**Added:**
- `HashSet` to track processed sessions
- Skips duplicates if API response has them
- Logs when duplicates are skipped

### 3. Multiple Layers of Protection ✅
- **API Level:** `DISTINCT` in query
- **Sync Level:** `HashSet` to track processed sessions
- **Database Level:** `ON DUPLICATE KEY UPDATE` (if `inbound_session` is PRIMARY KEY)
- **ViewModel Level:** `HashSet` to track added sessions

## Next Steps

### Step 1: Restart Backend API
The API changes require a server restart:
```bash
cd "D:\Development Project\Printechs WMS\wms-api"
# Stop current server (Ctrl+C)
npm start
```

### Step 2: Check Backend Database for Duplicates
```sql
-- Check if backend database has duplicates
SELECT inbound_session, COUNT(*) as count
FROM tabInboundSession
GROUP BY inbound_session
HAVING count > 1;
```

**If duplicates exist, clean them up:**
```sql
-- Keep only the latest session for each inbound_session
DELETE t1 FROM tabInboundSession t1
INNER JOIN tabInboundSession t2 
WHERE t1.inbound_session = t2.inbound_session 
  AND t1.started_at < t2.started_at;
```

### Step 3: Test Desktop App
1. **Restart desktop app** (to pick up sync service changes)
2. **Open Inbound Sessions screen**
3. **Check logs** for:
   - `InboundSessionApiService: Fetched X sessions from API`
   - `InboundSessionSyncService: Skipping duplicate session in API response: ...`
   - `InboundSessionListViewModel: Added X sessions to collection`

## Expected Result

After fixes:
- ✅ **API returns only unique sessions** (DISTINCT)
- ✅ **Sync skips duplicates** if API somehow returns them
- ✅ **Desktop shows correct count** matching backend database

## Summary

**Problem:** Backend API database likely has duplicates  
**Solution:** 
1. Added DISTINCT to API query ✅
2. Added duplicate detection in sync service ✅
3. Need to clean up backend database duplicates (if any)

**Action Required:** Restart backend API server to apply DISTINCT fix

