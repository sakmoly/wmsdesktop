# Transfer Carton Items Not Appearing - Fix

## Issue

Items scanned in the mobile app for Material Request Packing are **not appearing** in the desktop app's Transfer Carton Details window.

**Symptoms:**
- ✅ Mobile app shows items as "Scanned" (e.g., "SKU-HAT-301-GRN-OS", Qty: 2, Location: A1-R02-L1-B2)
- ❌ Desktop app shows empty "Carton Contents" table for the same Transfer Carton (TC-MR-123460-1768157787512)

## Root Cause

**Database Check Results:**
```
Transfer Carton: TC-MR-123460-1768157787512
Status: Created
Transfer Order: MR-123460

📊 Events with tc_id = 'TC-MR-123460-1768157787512': 0 ❌
📊 Events by transfer_order = 'MR-123460' (without tc_id): 0 ❌
📊 Recent packing events for SKU-HAT-301-GRN-OS: 0 ❌
```

**Problem:** The mobile app is **NOT sending packing events to the backend API**. Items are stored locally in the mobile app but never synced to the server.

## Why Items Are Not Showing

1. **No Packing Events Created**: The mobile app scans items but doesn't create `PACK_ITEM_TO_TC` or `PACK_BOX_TO_TC` events
2. **No API Calls**: The mobile app doesn't call `POST /api/events/batch` to send packing events
3. **Items Stored Locally Only**: Items exist only in mobile app's local state/database, not in backend `tabWmsScanEvent` table

## Required Fix: Mobile App Must Send Packing Events

### Step 1: Mobile App Must Create Packing Events

When a user scans an item and packs it into a transfer carton, the mobile app **MUST** create a packing event and send it to the backend:

```javascript
// When user scans item and packs it to transfer carton
const packEvent = {
  offline_uuid: generateUUID(), // Generate unique ID
  event_type: "PACK_ITEM_TO_TC",
  event_time: new Date().toISOString(),
  device_id: deviceId,
  user_id: userId,
  item_code: "SKU-HAT-301-GRN-OS",
  qty: 2.00,
  carton_id: "CTN-A1-R02-L1-B2-...", // Source carton ID (required for carton-level tracking)
  tc_id: "TC-MR-123460-1768157787512", // ✅ REQUIRED - Transfer Carton ID
  transfer_order: "MR-123460",
  store: "STORE-002",
  notes: "Packed for Material Request"
};

// Add to events queue
pendingEvents.push(packEvent);
```

### Step 2: Mobile App Must Sync Events to Backend

The mobile app **MUST** send packing events to the backend API:

**API Endpoint:**
```
POST /api/events/batch
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-11T21:56:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 2.00,
      "carton_id": "CTN-A1-R02-L1-B2-...",
      "tc_id": "TC-MR-123460-1768157787512",  // ✅ REQUIRED
      "transfer_order": "MR-123460",
      "store": "STORE-002"
    }
  ]
}
```

**Response (Success):**
```json
{
  "ok": true,
  "processed": 1,
  "failed": 0,
  "inserted_count": 1
}
```

### Step 3: Mobile App Sync Strategy

The mobile app should sync events:

1. **Immediately on scan** (if online):
   - Send event to `/api/events/batch` immediately
   - Mark event as synced if successful

2. **Queue for offline sync** (if offline):
   - Store event in local database with `offline_uuid`
   - Mark as `synced = false`
   - When connection restored, sync all pending events

3. **Batch sync** (when online):
   - Collect all pending events with `synced = false`
   - Send to `/api/events/batch`
   - Update `synced = true` for successful events

## Mobile App Workflow

### Complete Flow:

```
1. User creates Transfer Carton
   → POST /api/transfer-cartons/create
   → Store tc_id in app state: currentTcId = "TC-MR-123460-1768157787512"

2. User scans item barcode
   → Lookup item from master data
   → Show item details (SKU-HAT-301-GRN-OS, Location: A1-R02-L1-B2)

3. User confirms packing
   → Create packing event:
     {
       event_type: "PACK_ITEM_TO_TC",
       item_code: "SKU-HAT-301-GRN-OS",
       qty: 2,
       carton_id: "...", // Source carton
       tc_id: currentTcId, // ✅ MUST include!
       ...
     }

4. Send event to backend
   → POST /api/events/batch with event
   → If successful: Mark as synced
   → If failed: Queue for retry

5. Desktop app queries
   → GET /api/transfer-cartons/:tc_id
   → Returns items from tabWmsScanEvent where tc_id matches
   → Items appear in "Carton Contents" table ✅
```

## Validation Added in Backend

The backend now validates:

1. ✅ **Carton ID Required**: For carton-level inventory, `carton_id` is required in packing events
2. ✅ **TC ID Required**: Events must include `tc_id` to link to transfer carton
3. ✅ **Sealed Carton Rejection**: Sealed/Dispatched cartons reject new packing events

## Debugging Steps

### 1. Check if Events Exist

```bash
cd wms-api
node check-transfer-carton-events.js TC-MR-123460-1768157787512
```

**Expected:**
- Events should have `tc_id = 'TC-MR-123460-1768157787512'`
- Events should have `event_type IN ('PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC')`

### 2. Check Mobile App Logs

Look for:
- ✅ Event creation: "Creating packing event for SKU-HAT-301-GRN-OS"
- ✅ API call: "POST /api/events/batch"
- ✅ Response: "Event synced successfully" or error message

### 3. Check Backend Logs

Look for:
- ✅ "Processing X event(s) in batch..."
- ✅ "Updated task TC-MR-123460-1768157787512: ..."
- ❌ "Rejecting PACK_ITEM_TO_TC event: ..." (validation errors)

## Current Status

**Database Check:**
- ✅ Transfer Carton exists: `TC-MR-123460-1768157787512`
- ❌ **0 packing events** with `tc_id = 'TC-MR-123460-1768157787512'`
- ❌ **0 packing events** with `transfer_order = 'MR-123460'`
- ❌ **0 packing events** for item `SKU-HAT-301-GRN-OS`

**Conclusion:** The mobile app is **NOT sending packing events to the backend**. Items need to be synced.

## Solution

**Mobile App MUST:**
1. ✅ Create packing events when items are scanned
2. ✅ Include `tc_id` in all packing events
3. ✅ Include `carton_id` for carton-level inventory
4. ✅ Send events to `/api/events/batch` endpoint
5. ✅ Handle offline sync queue
6. ✅ Retry failed events

**Without these changes, items will never appear in the desktop app's Transfer Carton Details.**

---

**Status:** ⚠️ **MOBILE APP ISSUE - Events Not Being Sent**  
**Date:** 2026-01-11  
**Next Steps:** Mobile app development team needs to implement event creation and sync
