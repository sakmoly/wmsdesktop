# Duplicate Session Investigation

## Issue
Mobile app creates **1 session**, but desktop shows **2 sessions** (duplicates).

## Possible Causes

### 1. Backend API Database Has Duplicates
The backend API database might already have duplicate sessions from previous mobile app syncs.

**Check:**
```sql
-- Check backend API database
SELECT inbound_session, COUNT(*) as count
FROM tabInboundSession
GROUP BY inbound_session
HAVING count > 1;
```

### 2. API Returns Duplicates
The `GET /api/inbound/sessions` endpoint might be returning duplicate rows.

**Fix Applied:** Added `DISTINCT` to API query ✅

### 3. Sync Creates Duplicates
The desktop sync might be inserting duplicates if `ON DUPLICATE KEY UPDATE` isn't working.

**Check:** Verify `inbound_session` is PRIMARY KEY in desktop database:
```sql
SHOW CREATE TABLE tabInboundSession;
```

**Expected:**
```sql
PRIMARY KEY (`inbound_session`)
```

## Fixes Applied

### 1. API Endpoint - Added DISTINCT ✅
```sql
SELECT DISTINCT inbound_session, ...
FROM tabInboundSession
```

### 2. Sync Service - Already Uses ON DUPLICATE KEY UPDATE ✅
```sql
INSERT ... ON DUPLICATE KEY UPDATE ...
```

This should prevent duplicates IF `inbound_session` is PRIMARY KEY.

## Next Steps to Debug

### Step 1: Check Backend API Database
```sql
-- Connect to backend API database
SELECT inbound_session, asn_no, status, started_at
FROM tabInboundSession
ORDER BY started_at DESC;
```

**Expected:** Should show only 1 session (the one you created on mobile)

### Step 2: Check Desktop Database
```sql
-- Connect to desktop database
SELECT inbound_session, asn_no, status, started_at
FROM tabInboundSession
ORDER BY started_at DESC;
```

**Expected:** Should show only 1 session (synced from backend)

### Step 3: Check API Response
Test the API endpoint directly:
```bash
curl -X GET http://localhost:3000/api/inbound/sessions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Should return array with 1 session

### Step 4: Check Desktop Logs
Look for:
- `InboundSessionApiService: Fetched X sessions from API`
- `InboundSessionSyncService: Synced X sessions (Inserted: X, Updated: X)`
- `InboundSessionListViewModel: Added X sessions to collection`

## Most Likely Issue

**Backend API database has duplicates** from previous mobile app syncs before duplicate prevention was implemented.

**Solution:** Clean up duplicates in backend database:
```sql
-- Keep only the latest session for each inbound_session
DELETE t1 FROM tabInboundSession t1
INNER JOIN tabInboundSession t2 
WHERE t1.inbound_session = t2.inbound_session 
  AND t1.started_at < t2.started_at;
```

Or manually delete duplicates:
```sql
-- Check for duplicates
SELECT inbound_session, COUNT(*) as count
FROM tabInboundSession
GROUP BY inbound_session
HAVING count > 1;

-- Delete duplicates (keep the one with latest started_at)
DELETE FROM tabInboundSession
WHERE id NOT IN (
  SELECT id FROM (
    SELECT MAX(id) as id
    FROM tabInboundSession
    GROUP BY inbound_session
  ) AS temp
);
```

