# Unload Lines & Receive Lines Fix - Complete ✅

## ✅ Problem Fixed

**Issue:** Unload Lines and Receive Lines were empty in the desktop application's Inbound Session Details screen.

**Root Cause:** 
1. Backend API created unload lines in backend database, but desktop app reads from local database
2. Desktop sync service only synced session headers, not unload/receive lines
3. Backend GET endpoint didn't return unload/receive lines

---

## ✅ Solution Implemented

### 1. Backend API - Create Unload Lines ✅

**File:** `wms-api/src/modules/cartons/cartonController.js`

**Change:** When carton status is updated to "Unloaded", the API now automatically creates an entry in `tabInboundUnloadLine`:

```javascript
// If status is "Unloaded", create entry in tabInboundUnloadLine
if (status === "Unloaded") {
  await connection.query(
    `INSERT IGNORE INTO tabInboundUnloadLine
     (parent_title, unit_type, unit_id, scanned_on, scanned_by)
     VALUES (?, 'Carton', ?, ?, ?)`,
    [inbound_session, carton_id, now, user_id || ""]
  );
}
```

**Applied to:**
- ✅ Single carton update (UPDATE path)
- ✅ Single carton update (INSERT path)
- ✅ Batch carton update (UPDATE path)
- ✅ Batch carton update (INSERT path)

---

### 2. Backend API - Return Unload/Receive Lines ✅

**File:** `wms-api/src/modules/inbound/inboundController.js`

**Change:** The `GET /api/inbound/sessions` endpoint now:
1. Fetches unload lines from `tabInboundUnloadLine`
2. Fetches receive lines from `tabInboundReceiveLine`
3. Groups lines by session
4. Returns sessions with `unload_lines` and `receive_lines` arrays

**Response Format:**
```json
[
  {
    "inbound_session": "SESSION-123",
    "asn_no": "ASN-0002",
    "status": "Active",
    ...
    "unload_lines": [
      {
        "unit_type": "Carton",
        "unit_id": "CTN-0101",
        "scanned_on": "2025-12-24T20:14:55.000Z",
        "scanned_by": "USER-172188"
      }
    ],
    "receive_lines": [
      {
        "carton_id": "CTN-0101",
        "item_code": "SKU-001",
        "expected_qty": 100,
        "received_qty": 100,
        "condition": "Good",
        "remarks": null
      }
    ]
  }
]
```

---

### 3. Desktop API Service - Parse Unload/Receive Lines ✅

**File:** `Services/InboundSessionApiService.cs`

**Changes:**
1. Added `UnloadLines` and `ReceiveLines` properties to `ApiInboundSession` model
2. Created `ApiUnloadLine` and `ApiReceiveLine` models
3. Added `JsonPropertyName` attributes for snake_case to PascalCase mapping

---

### 4. Desktop Sync Service - Sync Unload/Receive Lines ✅

**File:** `Services/InboundSessionSyncService.cs`

**Change:** The sync service now:
1. Deletes existing unload/receive lines for each session (to avoid duplicates)
2. Inserts new unload/receive lines from the API response
3. Handles errors gracefully (continues with next session if one fails)

**Logic:**
```csharp
// Sync unload lines
DELETE FROM tabInboundUnloadLine WHERE parent_title = @session_id
INSERT INTO tabInboundUnloadLine (...) VALUES (...) for each line

// Sync receive lines
DELETE FROM tabInboundReceiveLine WHERE parent_title = @session_id
INSERT INTO tabInboundReceiveLine (...) VALUES (...) for each line
```

---

## 📋 Complete Data Flow

```
1. Mobile App
   ↓ Unloads carton (status = "Unloaded")
   ↓ POST /api/cartons/update-status
   
2. Backend API
   ↓ Updates tabReceivingCarton.status = "Unloaded"
   ↓ Creates entry in tabInboundUnloadLine ✅
   ↓ Updates tabCartonStatus
   ↓ Updates tabAsnItemDetails
   
3. Desktop App Syncs
   ↓ GET /api/inbound/sessions
   ↓ Backend returns sessions with unload_lines and receive_lines ✅
   ↓ Desktop sync service syncs to local database ✅
   
4. Desktop App Displays
   ↓ Reads from local tabInboundUnloadLine and tabInboundReceiveLine
   ↓ Shows in Inbound Session Details window ✅
```

---

## ✅ Files Modified

### Backend:
1. ✅ `wms-api/src/modules/cartons/cartonController.js` - Creates unload lines
2. ✅ `wms-api/src/modules/inbound/inboundController.js` - Returns unload/receive lines

### Desktop:
1. ✅ `Services/InboundSessionApiService.cs` - Parse unload/receive lines from API
2. ✅ `Services/InboundSessionSyncService.cs` - Sync unload/receive lines to local DB

---

## 🎯 Expected Result

After restarting both backend and desktop apps:

1. ✅ **Mobile app unloads cartons** → Backend creates unload lines
2. ✅ **Desktop app syncs sessions** → Backend returns unload/receive lines
3. ✅ **Desktop sync service** → Syncs lines to local database
4. ✅ **Desktop app displays** → Shows unload/receive lines in session details

---

## ⚠️ Next Steps

1. **Restart backend API server** to apply changes
2. **Restart desktop application** to apply changes
3. **Test:** Unload a carton from mobile app, then sync desktop app
4. **Verify:** Check Inbound Session Details window shows unload lines

---

**Status:** ✅ **COMPLETE - All changes applied**  
**Action Required:** Restart backend and desktop apps

