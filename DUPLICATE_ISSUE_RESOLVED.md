# Duplicate Session Issue - RESOLVED ✅

## Root Cause (Mobile App)

The mobile app was calling **two endpoints** that both create sessions:

1. **`POST /api/inbound/start`** 
   - Creates session with backend-generated ID: `SESSION-1766569992504`
   - Status: `Draft`
   
2. **`POST /api/inbound/update`**
   - Creates/updates session with mobile-generated ID: `SESSION-ASN0002-DEVICE001-USER172188`
   - Status: `Active`

**Result:** Two sessions created for the same action ❌

## Solution Applied (Mobile App)

✅ **Removed** `apiService.startInbound()` call  
✅ **Using only** `POST /api/inbound/update`  
✅ **Consistent session ID format** (ASN-Device-User)

## Desktop App Status

The desktop app is **already configured correctly** to handle this:

### ✅ Real-Time Sync Working
- Fetches sessions from `GET /api/inbound/sessions`
- Syncs to local database
- Displays in UI

### ✅ Duplicate Prevention (Defensive Measures)
- **API Level:** `DISTINCT` in query (prevents duplicate rows)
- **Sync Level:** `HashSet` to track processed sessions
- **Database Level:** `ON DUPLICATE KEY UPDATE` (if `inbound_session` is PRIMARY KEY)
- **ViewModel Level:** `HashSet` to track added sessions

### ✅ No Changes Needed
The desktop app will now correctly show:
- **1 session** per mobile app action (after mobile fix)
- **Real-time updates** when mobile app syncs
- **No duplicates** even if API somehow returns them

## Cleanup Existing Duplicates

You can clean up existing duplicate sessions in the backend database:

### Option 1: Delete Draft Sessions
```sql
-- Delete sessions with backend-generated IDs (Draft status)
DELETE FROM tabInboundSession 
WHERE inbound_session LIKE 'SESSION-%' 
  AND inbound_session NOT LIKE 'SESSION-ASN%'
  AND status = 'Draft';
```

### Option 2: Keep Only Active Sessions
```sql
-- Keep only Active sessions, delete Draft duplicates
DELETE FROM tabInboundSession 
WHERE status = 'Draft'
  AND inbound_session IN (
    SELECT inbound_session FROM (
      SELECT inbound_session 
      FROM tabInboundSession 
      WHERE status = 'Active'
    ) AS active_sessions
  );
```

### Option 3: Manual Cleanup
```sql
-- Check for duplicates
SELECT inbound_session, asn_no, status, COUNT(*) as count
FROM tabInboundSession
GROUP BY inbound_session, asn_no, status
HAVING count > 1;

-- Delete specific duplicate (keep the Active one)
DELETE FROM tabInboundSession 
WHERE inbound_session = 'SESSION-1766569992504'
  AND status = 'Draft';
```

## Summary

✅ **Mobile App:** Fixed - now uses only `/api/inbound/update`  
✅ **Desktop App:** Ready - will show correct count after mobile fix  
✅ **Backend API:** Working - DISTINCT added as defensive measure  
✅ **Future Sessions:** No duplicates will be created  

**Everything is working correctly now!** 🎉

