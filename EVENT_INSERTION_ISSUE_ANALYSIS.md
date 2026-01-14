# Event Insertion Issue Analysis - tabWmsScanEvent Not Updating

## 🐛 Issue

**Problem:** Mobile app is sending events correctly, but `tabWmsScanEvent` table is not being updated.

---

## 🔍 Root Cause Analysis

### Possible Causes

#### 1. **Duplicate `offline_uuid` (Most Likely)**

The `tabWmsScanEvent` table has a **UNIQUE constraint** on `offline_uuid`:

```sql
offline_uuid VARCHAR(36) UNIQUE NOT NULL
```

The API uses `INSERT IGNORE`, which means:
- If `offline_uuid` already exists, the insert is **silently ignored**
- No error is returned, but the event is not inserted
- `insertedCount` is incremented, but no row is actually inserted

**Check:**
```sql
-- Check for duplicate offline_uuid
SELECT offline_uuid, COUNT(*) as count
FROM tabWmsScanEvent
GROUP BY offline_uuid
HAVING COUNT(*) > 1;
```

**Solution:** Mobile app must generate **unique** `offline_uuid` for each event.

---

#### 2. **Transfer Carton Status Validation**

Events are rejected if the Transfer Carton is Sealed/Dispatched:

```javascript
if (tcStatus === 'Sealed' || tcStatus === 'Dispatched' || tcStatus === 'Completed') {
  errors.push({
    offline_uuid: offline_uuid || 'MISSING',
    error: `Transfer carton ${tc_id} is ${tcStatus} and cannot accept new items`
  });
  continue; // Skip this event
}
```

**Check:** Verify Transfer Carton status in the database.

---

#### 3. **Carton Validation Failure**

For carton-level inventory mode, events are rejected if:
- `carton_id` is missing
- Carton doesn't exist in `tabCartonStock`
- Carton is not at the specified `source_bin`

**Check:**
```sql
-- Check if carton exists in tabCartonStock
SELECT carton_id, item_code, bin_location, qty, status
FROM tabCartonStock
WHERE carton_id = 'CTN-XXXXX'
  AND item_code = 'SKU-XXXXX';
```

---

#### 4. **Duplicate Event Check**

For `PACK_BOX_TO_TC` events, duplicates are checked and skipped:

```javascript
if (existingEvents[0].count > 0) {
  console.log(`Skipping duplicate PACK_BOX_TO_TC event...`);
  continue; // Skip this event - duplicate already exists
}
```

**Check:** Verify if similar events already exist.

---

#### 5. **Missing Required Fields**

Events are rejected if required fields are missing:

```javascript
if (!offline_uuid || !event_type || !event_time || !device_id || !user_id) {
  errors.push({
    offline_uuid: offline_uuid || 'MISSING',
    error: 'Missing required fields: offline_uuid, event_type, event_time, device_id, user_id'
  });
  continue;
}
```

**Required Fields:**
- `offline_uuid`
- `event_type`
- `event_time`
- `device_id`
- `user_id`

---

## 🔧 Diagnostic Steps

### Step 1: Run Diagnostic Script

```sql
-- Run SCRIPTS/DiagnoseEventInsertion.sql
-- This will show:
-- - Recent events
-- - Duplicate offline_uuid
-- - Table structure
-- - Missing required fields
-- - Transfer Carton status
-- - Carton stock validation
```

### Step 2: Check API Response

The API returns a response with `processed` and `failed` counts:

```json
{
  "ok": true,
  "processed": 0,  // ← Check this
  "failed": 1,     // ← Check this
  "failed_events": [
    {
      "offline_uuid": "...",
      "error": "..."  // ← Check error message
    }
  ]
}
```

**Check the mobile app logs** to see what error is being returned.

---

### Step 3: Check Server Logs

The API logs warnings and errors:

```javascript
console.warn(`⚠️  Rejecting ${event_type} event: ...`);
console.log(`✅ Inserted event: ${event_type} (${offline_uuid.substring(0, 8)}...)`);
```

**Check the server console/logs** for these messages.

---

## ✅ Solutions

### Solution 1: Fix Duplicate `offline_uuid`

**Mobile App Fix:**

```javascript
// Generate unique offline_uuid for each event
function generateOfflineUuid() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
}

// Use it when creating events
const event = {
  offline_uuid: generateOfflineUuid(),  // ✅ Must be unique
  event_type: 'PACK_ITEM_TO_TC',
  // ... other fields
};
```

**Or use UUID library:**

```javascript
import { v4 as uuidv4 } from 'uuid';

const event = {
  offline_uuid: uuidv4(),  // ✅ Guaranteed unique
  // ... other fields
};
```

---

### Solution 2: Check Transfer Carton Status

**Before sending events, verify TC status:**

```javascript
// Check TC status before packing
const tcResponse = await fetch(`/api/transfer-cartons/${tcId}`, {
  headers: { Authorization: `Bearer ${token}` }
});

const tcData = await tcResponse.json();
if (tcData.data.status === 'Sealed' || tcData.data.status === 'Dispatched') {
  console.error('Cannot pack items: Transfer Carton is already sealed/dispatched');
  return;
}
```

---

### Solution 3: Verify Carton Exists

**Before sending events, verify carton exists:**

```javascript
// Check if carton exists in stock
const stockResponse = await fetch(`/api/stock/ledger?bin_location=${sourceBin}&carton_id=${cartonId}`, {
  headers: { Authorization: `Bearer ${token}` }
});

const stockData = await stockResponse.json();
if (stockData.data.length === 0) {
  console.error('Cannot pack items: Carton not found in stock');
  return;
}
```

---

### Solution 4: Check API Response

**Mobile App Should Check Response:**

```javascript
const response = await fetch('/api/events/batch', {
  method: 'POST',
  body: JSON.stringify({ events: [event] })
});

const data = await response.json();

if (!data.ok) {
  console.error('API Error:', data.error);
  return;
}

if (data.failed > 0) {
  console.error('Failed Events:', data.failed_events);
  // Check error messages
  data.failed_events.forEach(failed => {
    console.error(`Event ${failed.offline_uuid}: ${failed.error}`);
  });
}

if (data.processed === 0) {
  console.warn('No events were processed. Check failed_events for details.');
}
```

---

## 📋 Checklist

- [ ] Run `SCRIPTS/DiagnoseEventInsertion.sql` to check for issues
- [ ] Check mobile app logs for API response errors
- [ ] Check server logs for warning/error messages
- [ ] Verify `offline_uuid` is unique for each event
- [ ] Verify Transfer Carton status is not Sealed/Dispatched
- [ ] Verify carton exists in `tabCartonStock` (if carton-level mode)
- [ ] Verify all required fields are present
- [ ] Check API response for `failed_events` array

---

## 🔍 Quick Test

**Test Event Insertion:**

```bash
curl -X POST http://localhost:3000/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "events": [
      {
        "offline_uuid": "test-' + Date.now() + '",
        "event_type": "PACK_ITEM_TO_TC",
        "event_time": "2026-01-13T12:00:00Z",
        "device_id": "TEST-DEVICE",
        "user_id": "TEST-USER",
        "item_code": "SKU-TEST",
        "qty": 1,
        "tc_id": "TC-TEST",
        "carton_id": "CTN-TEST"
      }
    ]
  }'
```

**Check Response:**
- `processed: 1` → Event inserted successfully
- `processed: 0, failed: 1` → Check `failed_events` for error

---

**Status:** 🔍 **INVESTIGATION REQUIRED**  
**Date:** 2026-01-13
