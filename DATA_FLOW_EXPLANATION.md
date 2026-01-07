# Data Flow Explanation - Where Inbound Sessions Come From

## Complete Data Flow

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ Mobile App  │ ──────> │ Backend API  │ <────── │ Desktop App  │ ──────> │ Local DB     │
│             │  POST   │              │  GET    │              │  INSERT │              │
│ Creates     │ /update │ Stores in    │ /sessions│ Fetches &    │         │ Stores       │
│ Sessions    │         │ Backend DB   │         │ Syncs        │         │ Sessions     │
└─────────────┘         └──────────────┘         └──────────────┘         └──────────────┘
                                                          │
                                                          │
                                                          ▼
                                                   ┌──────────────┐
                                                   │ Desktop UI   │
                                                   │              │
                                                   │ Displays     │
                                                   │ Sessions     │
                                                   └──────────────┘
```

## Step-by-Step Process

### Step 1: Mobile App Syncs Session
**When:** User starts a session on mobile app  
**Action:** Mobile app calls `POST /api/inbound/update`  
**Result:** Session stored in **Backend API Database**

### Step 2: Desktop App Opens Inbound Sessions Screen
**When:** User opens "Inbound Sessions" screen in desktop app  
**Action:** `InboundSessionListViewModel.LoadDataAsync()` is called

### Step 3: Desktop App Syncs from Backend API
**Code:** `InboundSessionSyncService.SyncSessionsFromApiAsync()`
- Calls `GET /api/inbound/sessions` from backend API
- Fetches all sessions from **Backend API Database**
- Syncs them to **Local Desktop Database** using `INSERT ... ON DUPLICATE KEY UPDATE`

### Step 4: Desktop App Loads from Local Database
**Code:** `InboundSessionDataService.GetInboundSessionsAsync()`
- Reads sessions from **Local Desktop Database**
- Returns list to ViewModel

### Step 5: Desktop App Displays in UI
**Code:** `InboundSessionListViewModel`
- Adds sessions to `Sessions` collection
- UI binds to collection and displays

## Where Data Actually Comes From

### Primary Source: **Backend API Database**
- Mobile app syncs sessions here
- Desktop app fetches from here
- This is the "source of truth"

### Secondary Source: **Local Desktop Database**
- Desktop app stores a copy here for offline access
- Desktop app reads from here to display
- This is a "cache" of backend data

## Why You See 4 Sessions

The sessions you see come from:

1. **Backend API Database** (via `GET /api/inbound/sessions`)
   - Mobile app synced these sessions
   - Backend API stores them

2. **Local Desktop Database** (via `SELECT FROM tabInboundSession`)
   - Desktop app synced them from backend
   - Desktop app displays them

## About the Duplicates

If you see duplicates like:
- `SESSION-1766569992504` (appears twice)
- `SESSION-ASN0002-DEVI` and `SESSION-ASN0002-DEVIC`

This could be because:

1. **Backend database has duplicates** - Mobile app created them before duplicate prevention
2. **Sync created duplicates** - The `ON DUPLICATE KEY UPDATE` might not be working if session IDs are slightly different
3. **Database had old data** - Sessions existed before the fix

## How to Verify Data Source

### Check Backend Database:
```sql
SELECT inbound_session, asn_no, status, started_at 
FROM tabInboundSession 
ORDER BY started_at DESC;
```

### Check Local Desktop Database:
```sql
SELECT inbound_session, asn_no, status, started_at 
FROM tabInboundSession 
ORDER BY started_at DESC;
```

Both should match (after sync).

## Summary

**Data Source:** Backend API Database (synced by mobile app)  
**Display Source:** Local Desktop Database (synced from backend)  
**Flow:** Mobile → Backend API → Desktop Sync → Local DB → UI Display

The desktop app is now showing real data from the backend API! 🎉

