# Mobile App Quantity Update Guide

## Issue: Quantity Not Updating to Backend

If the mobile app shows scanned items but the backend doesn't reflect the quantity, check the following:

## 1. Verify Mobile App is Sending Events

The mobile app **MUST** send packing events to the backend API when items are scanned.

### Required API Call

**Endpoint:** `POST /api/events/batch`

**Request Body (Normal Scan - Adds to Total):**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-12T16:10:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 1.0,
      "carton_id": "PAW-ASN365425473-1768138301111",
      "tc_id": "TC-MR-123459-1768206191091",
      "transfer_order": "MR-123459",
      "source_bin": "A1-R02-L1-B2",
      "store": "STORE-002"
    }
  ]
}
```

**Request Body (Update Mode - Replaces Total):**
```json
{
  "update_mode": true,
  "events": [
    {
      "tc_id": "TC-MR-123459-1768206191091",
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "qty": 2.0,
      "user_id": "USER-150526"
    }
  ]
}
```

## 2. Check Database for Events

Run this script to verify events are being stored:

```bash
cd wms-api
node check-mobile-events.js
```

**Expected Output:**
- Events should exist in `tabWmsScanEvent` table
- Events should have `tc_id` matching the transfer carton
- Events should have `event_type = 'PACK_ITEM_TO_TC'`
- Total quantity should match mobile app display

## 3. Common Issues

### Issue 1: Mobile App Not Sending Events

**Symptom:** Mobile app shows "2 item(s) scanned" but database has 0 events

**Fix:** Mobile app must call `POST /api/events/batch` after each scan

### Issue 2: Events Sent Without `tc_id`

**Symptom:** Events exist but don't show in Transfer Carton Details

**Fix:** Mobile app must include `tc_id` in every packing event

### Issue 3: Events Queued But Not Synced

**Symptom:** Events stored locally but not sent to backend

**Fix:** Mobile app must sync events when online (immediately or on "Submit")

### Issue 4: Update Mode Not Working

**Symptom:** Quantity shows correctly in mobile but not updating in backend

**Fix:** 
- Use `update_mode: true` to replace total quantity
- Or use normal mode and send incremental events (qty: 1 per scan)

## 4. Mobile App Implementation Checklist

- [ ] Create packing event when item is scanned
- [ ] Include `tc_id` in every packing event
- [ ] Include `carton_id` (required for carton-level inventory)
- [ ] Send event to `POST /api/events/batch` immediately (if online)
- [ ] Queue event for sync if offline
- [ ] Handle API response and show success/error
- [ ] Update local display after successful sync

## 5. Debugging Steps

### Step 1: Check Mobile App Logs

Look for:
- ✅ "Sending packing event to backend..."
- ✅ "POST /api/events/batch" API call
- ✅ Response: `{"ok": true, "inserted_count": 1}`
- ❌ Error messages

### Step 2: Check Backend Logs

Look for:
- ✅ "Processing X event(s) in batch..."
- ✅ "Inserted event: PACK_ITEM_TO_TC"
- ❌ Validation errors
- ❌ Database errors

### Step 3: Check Database

```sql
SELECT 
  item_code,
  qty,
  event_time,
  tc_id
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123459-1768206191091'
  AND item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY event_time DESC;
```

**Expected:** Should show events with quantities that sum to the total

## 6. Mobile App Code Example

```javascript
// When user scans item
async function handleItemScan(itemCode, cartonId, tcId, qty = 1) {
  // Create packing event
  const event = {
    offline_uuid: generateUUID(),
    event_type: 'PACK_ITEM_TO_TC',
    event_time: new Date().toISOString(),
    device_id: getDeviceId(),
    user_id: getUserId(),
    item_code: itemCode,
    qty: qty,
    carton_id: cartonId,
    tc_id: tcId, // ✅ REQUIRED
    transfer_order: getMaterialRequestNumber(),
    source_bin: getCurrentBinLocation(),
    store: getDestinationStore()
  };
  
  // Send to backend immediately (if online)
  if (isOnline()) {
    try {
      const response = await fetch(`${API_URL}/api/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ events: [event] })
      });
      
      const result = await response.json();
      if (result.ok && result.inserted_count > 0) {
        console.log('✅ Event synced successfully');
        updateLocalDisplay(); // Refresh quantity display
      } else {
        console.error('❌ Event sync failed:', result);
        queueForRetry(event); // Queue for later
      }
    } catch (error) {
      console.error('❌ API error:', error);
      queueForRetry(event); // Queue for later
    }
  } else {
    // Offline: queue for sync
    queueForRetry(event);
  }
}
```

## 7. Update Quantity (Replace Total)

If user wants to update/correct quantity:

```javascript
// Update total quantity (replaces all previous events)
async function updateItemQuantity(tcId, itemCode, cartonId, newTotalQty, userId) {
  const response = await fetch(`${API_URL}/api/events/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({
      update_mode: true, // ✅ Use update mode
      events: [{
        tc_id: tcId,
        item_code: itemCode,
        carton_id: cartonId,
        qty: newTotalQty, // New total (replaces all previous)
        user_id: userId
      }]
    })
  });
  
  return await response.json();
}
```

---

**Status:** ⚠️ **MOBILE APP MUST SEND EVENTS**  
**Priority:** High  
**Action Required:** Verify mobile app is calling `POST /api/events/batch` with correct format
