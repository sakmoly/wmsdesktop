# Real-Time Session Sync Implementation

## ✅ What Was Implemented

### 1. API Service (`InboundSessionApiService.cs`)
- Fetches sessions from backend API
- Handles connection failures gracefully
- Returns `null` if API is not available (keeps existing data)

### 2. Sync Service (`InboundSessionSyncService.cs`)
- Syncs API sessions to local database
- Uses `INSERT ... ON DUPLICATE KEY UPDATE` to prevent duplicates
- Only updates if API connection is available
- Keeps existing data if API is unavailable

### 3. Updated ViewModel (`InboundSessionListViewModel.cs`)
- **Step 1:** Attempts to sync from API (real-time)
- **Step 2:** Loads sessions from database (includes synced or existing data)
- If API is not available, uses existing database data

## 🔧 API Endpoint Required

**IMPORTANT:** Your backend API needs a GET endpoint to fetch all sessions:

```
GET /api/inbound/sessions
```

**Response Format:**
```json
[
  {
    "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
    "asn_no": "ASN-0002",
    "status": "Active",
    "completed_cartons": 0,
    "total_cartons": 2,
    "transfer_order": null,
    "dock": "DOCK-01",
    "started_by": "USER-172188",
    "device_id": "DEVICE-001",
    "started_at": "2025-12-24T12:16:08Z",
    "ended_at": null,
    "completed_on": null
  }
]
```

**Or if wrapped:**
```json
{
  "sessions": [...],
  "data": [...]
}
```

## 📝 If API Endpoint Doesn't Exist

You need to create this endpoint in your backend API:

### Backend Implementation (Node.js/Express)

```javascript
// wms-api/src/routes/index.js
router.get('/api/inbound/sessions', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [sessions] = await connection.query(`
      SELECT 
        inbound_session,
        asn_no,
        status,
        completed_cartons,
        total_cartons,
        transfer_order,
        dock,
        started_by,
        device_id,
        started_at,
        ended_at,
        completed_on
      FROM tabInboundSession
      ORDER BY started_at DESC
    `);
    
    connection.release();
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});
```

## 🔄 How It Works

1. **User opens Inbound Sessions screen**
2. **ViewModel calls `LoadDataAsync()`**
3. **Step 1:** Tries to sync from API
   - If API available → Fetches latest sessions → Updates database
   - If API not available → Skips sync, keeps existing data
4. **Step 2:** Loads sessions from database
   - Shows synced sessions (if API was available)
   - Or shows existing sessions (if API was not available)

## ✅ Benefits

- ✅ **Real-time updates** when API is available
- ✅ **Offline support** - keeps existing data if API unavailable
- ✅ **No data loss** - never clears data on connection failure
- ✅ **Automatic sync** - happens every time screen loads
- ✅ **Duplicate prevention** - uses `ON DUPLICATE KEY UPDATE`

## 🧪 Testing

1. **With API available:**
   - Sessions should sync from API
   - Database should be updated
   - Screen should show latest sessions

2. **Without API (offline):**
   - Should log "API sync not available"
   - Should show existing database sessions
   - Should not clear or lose data

## 📋 Next Steps

1. **Create the GET endpoint** in your backend API (if it doesn't exist)
2. **Update the API URL** in `InboundSessionApiService.cs` if your endpoint is different
3. **Test the sync** by checking logs and database
4. **Verify** that sessions appear in desktop app after sync

